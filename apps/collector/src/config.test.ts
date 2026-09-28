import { describe, expect, it } from 'vitest'

import { loadConfig } from './config'

const TOKEN_A = 'a'.repeat(32)
const TOKEN_B = 'b'.repeat(32)

describe('loadConfig', () => {
  it('팀 토큰 목록과 기본값을 읽는다', () => {
    const config = loadConfig({ COLLECTOR_TEAM_TOKENS: `team-a:${TOKEN_A}, team-b:${TOKEN_B}` })
    expect(config).toEqual({
      ok: true,
      value: {
        port: 8787,
        hostname: '127.0.0.1',
        dataDir: './data',
        teamTokens: [
          { teamId: 'team-a', token: TOKEN_A },
          { teamId: 'team-b', token: TOKEN_B }
        ]
      }
    })
  })

  it('토큰이 없거나 짧거나 겹치면 시작을 거절한다', () => {
    expect(loadConfig({}).ok).toBe(false)
    expect(loadConfig({ COLLECTOR_TEAM_TOKENS: 'team-a:short' }).ok).toBe(false)
    expect(loadConfig({ COLLECTOR_TEAM_TOKENS: `a:${TOKEN_A},b:${TOKEN_A}` }).ok).toBe(false)
  })

  it('팀 id에 경로 문자가 있으면 거절한다', () => {
    expect(loadConfig({ COLLECTOR_TEAM_TOKENS: `../x:${TOKEN_A}` }).ok).toBe(false)
  })

  it('포트가 숫자가 아니면 거절한다', () => {
    const config = loadConfig({ COLLECTOR_PORT: 'abc', COLLECTOR_TEAM_TOKENS: `a:${TOKEN_A}` })
    expect(config.ok).toBe(false)
  })
})
