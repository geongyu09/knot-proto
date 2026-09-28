import { Navigate, useParams } from 'react-router'
import MeetingDecisionsCard from '@renderer/modules/widgets/decision/MeetingDecisionsCard'
import SummarySection from '@renderer/modules/widgets/meeting/SummarySection'
import TranscriptSection from '@renderer/modules/widgets/meeting/TranscriptSection'
import { PATHS } from '@renderer/shared/routes/paths'

export default function MeetingDetail() {
  const { meetingId } = useParams()

  if (!meetingId) return <Navigate to={PATHS.home} replace />

  return (
    <TranscriptSection
      // 사이드바에서 다른 회의로 옮기면 편집·복사·요약 상태가 남지 않도록 통째로 새로 그린다
      key={meetingId}
      meetingId={meetingId}
      aside={
        <>
          <MeetingDecisionsCard meetingId={meetingId} />
          <SummarySection meetingId={meetingId} />
        </>
      }
    />
  )
}
