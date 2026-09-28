import { describe, expect, it } from 'vitest'

import type { DecisionLine, ExtractedDecision } from '../types/decisions'
import { parseDecisionOutput, toEvidenceRanges, validateDecisions } from './validate'

const line = (lineNo: number, speakerLabel: string, speakerName: string): DecisionLine => ({
  lineNo,
  speakerLabel,
  speakerName,
  timestamp: '00:00',
  startSec: lineNo * 10,
  endSec: lineNo * 10 + 5,
  text: `발화 ${lineNo}`
})

const lines = [
  line(1, 'SPEAKER_00', '화자 1'),
  line(2, 'SPEAKER_01', '김팀장'),
  line(3, 'SPEAKER_00', '화자 1'),
  line(4, 'SPEAKER_01', '김팀장')
]

const types = [{ id: 'default-product', name: '제품·기능', description: '' }]

const candidate = (overrides: Partial<ExtractedDecision> = {}): ExtractedDecision => ({
  title: '월 구독 확정',
  decision: '월 구독만 판매한다',
  type: '제품·기능',
  background: '',
  alternatives: [],
  actionItems: [],
  proposers: [],
  participants: [],
  evidenceLines: [2],
  ...overrides
})

describe('parseDecisionOutput', () => {
  it('코드 펜스와 앞뒤 설명을 벗겨 읽는다', () => {
    const raw = '결과입니다\n```json\n{"decisions":[{"title":"A","evidenceLines":[1,"2"]}]}\n```'

    expect(parseDecisionOutput(raw)).toEqual([
      expect.objectContaining({ title: 'A', decision: '', evidenceLines: [1] })
    ])
  })

  it('JSON이 아니거나 decisions 배열이 없으면 null', () => {
    expect(parseDecisionOutput('없음')).toBeNull()
    expect(parseDecisionOutput('{"items":[]}')).toBeNull()
  })
})

describe('toEvidenceRanges', () => {
  it('연속한 줄은 한 구간으로 합치고 없는 줄은 뺀다', () => {
    expect(toEvidenceRanges({ lineNumbers: [3, 2, 9, 2], lines })).toEqual([
      { startSec: 20, endSec: 35 }
    ])
    expect(toEvidenceRanges({ lineNumbers: [1, 3], lines })).toEqual([
      { startSec: 10, endSec: 15 },
      { startSec: 30, endSec: 35 }
    ])
  })
})

describe('validateDecisions', () => {
  it('근거가 없거나 범위 밖이면 버린다', () => {
    const { decisions, droppedCount } = validateDecisions({
      candidates: [candidate({ evidenceLines: [] }), candidate({ evidenceLines: [99] })],
      lines,
      types
    })

    expect(decisions).toEqual([])
    expect(droppedCount).toBe(2)
  })

  it('제목·결정이 비면 버린다', () => {
    const { droppedCount } = validateDecisions({
      candidates: [candidate({ title: '' }), candidate({ decision: '' })],
      lines,
      types
    })

    expect(droppedCount).toBe(2)
  })

  it('타입 이름이 정확히 같지 않으면 미분류', () => {
    const { decisions } = validateDecisions({
      candidates: [candidate(), candidate({ type: '제품' })],
      lines,
      types
    })

    expect(decisions.map(({ typeId }) => typeId)).toEqual(['default-product', null])
  })

  it('화자 표기를 라벨로 되돌리고 모르는 사람은 뺀다. 담당은 풀리지 않으면 원문으로 둔다', () => {
    const [decision] = validateDecisions({
      candidates: [
        candidate({
          proposers: ['김팀장', '박과장'],
          participants: ['화자 1', 'SPEAKER_01'],
          actionItems: [
            { task: '요금표 수정', owner: '김 팀장', due: '금요일' },
            { task: '공지', owner: '민수 씨', due: '' }
          ]
        })
      ],
      lines,
      types
    }).decisions

    expect(decision.proposerLabels).toEqual(['SPEAKER_01'])
    expect(decision.participantLabels).toEqual(['SPEAKER_00', 'SPEAKER_01'])
    expect(decision.actionItems).toEqual([
      { task: '요금표 수정', ownerLabel: 'SPEAKER_01', ownerText: '김 팀장', due: '금요일' },
      { task: '공지', ownerLabel: null, ownerText: '민수 씨', due: '' }
    ])
  })

  it('합치기 결과는 후보 근거의 합집합 밖 줄을 뺀다', () => {
    const { decisions, droppedCount } = validateDecisions({
      candidates: [candidate({ evidenceLines: [2, 4] }), candidate({ evidenceLines: [3] })],
      lines,
      types,
      allowedLines: new Set([2])
    })

    expect(decisions[0].evidenceLines).toEqual([2])
    expect(droppedCount).toBe(1)
  })
})
