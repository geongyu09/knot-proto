import type { ReactNode } from 'react'
import type { DecisionEvidence } from '@shared/types'

/** 근거 칩을 눌렀을 때 원문 패널에 보내는 스크롤 요청. 같은 칩을 다시 눌러도 움직이게 requestId를 올린다 */
export interface EvidenceScrollRequest extends DecisionEvidence {
  requestId: number
}

/** 페이지가 원문 패널(`TranscriptSection variant="panel"`)과 문서를 한 화면에 놓을 때 받는 값 */
export interface DecisionLayoutParams {
  meetingId: string
  document: ReactNode
  highlightRanges: DecisionEvidence[]
  scrollRequest: EvidenceScrollRequest | null
}
