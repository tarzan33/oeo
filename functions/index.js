const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// --- 打卡紀錄建立觸發器（審計日誌 & 重複偵測） ---
exports.onAttendanceCreated = functions.firestore
  .document('artifacts/{appId}/public/data/attendance/{docId}')
  .onCreate(async (snap, context) => {
    const { appId } = context.params;
    const attendance = snap.data();
    const now = new Date();

    try {
      // 1. 檢查是否為重複打卡
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const recentSnap = await db.collection(`artifacts/${appId}/public/data/attendance`)
        .where('employeeId', '==', attendance.employeeId)
        .where('timestamp', '>=', todayStart)
        .orderBy('timestamp', 'desc')
        .limit(2) // 取最新兩筆（包含剛建立的）
        .get();

      let isDuplicate = false;
      if (recentSnap.docs.length >= 2) {
        const previousRecord = recentSnap.docs[1].data();
        const timeDiffMinutes = (attendance.timestamp - previousRecord.timestamp) / (1000 * 60);
        
        // 同類型打卡 + 5分鐘內 = 重複
        isDuplicate = previousRecord.punchType === attendance.punchType && timeDiffMinutes < 5;
      }

      // 2. 記錄審計日誌
      const auditLog = {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        employeeId: attendance.employeeId,
        employeeName: attendance.employeeName,
        employeeTitle: attendance.employeeTitle,
        punchType: attendance.punchType,
        punchTime: attendance.timeStr,
        punchDate: attendance.dateStr,
        isDuplicate: isDuplicate,
        status: isDuplicate ? 'REJECTED' : 'ACCEPTED',
        reason: isDuplicate ? '同類型打卡於5分鐘內重複' : '正常打卡',
        details: {
          docId: snap.id,
          clientTimestamp: new Date(attendance.timestamp)
        }
      };

      await db.collection(`artifacts/${appId}/public/data/audit_logs`).add(auditLog);

      // 3. 如果是重複打卡，發送管理員通知
      if (isDuplicate) {
        await notifyAdminOfDuplicatePunch(appId, attendance, snap.id);
      }

    } catch (error) {
      console.error('審計日誌記錄失敗:', error);
      // 記錄系統錯誤但不中斷打卡流程
      await logSystemError(appId, 'onAttendanceCreated', error);
    }
  });

// --- 重複打卡通知函數 ---
async function notifyAdminOfDuplicatePunch(appId, attendance, attendanceDocId) {
  try {
    // 取得應用的管理員列表（從 config 中讀取）
    const configSnap = await db.collection(`artifacts/${appId}/public/config`).doc('admins').get();
    const adminUids = configSnap.exists ? configSnap.data().adminUids || [] : [];

    // 為每個管理員創建通知
    const notificationPromises = adminUids.map(adminUid => {
      return db.collection(`artifacts/${appId}/public/data/notifications`).add({
        userId: adminUid,
        type: 'DUPLICATE_PUNCH_DETECTED',
        title: '⚠️ 偵測到重複打卡',
        message: `${attendance.employeeName}(${attendance.employeeTitle}) 於 ${attendance.timeStr} 進行重複打卡(${attendance.punchType})`,
        severity: 'WARNING',
        employeeId: attendance.employeeId,
        employeeName: attendance.employeeName,
        employeeTitle: attendance.employeeTitle,
        punchType: attendance.punchType,
        punchTime: attendance.timeStr,
        punchDate: attendance.dateStr,
        attendanceDocId: attendanceDocId,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天後過期
      });
    });

    await Promise.all(notificationPromises);
    console.log(`✅ 已向 ${adminUids.length} 位管理員發送重複打卡通知`);

  } catch (error) {
    console.error('發送管理員通知失敗:', error);
    await logSystemError(appId, 'notifyAdminOfDuplicatePunch', error);
  }
}

// --- 異常行為監測（連續重複打卡） ---
exports.detectAnomalousPatterns = functions.firestore
  .document('artifacts/{appId}/public/data/audit_logs/{logId}')
  .onCreate(async (snap, context) => {
    const { appId } = context.params;
    const auditLog = snap.data();

    if (auditLog.status !== 'REJECTED') return;

    try {
      // 查詢該員工近24小時的重複打卡次數
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const duplicateCountSnap = await db.collection(`artifacts/${appId}/public/data/audit_logs`)
        .where('employeeId', '==', auditLog.employeeId)
        .where('isDuplicate', '==', true)
        .where('timestamp', '>=', oneDayAgo)
        .get();

      // 如果24小時內重複打卡超過3次，發送警告通知
      if (duplicateCountSnap.docs.length >= 3) {
        await notifyAdminOfAnomalousPattern(appId, auditLog, duplicateCountSnap.docs.length);
      }

    } catch (error) {
      console.error('異常行為偵測失敗:', error);
    }
  });

