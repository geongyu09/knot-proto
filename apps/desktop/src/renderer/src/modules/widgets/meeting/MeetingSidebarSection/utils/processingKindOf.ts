import type { Meeting } from '@shared/types'

import type { ProcessingKind } from '../types/sidebar'

/**
 * 결정 탭 "처리 중" 묶음에 들어갈 회의인지, 들어가면 어떤 상태인지. 녹음 중인 회의는 넣지 않는다 —
 * 아직 처리할 것이 없고 독·녹음 화면이 이미 보여 준다. 추출 상태는 회의록이 만들어진 뒤에만 본다
 * (추출 실패는 `status`를 건드리지 않는다, references/decisions.md "흐름").
 */
export const processingKindOf = (meeting: Meeting): ProcessingKind | null => {
  if (meeting.status === 'processing') return 'pipelineRunning'
  if (meeting.status === 'error') return 'pipelineFailed'
  if (meeting.status !== 'done') return null
  if (meeting.decisionState === 'pending') return 'extracting'
  if (meeting.decisionState === 'error') return 'extractFailed'

  return null
}
