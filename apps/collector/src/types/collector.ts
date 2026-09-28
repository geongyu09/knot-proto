import type { DatabaseSync } from 'node:sqlite'

/** 인증 미들웨어가 채워 라우트가 읽는 요청 컨텍스트 */
export interface CollectorEnv {
  Variables: {
    teamId: string
  }
}

export interface TeamToken {
  teamId: string
  token: string
}

export interface CollectorConfig {
  port: number
  hostname: string
  dataDir: string
  teamTokens: TeamToken[]
  /** 관리자 페이지 비밀번호. null이면 `/admin`을 붙이지 않는다 (telemetry.md "관리자 페이지") */
  adminPassword: string | null
}

export interface AdminOptions {
  password: string
  /** `@meeting-stt/design/base.css` 내용 */
  designCss: string
}

/** 라우트가 쓰는 외부 자원. 테스트는 :memory: DB와 임시 폴더를 넣는다 */
export interface CollectorDeps {
  db: DatabaseSync
  recordingsDir: string
  teamTokens: TeamToken[]
  admin?: AdminOptions
  now?: () => number
}
