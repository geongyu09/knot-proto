import { describe, expect, it } from 'vitest'
import type { DecisionListItem, DecisionType } from '@shared/types'

import { groupDecisions, UNCLASSIFIED_GROUP_ID } from './groupDecisions'

const TYPES: DecisionType[] = [
  { id: 'type-a', name: '제품', description: '' },
  { id: 'type-b', name: '일정', description: '' }
]

const itemOf = (id: string, typeId: string | null): DecisionListItem => ({
  id,
  meetingId: 'meeting-1',
  typeId,
  title: id,
  meetingTitle: '회의',
  meetingCreatedAt: 0
})

describe('groupDecisions', () => {
  it('타입 순서대로 묶고 묶음 안 순서는 그대로 둔다', () => {
    const groups = groupDecisions({
      decisions: [itemOf('d1', 'type-b'), itemOf('d2', 'type-a'), itemOf('d3', 'type-b')],
      types: TYPES,
      unclassifiedName: '미분류'
    })

    expect(groups.map(({ id }) => id)).toEqual(['type-a', 'type-b'])
    expect(groups[1].decisions.map(({ id }) => id)).toEqual(['d1', 'd3'])
  })

  it('null이거나 지운 타입의 문서는 마지막 미분류 묶음으로 간다', () => {
    const groups = groupDecisions({
      decisions: [itemOf('d1', null), itemOf('d2', 'deleted-type'), itemOf('d3', 'type-a')],
      types: TYPES,
      unclassifiedName: '미분류'
    })

    const last = groups[groups.length - 1]
    expect(last.id).toBe(UNCLASSIFIED_GROUP_ID)
    expect(last.name).toBe('미분류')
    expect(last.decisions.map(({ id }) => id)).toEqual(['d1', 'd2'])
  })

  it('미분류가 비면 묶음을 만들지 않는다', () => {
    const groups = groupDecisions({
      decisions: [itemOf('d1', 'type-a')],
      types: TYPES,
      unclassifiedName: '미분류'
    })

    expect(groups.some(({ id }) => id === UNCLASSIFIED_GROUP_ID)).toBe(false)
  })

  it('문서가 없으면 타입 묶음만 빈 채로 돌려준다', () => {
    expect(
      groupDecisions({ decisions: [], types: TYPES, unclassifiedName: '미분류' }).map(
        ({ decisions }) => decisions.length
      )
    ).toEqual([0, 0])
  })
})
