import MeetingListSection from '@renderer/modules/widgets/meeting/MeetingListSection'
import PageColumn from '@renderer/shared/components/primitives/layout/PageColumn'

export default function Meetings() {
  return (
    <PageColumn width="medium">
      <MeetingListSection />
    </PageColumn>
  )
}
