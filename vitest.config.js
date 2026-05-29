import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      delve: resolve(__dirname, 'app/javascript/delve')
    }
  },
  test: {
    environment: 'node'
  }
})
