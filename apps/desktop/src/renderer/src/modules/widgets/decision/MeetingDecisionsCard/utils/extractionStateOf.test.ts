import { describe, expect, it } from 'vitest'

import { extractionStateOf } from './extractionStateOf'

describe('extractionStateOf', () => {
  it('진행 이벤트가 있으면 저장된 상태보다 먼저 본다', () => {
    expect(
      extractionStateOf({ decisionState: 'error', stage: 'extract', isRequested: false })
    ).toBe('running')
    expect(extractionStateOf({ decisionState: 'pending', stage: 'done', isRequested: false })).toBe(
      'done'
    )
    expect(extractionStateOf({ decisionState: 'done', stage: 'error', isRequested: false })).toBe(
      'error'
    )
  })

  it('방금 요청했으면 첫 이벤트 전에도 진행 중이다', () => {
    expect(extractionStateOf({ decisionState: 'none', stage: null, isRequested: true })).toBe(
      'running'
    )
  })

  it('이벤트가 없으면 저장된 상태를 따른다', () => {
    expect(extractionStateOf({ decisionState: 'pending', stage: null, isRequested: false })).toBe(
      'running'
    )
    expect(extractionStateOf({ decisionState: 'none', stage: null, isRequested: false })).toBe(
      'none'
    )
    expect(extractionStateOf({ decisionState: 'error', stage: null, isRequested: false })).toBe(
      'error'
    )
  })
})
