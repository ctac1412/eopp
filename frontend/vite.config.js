import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/stream': {
        target: 'http://127.0.0.1:8765',
        ws: false,
      },
      '/solve-captcha': {
        target: 'http://127.0.0.1:8765',
      },
      '/solve': {
        target: 'http://127.0.0.1:8765',
      },
      '/broadcast': {
        target: 'http://127.0.0.1:8765',
      },
      '/injector-script': {
        target: 'http://127.0.0.1:8765',
      },
    },
  },
})
