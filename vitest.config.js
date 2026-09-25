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
    setupFiles: ['./client/src/test-setup.js'],
    // Default pool spins up a fresh jsdom per test file (69s/120 files
    // locally, 62% of total run time) - isolate:false shares one jsdom per
    // worker instead, much less overhead on low-core machines (remote dev
    // box, CI runners) where that setup cost can't be parallelized away.
    // (vitest's other suggestion, pool:'vmThreads', does the same thing but
    // runs each file in a real vm context - broke `delete window.location`
    // in ~13 GithubAuthError-redirect tests and jsdom's `crypto.subtle` in
    // checksum.test.js, both known jsdom/vm-context gaps, not worth
    // touching real test files to work around.)
    pool: 'vmThreads'
  }
})