// --- 異常行為通知函數 ---
async function notifyAdminOfAnomalousPattern(appId, auditLog, duplicateCount) {
  try {
    const configSnap = await db.collection(`artifacts/${appId}/public/config`).doc('admins').get();
    const adminUids = configSnap.exists ? configSnap.data().adminUids || [] : [];

    const notificationPromises = adminUids.map(adminUid => {
      return db.collection(`artifacts/${appId}/public/data/notifications`).add({
        userId: adminUid,
        type: 'ANOMALOUS_PUNCH_PATTERN',
        title: '🚨 異常打卡行為警告',
        message: `${auditLog.employeeName} 在24小時內重複打卡${duplicateCount}次，請確認是否為系統異常或故意行為。`,
        severity: 'CRITICAL',
        employeeId: auditLog.employeeId,
        employeeName: auditLog.employeeName,
        employeeTitle: auditLog.employeeTitle,
        duplicateCount: duplicateCount,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天後過期
      });
    });

    await Promise.all(notificationPromises);
    console.log(`🚨 已向 ${adminUids.length} 位管理員發送異常行為警告`);

  } catch (error) {
    console.error('異常行為通知失敗:', error);
  }
}

// --- 系統錯誤日誌函數 ---
async function logSystemError(appId, functionName, error) {
  try {
    await db.collection(`artifacts/${appId}/public/data/system_logs`).add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      functionName: functionName,
      errorMessage: error.message,
      errorStack: error.stack,
      severity: 'ERROR'
    });
  } catch (e) {
    console.error('系統錯誤日誌寫入失敗:', e);
  }
}

// --- HTTP 觸發器：查詢審計日誌（管理員API） ---
exports.getAuditLogs = functions.https.onRequest(async (req, res) => {
  const { appId } = req.query;
  const { startDate, endDate, employeeId } = req.body;

  if (!appId) {
    return res.status(400).json({ error: 'appId is required' });
  }

  try {
    // 驗證請求者是否為管理員
    const decodedToken = await admin.auth().verifyIdToken(req.headers.authorization?.split(' ')[1]);
    if (!decodedToken.admin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    let query = db.collection(`artifacts/${appId}/public/data/audit_logs`);

    // 應用時間範圍過濾
    if (startDate) {
      query = query.where('timestamp', '>=', new Date(startDate));
    }
    if (endDate) {
      query = query.where('timestamp', '<=', new Date(endDate));
    }

    // 應用員工過濾
    if (employeeId) {
      query = query.where('employeeId', '==', employeeId);
    }

    const snapshot = await query.orderBy('timestamp', 'desc').get();
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });

  } catch (error) {
    console.error('查詢審計日誌失敗:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve audit logs',
      message: error.message 
    });
  }
});

// --- HTTP 觸發器：取得管理員通知 ---
exports.getNotifications = functions.https.onRequest(async (req, res) => {
  const { appId } = req.query;

  if (!appId) {
    return res.status(400).json({ error: 'appId is required' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(req.headers.authorization?.split(' ')[1]);
    const userId = decodedToken.uid;

    const snapshot = await db.collection(`artifacts/${appId}/public/data/notifications`)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      count: notifications.length,
      data: notifications
    });

  } catch (error) {
    console.error('查詢通知失敗:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve notifications',
      message: error.message 
    });
  }
});

// --- HTTP 觸發器：標記通知為已讀 ---
exports.markNotificationAsRead = functions.https.onRequest(async (req, res) => {
  const { appId, notificationId } = req.body;

  if (!appId || !notificationId) {
    return res.status(400).json({ error: 'appId and notificationId are required' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(req.headers.authorization?.split(' ')[1]);
    const userId = decodedToken.uid;

    const notifRef = db.doc(`artifacts/${appId}/public/data/notifications/${notificationId}`);
    const notifSnap = await notifRef.get();

    if (!notifSnap.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notifSnap.data().userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await notifRef.update({ isRead: true });

    res.json({ success: true, message: 'Notification marked as read' });

  } catch (error) {
    console.error('更新通知狀態失敗:', error);
    res.status(500).json({ 
      error: 'Failed to update notification',
      message: error.message 
    });
  }
});

console.log('✅ Cloud Functions 已部署：');
console.log('  - onAttendanceCreated: 打卡紀錄觸發器');
console.log('  - detectAnomalousPatterns: 異常行為偵測');
console.log('  - getAuditLogs: 審計日誌查詢API');
console.log('  - getNotifications: 通知查詢API');
console.log('  - markNotificationAsRead: 標記已讀API');
