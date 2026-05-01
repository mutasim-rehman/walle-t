import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_BACKEND_LINK': JSON.stringify(
      process.env.VITE_BACKEND_LINK || process.env.BACKEND_LINK || ''
    ),
  },
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
