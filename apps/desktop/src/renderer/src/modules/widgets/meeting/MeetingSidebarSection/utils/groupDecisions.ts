import type { DecisionListItem, DecisionType } from '@shared/types'

import type { DecisionGroup } from '../types/sidebar'

/** 타입 id와 겹치지 않는 고정 id. 접힘 상태 저장에도 이 값을 쓴다 */
export const UNCLASSIFIED_GROUP_ID = 'unclassified'

interface GroupDecisionsParams {
  decisions: DecisionListItem[]
  types: DecisionType[]
  unclassifiedName: string
}

/**
 * 결정 문서를 타입 순서대로 묶는다. 타입 목록에 없는 id(지운 타입)나 null은 미분류로 가고, 미분류는 항상 마지막이며
 * 비어 있으면 뺀다. 묶음 안 순서는 main이 준 순서(회의 최신순 → 회의 안 순서)를 그대로 둔다 (references/decisions.md "사이드 패널").
 */
export const groupDecisions = ({ decisions, types, unclassifiedName }: GroupDecisionsParams) => {
  const typeIds = new Set(types.map(({ id }) => id))
  const typed = types.map<DecisionGroup>(({ id, name }) => ({
    id,
    name,
    decisions: decisions.filter((decision) => decision.typeId === id)
  }))
  const unclassified = decisions.filter(({ typeId }) => typeId === null || !typeIds.has(typeId))

  if (!unclassified.length) return typed

  return [...typed, { id: UNCLASSIFIED_GROUP_ID, name: unclassifiedName, decisions: unclassified }]
}
