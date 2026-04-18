import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/psx': {
        target: 'https://dps.psx.com.pk',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/psx/, ''),
      },
    },
  },
})
