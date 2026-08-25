import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.ts'],
    testTimeout: 15000
  },
  resolve: {
    alias: {
      // Stub out Electron so main-process code can be unit-tested in Node
      electron: resolve(__dirname, 'src/tests/__mocks__/electron.ts'),
      // Point repo imports at the test-scoped in-memory DB
      '../db': resolve(__dirname, 'src/tests/__mocks__/db.ts'),
      '../../db': resolve(__dirname, 'src/tests/__mocks__/db.ts'),
      '../main/db': resolve(__dirname, 'src/tests/__mocks__/db.ts')
    }
  }
})
