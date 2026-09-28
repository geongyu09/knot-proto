import { defineConfig } from 'vitest/config'

// 서버를 띄우지 않고 app.request()로 라우트를 부른다. DB는 :memory:, 녹음은 임시 폴더
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' }
})
