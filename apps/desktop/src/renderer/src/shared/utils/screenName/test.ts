import { describe, expect, it } from 'vitest'
import { screenNameOf } from './index'

describe('screenNameOf', () => {
  it('회의 상세 경로는 id 없이 화면 이름만 돌려준다', () => {
    expect(screenNameOf('/meetings/2f1c')).toBe('meetingDetail')
  })

  it('결정 문서 경로도 id 없이 화면 이름만 돌려준다', () => {
    expect(screenNameOf('/decisions/9a0b')).toBe('decisionDetail')
  })

  it('고정 경로를 이름으로 바꾼다', () => {
    expect(screenNameOf('/')).toBe('home')
    expect(screenNameOf('/settings')).toBe('settings')
  })

  it('모르는 경로는 unknown', () => {
    expect(screenNameOf('/nowhere/at/all')).toBe('unknown')
  })
})
