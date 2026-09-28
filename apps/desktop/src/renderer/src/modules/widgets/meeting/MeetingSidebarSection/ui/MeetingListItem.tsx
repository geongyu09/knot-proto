import { NavLink } from 'react-router'
import type { Meeting } from '@shared/types'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'

import { whenOf } from '../utils/whenOf'
import styles from './MeetingListItem.module.css'

interface MeetingListItemProps {
  meeting: Meeting
  now: number
}

export default function MeetingListItem({ meeting, now }: MeetingListItemProps) {
  const { t, locale } = useLocale()

  // 추출이 끝난 회의만 칩을 단다. 0개는 "결정 없음"으로 실패·미추출과 구분한다 (references/decisions.md "사이드 패널")
  const renderDecisionChip = () => {
    if (meeting.decisionState !== 'done') return null

    return (
      <Badge>
        {meeting.decisionCount
          ? t.decisions.chip.count({ count: meeting.decisionCount })
          : t.decisions.chip.none}
      </Badge>
    )
  }

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

    return (
      <span className={styles.metaContainer}>
        <span className={styles.meta}>
          {whenOf({ epochMs: meeting.createdAt, now, locale })} ·{' '}
          {formatDurationShort({ sec: meeting.durationSec, locale })}
        </span>
        {renderDecisionChip()}
      </span>
    )
  }

  return (
    <NavLink
      to={meetingDetailPath({ meetingId: meeting.id })}
      className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
    >
      <span className={styles.title}>{meeting.title}</span>
      {renderStatus()}
    </NavLink>
  )
}
