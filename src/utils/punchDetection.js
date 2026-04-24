/**
 * 重複打孔偵測工具函數
 * 防止同一員工在短時間內重複打卡
 */

/**
 * 檢查是否存在重複打孔
 * @param {Array} attendance - 所有打卡記錄
 * @param {string} employeeId - 員工ID
 * @param {string} punchType - 打卡類型
 * @param {number} toleranceMinutes - 容許的時間差（分鐘），預設5分鐘
 * @returns {Object} { isDuplicate: boolean, lastPunch: object|null, minutesSinceLastPunch: number|null }
 */
export const checkDuplicatePunch = (
  attendance,
  employeeId,
  punchType,
  toleranceMinutes = 5
) => {
  if (!attendance || attendance.length === 0) {
    return {
      isDuplicate: false,
      lastPunch: null,
      minutesSinceLastPunch: null
    };
  }

  const now = new Date().getTime();

  // 找出該員工最近的同類型打卡記錄
  const lastPunchOfSameType = attendance
    .filter(record => record.employeeId === employeeId && record.punchType === punchType)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!lastPunchOfSameType) {
    return {
      isDuplicate: false,
      lastPunch: null,
      minutesSinceLastPunch: null
    };
  }

  const minutesDiff = (now - lastPunchOfSameType.timestamp) / (1000 * 60);

  // 如果距離上次同類型打卡少於容許時間，判定為重複
  if (minutesDiff < toleranceMinutes) {
    return {
      isDuplicate: true,
      lastPunch: lastPunchOfSameType,
      minutesSinceLastPunch: Math.round(minutesDiff * 10) / 10
    };
  }

  return {
    isDuplicate: false,
    lastPunch: lastPunchOfSameType,
    minutesSinceLastPunch: Math.round(minutesDiff * 10) / 10
  };
};

/**
 * 檢查當日的完整打卡流程合法性
 * 預期順序：上班 -> 休息開始 -> 休息結束 -> 下班
 * @param {Array} attendance - 所有打卡記錄
 * @param {string} employeeId - 員工ID
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns {Object} { isValid: boolean, punches: Array, issues: Array }
 */
export const validateDailyPunchSequence = (attendance, employeeId, dateStr) => {
  const VALID_SEQUENCE = ['上班', '休息開始', '休息結束', '下班'];

  const todayPunches = attendance
    .filter(record => record.employeeId === employeeId && record.dateStr === dateStr)
    .sort((a, b) => a.timestamp - b.timestamp);

  const issues = [];
  let isValid = true;

  if (todayPunches.length === 0) {
    return {
      isValid: true,
      punches: [],
      issues: []
    };
  }

  // 檢查順序
  let expectedIndex = 0;
  const usedTypes = new Set();

  todayPunches.forEach((punch, idx) => {
    // 檢查是否出現重複的同類型打卡
    if (usedTypes.has(punch.punchType)) {
      issues.push(`${punch.timeStr} 重複的「${punch.punchType}」打卡`);
      isValid = false;
    }
    usedTypes.add(punch.punchType);

    // 檢查順序
    const currentIndex = VALID_SEQUENCE.indexOf(punch.punchType);
    if (currentIndex !== -1) {
      if (currentIndex !== expectedIndex) {
        if (currentIndex > expectedIndex) {
          issues.push(`${punch.timeStr} 跳過了「${VALID_SEQUENCE[expectedIndex]}」步驟`);
        } else {
          issues.push(`${punch.timeStr} 打卡順序錯誤（應在「${VALID_SEQUENCE[expectedIndex]}」之後）`);
        }
        isValid = false;
      }
      expectedIndex = currentIndex + 1;
    }
  });

  return {
    isValid,
    punches: todayPunches,
    issues
  };
};

/**
 * 獲取該員工今日的打卡狀態摘要
 * @param {Array} attendance - 所有打卡記錄
 * @param {string} employeeId - 員工ID
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns {Object} { hasCheckedIn: boolean, hasCheckedOut: boolean, isOnBreak: boolean, lastPunchType: string|null }
 */
export const getTodayPunchStatus = (attendance, employeeId, dateStr) => {
  const todayPunches = attendance
    .filter(record => record.employeeId === employeeId && record.dateStr === dateStr)
    .sort((a, b) => a.timestamp - b.timestamp);

  let hasCheckedIn = false;
  let hasCheckedOut = false;
  let isOnBreak = false;
  let lastPunchType = null;

  todayPunches.forEach(punch => {
    if (punch.punchType === '上班') hasCheckedIn = true;
    if (punch.punchType === '下班') hasCheckedOut = true;
    if (punch.punchType === '休息開始') isOnBreak = true;
    if (punch.punchType === '休息結束') isOnBreak = false;
    lastPunchType = punch.punchType;
  });

  return {
    hasCheckedIn,
    hasCheckedOut,
    isOnBreak,
    lastPunchType,
    totalPunches: todayPunches.length
  };
};

/**
 * 生成詳細的重複打孔警告信息
 * @param {Object} duplicationCheck - checkDuplicatePunch 的返回結果
 * @param {string} employeeName - 員工姓名
 * @param {string} punchType - 打卡類型
 * @returns {string} 警告信息
 */
export const generateDuplicatePunchWarning = (
  duplicationCheck,
  employeeName,
  punchType
) => {
  const { minutesSinceLastPunch, lastPunch } = duplicationCheck;

  if (!duplicationCheck.isDuplicate) {
    return '';
  }

  const lastPunchTime = lastPunch.timeStr;
  return `⚠️ 重複打卡警告！\n${employeeName} 於 ${lastPunchTime} 已經進行過「${punchType}」，\n距離現在不到 ${minutesSinceLastPunch} 分鐘。\n\n確定要再次打卡嗎？`;
};
