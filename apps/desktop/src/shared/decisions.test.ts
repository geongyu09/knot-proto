import { describe, expect, it } from 'vitest'

import {
  DECISION_TYPE_MAX_COUNT,
  DEFAULT_DECISION_TYPES,
  decisionTypesFromStored,
  readDecisionTypes
} from './decisions'

const createId = () => 'new-id'

describe('readDecisionTypes', () => {
  it('앞뒤 공백을 자르고 빈 id에 새 id를 붙인다', () => {
    const types = readDecisionTypes({
      value: [{ id: '', name: '  보안 ', description: ' 권한 ' }],
      createId
    })

    expect(types).toEqual([{ id: 'new-id', name: '보안', description: '권한' }])
  })

  it('대소문자를 무시한 이름 중복을 거절한다', () => {
    expect(() =>
      readDecisionTypes({
        value: [
          { id: 'a', name: 'API', description: '' },
          { id: 'b', name: 'api ', description: '' }
        ],
        createId
      })
    ).toThrow('같은 이름')
  })

  it('개수·길이 한도를 넘으면 거절한다', () => {
    const many = Array.from({ length: DECISION_TYPE_MAX_COUNT + 1 }, (_, index) => ({
      id: `t${index}`,
      name: `타입${index}`,
      description: ''
    }))

    expect(() => readDecisionTypes({ value: many, createId })).toThrow('개까지')
    expect(() =>
      readDecisionTypes({ value: [{ id: 'a', name: '가'.repeat(21), description: '' }], createId })
    ).toThrow('자까지')
    expect(() =>
      readDecisionTypes({ value: [{ id: 'a', name: ' ', description: '' }], createId })
    ).toThrow('비워 둘 수 없습니다')
  })
})

describe('decisionTypesFromStored', () => {
  it('저장된 값이 없거나 깨졌으면 기본 목록이다', () => {
    expect(decisionTypesFromStored(undefined)).toBe(DEFAULT_DECISION_TYPES)
    expect(decisionTypesFromStored([{ id: 1 }])).toBe(DEFAULT_DECISION_TYPES)
  })

  it('빈 배열은 사용자가 모두 지운 것이라 빈 목록이다', () => {
    expect(decisionTypesFromStored([])).toEqual([])
  })
})
