import type { DecisionType } from '@shared/types'

/** 편집 중인 타입 한 행. 새 타입은 id가 빈 문자열이라 React key로 쓸 수 없어 화면 전용 key를 따로 둔다 */
export interface TypeRow extends DecisionType {
  key: number
}
