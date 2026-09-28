import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'

import { createApp } from './app'
import { loadConfig } from './config'
import { openDatabase } from './db'
import * as log from './log'

const ENV_FILE = '.env'
const DATABASE_FILE = 'collector.sqlite'
const RECORDINGS_DIR = 'recordings'
const DESIGN_CSS_SPECIFIER = '@meeting-stt/design/base.css'

/**
 * 관리자 페이지가 앱과 같은 디자인 토큰을 쓰도록 base.css를 읽는다.
 * 배포 이미지에는 node_modules가 없어 Dockerfile이 파일을 복사하고 COLLECTOR_DESIGN_CSS로 위치를 알려 준다
 */
const loadDesignCss = () => {
  const cssPath =
    process.env.COLLECTOR_DESIGN_CSS || fileURLToPath(import.meta.resolve(DESIGN_CSS_SPECIFIER))
  return readFile(cssPath, 'utf8')
}

const start = async () => {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
  const config = loadConfig(process.env)
  if (!config.ok) {
    log.error(`설정 오류: ${config.error}`)
    process.exit(1)
  }

  const { port, hostname, dataDir, teamTokens, adminPassword } = config.value
  const recordingsDir = path.join(dataDir, RECORDINGS_DIR)
  await mkdir(recordingsDir, { recursive: true })
  const db = openDatabase(path.join(dataDir, DATABASE_FILE))

  const admin = adminPassword
    ? { password: adminPassword, designCss: await loadDesignCss() }
    : undefined
  const app = createApp({ db, recordingsDir, teamTokens, admin })
  const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
    log.info(
      `수집 서버 시작: http://${info.address}:${info.port} (팀 ${teamTokens.length}개, 데이터 ${dataDir})`
    )
    log.info(
      admin
        ? `관리자 페이지: http://${info.address}:${info.port}/admin (사용자 admin)`
        : '관리자 페이지 꺼짐 (COLLECTOR_ADMIN_PASSWORD 없음)'
    )
  })

  const shutdown = (signal: string) => {
    log.info(`${signal} 수신, 종료합니다`)
    server.close(() => {
      db.close()
      process.exit(0)
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start().catch((caught: unknown) => {
  log.error(`시작 실패: ${log.messageOf(caught)}`)
  process.exit(1)
})
