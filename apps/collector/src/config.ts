import type { CollectorConfig, TeamToken } from './types/collector'
import type { ParseResult } from './types/parse'
import { PATH_SEGMENT_PATTERN } from './validate'

const DEFAULT_PORT = 8787
const DEFAULT_HOSTNAME = '127.0.0.1'
const DEFAULT_DATA_DIR = './data'
const MIN_TOKEN_LENGTH = 32
const MAX_PORT = 65535
const MIN_ADMIN_PASSWORD_LENGTH = 16

/** `teamId:token,teamId:token` 형식. teamId는 녹음 저장 경로에 쓰이므로 경로 문자를 받지 않는다 */
const parseTeamTokens = (raw: string | undefined): ParseResult<TeamToken[]> => {
  const pairs = (raw ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
  if (pairs.length === 0) return { ok: false, error: 'COLLECTOR_TEAM_TOKENS가 비었습니다' }

  const teamTokens: TeamToken[] = []
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf(':')
    const teamId = pair.slice(0, separatorIndex)
    const token = pair.slice(separatorIndex + 1)
    if (separatorIndex <= 0 || !PATH_SEGMENT_PATTERN.test(teamId)) {
      return { ok: false, error: `팀 id 형식이 틀렸습니다: "${pair.slice(0, 20)}…"` }
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      return { ok: false, error: `${teamId}의 토큰은 ${MIN_TOKEN_LENGTH}자 이상이어야 합니다` }
    }
    if (teamTokens.some((existing) => existing.token === token)) {
      return { ok: false, error: `${teamId}의 토큰이 다른 팀과 겹칩니다` }
    }
    teamTokens.push({ teamId, token })
  }
  return { ok: true, value: teamTokens }
}

const parsePort = (raw: string | undefined) => {
  if (raw === undefined || raw === '') return DEFAULT_PORT
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : null
}

/** 환경 변수에서 서버 설정을 읽는다. 팀 토큰이 없으면 아무것도 받지 않으므로 시작을 거절한다 */
export const loadConfig = (env: NodeJS.ProcessEnv): ParseResult<CollectorConfig> => {
  const port = parsePort(env.COLLECTOR_PORT)
  if (port === null)
    return { ok: false, error: `COLLECTOR_PORT가 올바르지 않습니다: ${env.COLLECTOR_PORT}` }
  const teamTokens = parseTeamTokens(env.COLLECTOR_TEAM_TOKENS)
  if (!teamTokens.ok) return teamTokens
  const adminPassword = env.COLLECTOR_ADMIN_PASSWORD?.trim() || null
  if (adminPassword !== null && adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `COLLECTOR_ADMIN_PASSWORD는 ${MIN_ADMIN_PASSWORD_LENGTH}자 이상이어야 합니다 (비우면 관리자 페이지를 끕니다)`
    }
  }
  return {
    ok: true,
    value: {
      port,
      hostname: env.COLLECTOR_HOST || DEFAULT_HOSTNAME,
      dataDir: env.COLLECTOR_DATA_DIR || DEFAULT_DATA_DIR,
      teamTokens: teamTokens.value,
      adminPassword
    }
  }
}
