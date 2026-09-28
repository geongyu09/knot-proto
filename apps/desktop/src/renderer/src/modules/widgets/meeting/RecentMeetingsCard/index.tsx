import { Link } from 'react-router'
import type { Meeting } from '@shared/types'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import Card from '@renderer/shared/components/primitives/layout/Card'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useNow from '@renderer/shared/hooks/common/useNow'
import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS, meetingDetailPath } from '@renderer/shared/routes/paths'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { formatMeetingDay } from '@renderer/shared/utils/formatMeetingDate'

import styles from './index.module.css'

/** 날짜 표시가 자정을 넘기면 바뀌어야 하므로 1분마다 현재 시각을 새로 읽는다 */
const NOW_REFRESH_MS = 60_000

/** knot 카드 높이(312)에 행 세 개가 들어간다 */
const RECENT_LIMIT = 3

/** 홈 왼쪽 위 "최근 회의" (references/architecture.md "화면별 구성" > 홈) */
export default function RecentMeetingsCard() {
  const { t, locale } = useLocale()
  const { meetings, isLoading, error } = useMeetings()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })

  const renderMeta = (meeting: Meeting) => {
    if (meeting.status === 'processing') return <PipelineProgress meetingId={meeting.id} />
    if (meeting.status === 'error') {
      return (
        <span className={styles.error}>
          {meeting.errorMessage ?? t.sidebar.listItem.defaultError}
        </span>
      )
    }

    return (
      <span className={styles.meta}>
        {formatMeetingDay({ epochMs: meeting.createdAt, now, locale })}
        <Badge tone="neutral">{formatDurationShort({ sec: meeting.durationSec, locale })}</Badge>
      </span>
    )
  }

  const renderBody = () => {
    if (error) return <p className={styles.error}>{error.message}</p>
    if (isLoading && !meetings.length) return <p className={styles.hint}>{t.common.loading}</p>
    if (!meetings.length) {
      return (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t.sidebar.home.recent.empty}</p>
          <p className={styles.hint}>{t.sidebar.home.recent.emptyHint}</p>
        </div>
      )
    }

    return (
      <ul className={styles.list}>
        {meetings.slice(0, RECENT_LIMIT).map((meeting) => (
          <li key={meeting.id}>
            <Link to={meetingDetailPath({ meetingId: meeting.id })} className={styles.row}>
              <span className={styles.title}>{meeting.title}</span>
              {renderMeta(meeting)}
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card
      className={styles.card}
      title={t.sidebar.home.recent.title}
      count={meetings.length || undefined}
      action={
        <Link to={PATHS.meetings} className={styles.viewAll}>
          {t.sidebar.home.recent.viewAll}
          <Icon name="chevronRight" size={12} />
        </Link>
      }
    >
      {renderBody()}
    </Card>
  )
}
