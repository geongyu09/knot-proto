import { describe, expect, it } from 'vitest'

import type { DecisionLine } from '../types/decisions'
import {
  DECISIONS_GRAMMAR,
  DECISIONS_JSON_SCHEMA,
  formatDecisionLine,
  splitDecisionLines
} from './prompt'

const line = (lineNo: number, text: string): DecisionLine => ({
  lineNo,
  speakerLabel: 'SPEAKER_00',
  speakerName: '화자 1',
  timestamp: '00:00:00',
  startSec: lineNo,
  endSec: lineNo + 1,
  text
})

describe('DECISIONS_GRAMMAR', () => {
  it('스키마와 같은 필드를 같은 순서로 강제한다', () => {
    const decisions = DECISIONS_JSON_SCHEMA.properties.decisions as {
      items: { properties: object }
    }
    const items = decisions.items
    const fields = Object.keys(items.properties)
    const decisionRule = DECISIONS_GRAMMAR.split('\n').find((rule) =>
      rule.startsWith('decision ::=')
    )
    const order = fields.map((field) => decisionRule?.indexOf(`"\\"${field}\\""`) ?? -1)

    expect(order.every((at) => at >= 0)).toBe(true)
    expect(order).toEqual(order.toSorted((a, b) => a - b))
  })

  it('역슬래시 이스케이프가 원문 그대로 남아 있다', () => {
    expect(DECISIONS_GRAMMAR).toContain(String.raw`char ::= [^"\\\x7F\x00-\x1F]`)
    expect(DECISIONS_GRAMMAR).toContain(String.raw`ws ::= [ \t\n]{0,20}`)
  })
})

describe('splitDecisionLines', () => {
  it('예산을 넘지 않게 줄 경계로 나누고 줄 번호를 유지한다', () => {
    const lines = [line(1, '가'.repeat(30)), line(2, '나'.repeat(30)), line(3, '다'.repeat(30))]
    const budgetChars = formatDecisionLine(lines[0]).length * 2 + 2

    const chunks = splitDecisionLines({ lines, budgetChars })

    expect(chunks.map((chunk) => chunk.map(({ lineNo }) => lineNo))).toEqual([[1, 2], [3]])
  })

  it('예산보다 긴 줄 하나는 혼자 청크가 된다', () => {
    const chunks = splitDecisionLines({
      lines: [line(1, '가'.repeat(100)), line(2, '나')],
      budgetChars: 10
    })

    expect(chunks).toHaveLength(2)
  })
})
