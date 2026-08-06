import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      delve: resolve(__dirname, 'app/javascript/delve')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./client/src/test-setup.js']
  }
})
