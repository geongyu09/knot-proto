import { describe, expect, it } from 'vitest'
import { outcomeOfStatus } from './outcome'

describe('outcomeOfStatus', () => {
  it('2xx는 보낸 것으로 본다', () => {
    expect(outcomeOfStatus(200)).toBe('sent')
    expect(outcomeOfStatus(204)).toBe('sent')
  })

  it('네트워크 오류·5xx·429는 재시도한다', () => {
    expect(outcomeOfStatus(null)).toBe('retry')
    expect(outcomeOfStatus(503)).toBe('retry')
    expect(outcomeOfStatus(429)).toBe('retry')
  })

  it('401·403은 토큰 문제로 따로 다룬다', () => {
    expect(outcomeOfStatus(401)).toBe('auth')
    expect(outcomeOfStatus(403)).toBe('auth')
  })

  it('400 같은 나머지 4xx는 버린다', () => {
    expect(outcomeOfStatus(400)).toBe('drop')
    expect(outcomeOfStatus(404)).toBe('drop')
    expect(outcomeOfStatus(413)).toBe('drop')
  })
})
