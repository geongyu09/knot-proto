import type { DecisionListItem } from '@shared/types'

export type SidebarTab = 'decisions' | 'meetings'

/** 결정 탭 "처리 중" 묶음의 한 회의가 어떤 상태인지. 실패는 어느 단계인지에 따라 다시 시도가 다르다 */
export type ProcessingKind = 'pipelineRunning' | 'pipelineFailed' | 'extracting' | 'extractFailed'

/** 결정 탭의 타입 묶음 하나. 미분류는 타입 목록에 없는 고정 묶음이다 */
export interface DecisionGroup {
  id: string
  name: string
  decisions: DecisionListItem[]
}
