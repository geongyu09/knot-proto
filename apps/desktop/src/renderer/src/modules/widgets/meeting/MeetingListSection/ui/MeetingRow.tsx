import { Link } from 'react-router'
import type { Meeting } from '@shared/types'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDay } from '@renderer/shared/utils/formatMeetingDate'

import styles from './MeetingRow.module.css'

interface MeetingRowProps {
  meeting: Meeting
  now: number
}

/** 행 전체가 상세로 가는 링크다. 상태 줄은 처리 중·오류일 때만 보인다 */
export default function MeetingRow({ meeting, now }: MeetingRowProps) {
  const { t, locale } = useLocale()

  const renderStatus = () => {
    if (meeting.status === 'recording') {
      return <span className={styles.recording}>{t.sidebar.listItem.recording}</span>
    }
    if (meeting.status === 'processing') return <PipelineProgress meetingId={meeting.id} />
    if (meeting.status === 'error') {
      return (
        <span className={styles.error}>
          {meeting.errorMessage ?? t.sidebar.listItem.defaultError}
        </span>
      )
    }

    return null
  }

  return (
    <Link to={meetingDetailPath({ meetingId: meeting.id })} className={styles.row}>
      <span className={styles.text}>
        <span className={styles.title}>{meeting.title}</span>
        {renderStatus()}
      </span>
      <span className={styles.meta}>
        {formatMeetingDay({ epochMs: meeting.createdAt, now, locale })}
        <Badge tone="neutral">{formatDurationShort({ sec: meeting.durationSec, locale })}</Badge>
        <Icon name="chevronRight" size={12} />
      </span>
    </Link>
  )
}
