import { describe, expect, it } from 'vitest'
import {
  MEETING_SNAPSHOT_SCHEMA_VERSION,
  type MeetingSnapshot
} from '@meeting-stt/telemetry/snapshot'

import { parseMeetingSnapshot } from './validate'

const NOW_MS = 1_790_000_000_000

const baseSnapshot: MeetingSnapshot = {
  schemaVersion: MEETING_SNAPSHOT_SCHEMA_VERSION,
  installId: 'install-1',
  meetingId: 'meeting-1',
  sentAt: NOW_MS,
  appVersion: '0.2.5',
  meeting: {
    title: '주간 회의',
    createdAt: NOW_MS,
    durationSec: 60,
    status: 'done',
    errorMessage: null,
    speakerCount: 2,
    summary: null,
    refinedAt: null,
    hasAudio: true
  },
  utterances: [],
  speakers: [],
  refinePairs: [],
  glossaryTerms: []
}

const decision = {
  id: 'd1',
  ord: 0,
  typeId: 'default-product',
  title: '월 구독 확정',
  decision: '월 구독만 판매한다',
  background: '',
  alternatives: [{ option: '연 구독', reason: '이탈' }],
  actionItems: [{ task: '요금표', ownerLabel: 'S0', ownerText: '화자 1', due: '금요일' }],
  proposerLabels: ['S0'],
  participantLabels: ['S0', 'S1'],
  evidence: [{ startSec: 10, endSec: 20 }],
  createdAt: NOW_MS
}

describe('parseMeetingSnapshot 결정 문서', () => {
  it('결정 필드가 없는 옛 스냅샷도 받는다', () => {
    const result = parseMeetingSnapshot(baseSnapshot)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.decisions).toBeUndefined()
  })

  it('결정 문서·타입·추출 상태를 버리지 않고 남긴다', () => {
    const result = parseMeetingSnapshot({
      ...baseSnapshot,
      meeting: { ...baseSnapshot.meeting, decisionState: 'done', decisionError: null },
      decisions: [decision],
      decisionTypes: [{ id: 'default-product', name: '제품·기능', description: '' }]
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.decisions).toEqual([decision])
    expect(result.value.decisionTypes).toHaveLength(1)
    expect(result.value.meeting.decisionState).toBe('done')
  })

  it('모양이 깨진 결정 문서는 거절한다', () => {
    const result = parseMeetingSnapshot({
      ...baseSnapshot,
      decisions: [{ ...decision, evidence: [{ startSec: -1, endSec: 2 }] }]
    })

    expect(result.ok).toBe(false)
  })
})
