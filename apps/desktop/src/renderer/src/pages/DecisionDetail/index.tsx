import { Navigate, useParams } from 'react-router'
import DecisionDocumentSection from '@renderer/modules/widgets/decision/DecisionDocumentSection'
import TranscriptSection from '@renderer/modules/widgets/meeting/TranscriptSection'
import { PATHS } from '@renderer/shared/routes/paths'

/** 왼쪽 읽기 전용 결정 문서 · 오른쪽 원문 패널 (references/decisions.md "결정 문서 화면") */
export default function DecisionDetail() {
  const { decisionId } = useParams()

  if (!decisionId) return <Navigate to={PATHS.home} replace />

  return (
    <DecisionDocumentSection
      // 사이드 패널에서 다른 문서로 옮기면 상태가 남지 않도록 통째로 새로 그린다
      key={decisionId}
      decisionId={decisionId}
      renderLayout={({ meetingId, document, highlightRanges, scrollRequest }) => (
        <TranscriptSection
          key={meetingId}
          variant="panel"
          meetingId={meetingId}
          main={document}
          highlightRanges={highlightRanges}
          scrollRequest={scrollRequest}
        />
      )}
    />
  )
}
