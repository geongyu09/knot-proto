import { describe, expect, it } from 'vitest'
import { retryDelayMs } from './backoff'

describe('retryDelayMs', () => {
  it('시도할 때마다 간격이 두 배가 된다', () => {
    expect(retryDelayMs({ attempts: 1 })).toBe(30_000)
    expect(retryDelayMs({ attempts: 2 })).toBe(60_000)
    expect(retryDelayMs({ attempts: 3 })).toBe(120_000)
  })

  it('한 시간을 넘지 않는다', () => {
    expect(retryDelayMs({ attempts: 30 })).toBe(3_600_000)
  })

  it('인증 실패는 바로 상한으로 미룬다', () => {
    expect(retryDelayMs({ attempts: 1, isAuthFailure: true })).toBe(3_600_000)
  })
})
