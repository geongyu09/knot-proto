import type { DecisionType } from '@shared/types'

import type { TypeRow } from '../types/typeRow'

/** 이름·설명을 모두 비워 둔 새 행은 저장하지 않는다 — "타입 추가"만 누르고 둔 행이다 */
export const toSavedTypes = (rows: TypeRow[]) =>
  rows
    .filter(({ id, name, description }) => id || name.trim() || description.trim())
    .map<DecisionType>(({ id, name, description }) => ({ id, name, description }))

interface IsSameTypesParams {
  rows: TypeRow[]
  saved: DecisionType[]
}

export const isSameTypes = ({ rows, saved }: IsSameTypesParams) => {
  const current = toSavedTypes(rows)

  return (
    current.length === saved.length &&
    current.every(
      (type, index) =>
        type.id === saved[index].id &&
        type.name === saved[index].name &&
        type.description === saved[index].description
    )
  )
}

interface MoveRowParams {
  rows: TypeRow[]
  key: number
  offset: number
}

/** 행을 위(-1)·아래(+1)로 한 칸 옮긴다. 끝에서 더 밀면 그대로 둔다 */
export const moveRow = ({ rows, key, offset }: MoveRowParams) => {
  const index = rows.findIndex((row) => row.key === key)
  const target = index + offset
  if (index < 0 || target < 0 || target >= rows.length) return rows

  return rows.with(index, rows[target]).with(target, rows[index])
}
