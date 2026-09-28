/**
 * 개발 환경: 로컬 수집 서버와 데스크탑 앱을 한 번에 띄운다 (telemetry.md "환경").
 * 팀 토큰은 실행마다 새로 만들어 두 프로세스에 환경 변수로 넣는다 — 저장소에 토큰 파일을 두지 않기 위해서다.
 *
 * 저장소 루트에서: pnpm dev:stack
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
const COLLECTOR_HOST = '127.0.0.1'
const DEFAULT_COLLECTOR_PORT = 8787
const DEV_TEAM_ID = 'dev'
const DEV_DATA_DIR = './data/dev'
const TOKEN_BYTES = 32
const ADMIN_PASSWORD_BYTES = 12
const HEALTH_POLL_MS = 300
const HEALTH_TIMEOUT_MS = 30_000
const SHUTDOWN_GRACE_MS = 5_000

const APP_SUPPORT_DIR = path.join(homedir(), 'Library', 'Application Support')
/** 이 브랜치 데스크탑의 productName. 공개 빌드(meeting-stt)와 userData가 갈라진다 */
const TEAM_USER_DATA_DIR = path.join(APP_SUPPORT_DIR, 'meeting-stt-team')
const PUBLIC_USER_DATA_DIR = path.join(APP_SUPPORT_DIR, 'meeting-stt')
const MODELS_DIR_NAME = 'models'

const ANSI_RESET = '\u001b[0m'
const ANSI_CYAN = '\u001b[36m'
const ANSI_MAGENTA = '\u001b[35m'
const ANSI_YELLOW = '\u001b[33m'

const collectorPort = Number(process.env.DEV_STACK_COLLECTOR_PORT) || DEFAULT_COLLECTOR_PORT
const collectorUrl = `http://${COLLECTOR_HOST}:${collectorPort}`
const teamToken = randomBytes(TOKEN_BYTES).toString('hex')
const adminPassword = randomBytes(ADMIN_PASSWORD_BYTES).toString('hex')

const say = (message: string) =>
  process.stdout.write(`${ANSI_YELLOW}[stack]${ANSI_RESET} ${message}\n`)

interface StartParams {
  label: string
  color: string
  filter: string
  env: NodeJS.ProcessEnv
}

/** 줄마다 접두어를 붙여 두 프로세스 로그를 한 터미널에서 구분한다 */
const start = ({ label, color, filter, env }: StartParams) => {
  const child = spawn('pnpm', ['--filter', filter, 'run', 'dev'], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // pnpm이 띄운 손자 프로세스(electron, tsx)까지 한 번에 끄려고 프로세스 그룹을 따로 만든다
    detached: true
  })
  const prefix = `${color}[${label}]${ANSI_RESET} `
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) =>
      process.stdout.write(`${prefix}${line}\n`)
    )
  }
  return child
}

const children: ChildProcess[] = []
let isShuttingDown = false

const stopAll = (exitCode: number) => {
  if (isShuttingDown) return
  isShuttingDown = true
  say('종료합니다')
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch (caught) {
      say(`프로세스 그룹 ${child.pid} 종료 실패: ${String(caught)}`)
    }
  }
  setTimeout(() => process.exit(exitCode), SHUTDOWN_GRACE_MS).unref()
  Promise.all(
    children.map((child) =>
      child.exitCode !== null ? null : new Promise((resolve) => child.once('exit', resolve))
    )
  ).then(() => process.exit(exitCode))
}

const waitForHealth = async () => {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${collectorUrl}/health`)
      if (response.ok) return true
    } catch {
      // 서버가 아직 포트를 열지 않았다. 다음 폴링에서 다시 본다
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS))
  }
  return false
}

/** 팀 userData에 모델이 없으면 공개 빌드가 받아 둔 모델을 링크해 온보딩 재다운로드를 건너뛴다 (telemetry.md "환경") */
const linkDevModels = async () => {
  const target = path.join(TEAM_USER_DATA_DIR, MODELS_DIR_NAME)
  const source = path.join(PUBLIC_USER_DATA_DIR, MODELS_DIR_NAME)
  if (existsSync(target) || !existsSync(source)) return
  await mkdir(TEAM_USER_DATA_DIR, { recursive: true })
  await symlink(source, target)
  say(`모델 폴더 링크: ${target} → ${source}`)
}

const main = async () => {
  await linkDevModels()
  say(
    `수집 서버 ${collectorUrl}, 팀 "${DEV_TEAM_ID}", 데이터 apps/collector/${DEV_DATA_DIR.slice(2)}`
  )
  say(`이번 실행의 개발 팀 토큰: ${teamToken}`)
  say(`관리자 페이지: ${collectorUrl}/admin (사용자 admin, 비밀번호 ${adminPassword})`)

  const collector = start({
    label: 'collector',
    color: ANSI_CYAN,
    filter: '@meeting-stt/collector',
    env: {
      ...process.env,
      COLLECTOR_HOST,
      COLLECTOR_PORT: String(collectorPort),
      COLLECTOR_DATA_DIR: DEV_DATA_DIR,
      COLLECTOR_TEAM_TOKENS: `${DEV_TEAM_ID}:${teamToken}`,
      COLLECTOR_ADMIN_PASSWORD: adminPassword
    }
  })
  children.push(collector)
  collector.once('exit', (code) => {
    say(`수집 서버가 종료됐습니다 (코드 ${code})`)
    stopAll(code ?? 1)
  })

  if (!(await waitForHealth())) {
    say(
      `수집 서버가 ${HEALTH_TIMEOUT_MS / 1000}초 안에 뜨지 않았습니다. 포트 ${collectorPort}를 다른 프로세스가 쓰는지 확인하세요 (DEV_STACK_COLLECTOR_PORT로 변경)`
    )
    stopAll(1)
    return
  }
  say('수집 서버 준비됨 → 데스크탑 앱을 띄웁니다')

  const desktop = start({
    label: 'desktop',
    color: ANSI_MAGENTA,
    filter: 'meeting-stt',
    env: {
      ...process.env,
      MAIN_VITE_COLLECTOR_URL: collectorUrl,
      MAIN_VITE_COLLECTOR_TEAM_TOKEN: teamToken
    }
  })
  children.push(desktop)
  desktop.once('exit', (code) => {
    say(`데스크탑 앱이 종료됐습니다 (코드 ${code})`)
    stopAll(code ?? 0)
  })
  say(
    `받은 데이터 확인: 브라우저로 ${collectorUrl}/admin 또는 다른 터미널에서 pnpm collector:inspect`
  )
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

main().catch((caught: unknown) => {
  say(`시작 실패: ${String(caught)}`)
  stopAll(1)
})
