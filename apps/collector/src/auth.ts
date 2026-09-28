import { createHash, timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'

import type { CollectorEnv, TeamToken } from './types/collector'

const BEARER_PREFIX = 'Bearer '

const digestOf = (value: string) => createHash('sha256').update(value).digest()

/**
 * 모든 팀 토큰과 해시끼리 비교한다. 해시로 길이를 맞춘 뒤 timingSafeEqual을 써서
 * 응답 시간으로 토큰 앞부분을 추측할 수 없게 한다. 일치한 뒤에도 끝까지 돌아 팀 순서도 새지 않게 한다.
 */
const findTeamId = ({ teamTokens, token }: { teamTokens: TeamToken[]; token: string }) => {
  const digest = digestOf(token)
  return teamTokens.reduce<string | null>(
    (found, team) => (timingSafeEqual(digestOf(team.token), digest) ? team.teamId : found),
    null
  )
}

/** `Authorization: Bearer <팀 토큰>`을 확인하고 팀 id를 컨텍스트에 넣는다. 폐기된 토큰은 401 */
export const teamAuth = (teamTokens: TeamToken[]) =>
  createMiddleware<CollectorEnv>(async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const token = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : ''
    const teamId = token ? findTeamId({ teamTokens, token }) : null
    if (!teamId) return c.json({ error: '팀 토큰이 없거나 폐기되었습니다' }, 401)
    c.set('teamId', teamId)
    await next()
  })
