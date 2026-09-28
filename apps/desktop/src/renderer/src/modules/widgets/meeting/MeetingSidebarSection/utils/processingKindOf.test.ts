import { describe, expect, it } from 'vitest'
import type { Meeting } from '@shared/types'

import { processingKindOf } from './processingKindOf'

const meetingOf = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: 'meeting-1',
  title: '회의',
  createdAt: 0,
  durationSec: 60,
  status: 'done',
  hasAudio: true,
  decisionState: 'none',
  decisionCount: 0,
  ...overrides
})

describe('processingKindOf', () => {
  it('파이프라인 처리 중·실패를 먼저 본다', () => {
    expect(processingKindOf(meetingOf({ status: 'processing', decisionState: 'error' }))).toBe(
      'pipelineRunning'
    )
    expect(processingKindOf(meetingOf({ status: 'error' }))).toBe('pipelineFailed')
  })

  it('회의록이 있으면 추출 대기·실패를 본다', () => {
    expect(processingKindOf(meetingOf({ decisionState: 'pending' }))).toBe('extracting')
    expect(processingKindOf(meetingOf({ decisionState: 'error' }))).toBe('extractFailed')
  })

  it('녹음 중이거나 추출이 끝났거나 한 적 없으면 넣지 않는다', () => {
    expect(processingKindOf(meetingOf({ status: 'recording' }))).toBeNull()
    expect(processingKindOf(meetingOf({ decisionState: 'done', decisionCount: 0 }))).toBeNull()
    expect(processingKindOf(meetingOf())).toBeNull()
  })
})
