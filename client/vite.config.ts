import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Determine API port based on client port
  const clientPort = 5173
  const apiPort = process.env.VITE_API_PORT || '3002'

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true
        }
      }
    },
    define: {
      // Make environment info available at build time
      __DEV_MODE__: mode === 'development',
      __CLIENT_PORT__: clientPort,
      __API_PORT__: apiPort
    }
  }
})
