import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { serve } from '@hono/node-server'

import { createApp } from './app'
import { loadConfig } from './config'
import { openDatabase } from './db'
import * as log from './log'

const ENV_FILE = '.env'
const DATABASE_FILE = 'collector.sqlite'
const RECORDINGS_DIR = 'recordings'

const start = async () => {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
  const config = loadConfig(process.env)
  if (!config.ok) {
    log.error(`설정 오류: ${config.error}`)
    process.exit(1)
  }

  const { port, hostname, dataDir, teamTokens } = config.value
  const recordingsDir = path.join(dataDir, RECORDINGS_DIR)
  await mkdir(recordingsDir, { recursive: true })
  const db = openDatabase(path.join(dataDir, DATABASE_FILE))

  const app = createApp({ db, recordingsDir, teamTokens })
  const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
    log.info(
      `수집 서버 시작: http://${info.address}:${info.port} (팀 ${teamTokens.length}개, 데이터 ${dataDir})`
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
