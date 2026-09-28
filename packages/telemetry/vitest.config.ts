import { defineConfig } from 'vitest/config'

// 순수 TS라 브라우저 API가 필요 없다 (.claude/rules/test-strategy.md)
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' }
})
