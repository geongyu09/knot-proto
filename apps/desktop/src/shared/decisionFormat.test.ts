import { describe, expect, it } from 'vitest'

import type { Decision } from './types'
import { formatDecisionMarkdown } from './decisionFormat'

const baseDecision: Decision = {
  id: 'd1',
  meetingId: 'm1',
  ord: 0,
  typeId: 'default-product',
  title: '가격 정책을 월 구독으로 확정',
  decision: '다음 분기부터 월 구독만 판매한다.',
  background: '',
  alternatives: [],
  actionItems: [],
  proposerLabels: [],
  participantLabels: [],
  evidence: [],
  createdAt: 0
}

describe('formatDecisionMarkdown', () => {
  it('빈 절은 넣지 않는다', () => {
    const text = formatDecisionMarkdown({
      decision: baseDecision,
      meetingTitle: '주간 회의',
      meetingDate: '2026. 9. 28.',
      typeName: '제품·기능',
      speakerNames: {}
    })

    expect(text).toBe(
      '## 가격 정책을 월 구독으로 확정\n\n제품·기능 · 주간 회의 · 2026. 9. 28.\n\n### 결정\n다음 분기부터 월 구독만 판매한다.\n'
    )
  })

  it('사람 필드는 복사 시점의 표시 이름으로 풀고 근거는 시각 구간으로 적는다', () => {
    const text = formatDecisionMarkdown({
      decision: {
        ...baseDecision,
        typeId: null,
        proposerLabels: ['SPEAKER_01'],
        alternatives: [{ option: '연 구독', reason: '초기 이탈이 크다' }],
        actionItems: [
          { task: '요금표 수정', ownerLabel: 'SPEAKER_01', ownerText: '화자 2', due: '금요일' },
          { task: '공지 초안', ownerLabel: null, ownerText: '민수 씨', due: '' }
        ],
        evidence: [{ startSec: 195, endSec: 242 }]
      },
      meetingTitle: '주간 회의',
      meetingDate: '2026. 9. 28.',
      typeName: null,
      speakerNames: { SPEAKER_01: '김팀장' }
    })

    expect(text).toContain('미분류 · 주간 회의 · 2026. 9. 28. · 제안: 김팀장')
    expect(text).toContain('- 연 구독: 초기 이탈이 크다')
    expect(text).toContain('- [ ] 요금표 수정 (김팀장, 금요일)')
    expect(text).toContain('- [ ] 공지 초안 (민수 씨)')
    expect(text).toContain('00:03:15–00:04:02')
  })
})
