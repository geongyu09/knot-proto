import type { DecisionStage, DecisionState } from '@shared/types'

export type ExtractionState = 'none' | 'running' | 'done' | 'error'

interface ExtractionStateOfParams {
  /** DB에 저장된 상태. 화면을 연 뒤에는 늦을 수 있다 */
  decisionState: DecisionState
  /** 이 화면을 연 뒤 받은 마지막 진행 이벤트 단계. 있으면 저장된 상태보다 새것이다 */
  stage: DecisionStage | null
  /** 이 화면에서 추출을 요청했고 아직 이벤트가 오지 않았다 */
  isRequested: boolean
}

/** 결정 카드가 보여 줄 추출 상태. 진행 이벤트 → 방금 보낸 요청 → 저장된 상태 순서로 믿는다 */
export const extractionStateOf = ({
  decisionState,
  stage,
  isRequested
}: ExtractionStateOfParams): ExtractionState => {
  if (stage === 'error') return 'error'
  if (stage === 'done') return 'done'
  if (stage !== null || isRequested) return 'running'
  if (decisionState === 'pending') return 'running'

  return decisionState
}
