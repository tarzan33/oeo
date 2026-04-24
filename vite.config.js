import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
    open: true,
  },
  define: {
    // These will be replaced during Firebase Artifact deployment
    __firebase_config: JSON.stringify(process.env.FIREBASE_CONFIG || '{}'),
    __app_id: JSON.stringify(process.env.APP_ID || 'kindergarten-punch-system'),
    __initial_auth_token: JSON.stringify(process.env.INITIAL_AUTH_TOKEN || ''),
  },
});
