import { describe, expect, it } from 'vitest'

import type { TypeRow } from '../types/typeRow'
import { isSameTypes, moveRow, toSavedTypes } from './typeRows'

const rowOf = (key: number, overrides: Partial<TypeRow> = {}): TypeRow => ({
  key,
  id: `type-${key}`,
  name: `타입 ${key}`,
  description: '',
  ...overrides
})

describe('toSavedTypes', () => {
  it('비워 둔 새 행은 빼고 화면 key를 떼어 낸다', () => {
    expect(toSavedTypes([rowOf(1), rowOf(2, { id: '', name: ' ' })])).toEqual([
      { id: 'type-1', name: '타입 1', description: '' }
    ])
  })

  it('이름을 지운 기존 타입은 남겨 main 검증이 알리게 한다', () => {
    expect(toSavedTypes([rowOf(1, { name: '' })])).toHaveLength(1)
  })
})

describe('isSameTypes', () => {
  it('순서까지 같으면 변경 없음', () => {
    const rows = [rowOf(1), rowOf(2)]
    expect(isSameTypes({ rows, saved: toSavedTypes(rows) })).toBe(true)
    expect(isSameTypes({ rows: [rowOf(2), rowOf(1)], saved: toSavedTypes(rows) })).toBe(false)
  })
})

describe('moveRow', () => {
  it('한 칸 옮기고 끝에서는 그대로 둔다', () => {
    const rows = [rowOf(1), rowOf(2), rowOf(3)]
    expect(moveRow({ rows, key: 2, offset: -1 }).map(({ key }) => key)).toEqual([2, 1, 3])
    expect(moveRow({ rows, key: 3, offset: 1 })).toBe(rows)
  })
})
