import Card from '@renderer/shared/components/primitives/layout/Card'
import useNow from '@renderer/shared/hooks/common/useNow'
import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatDurationShort } from '@renderer/shared/utils/formatDuration'
import { meetingDateGroupOf } from '@renderer/shared/utils/meetingDateGroup'

import styles from './index.module.css'

/** 날짜 표시가 자정을 넘기면 바뀌어야 하므로 1분마다 현재 시각을 새로 읽는다 */
const NOW_REFRESH_MS = 60_000

/** 홈 오른쪽 위 "이번 주". 목록에서 파생하는 값이라 새 IPC가 없다 (최근 7일, 날짜 묶음과 같은 기준) */
export default function WeeklyStatsCard() {
  const { t, locale } = useLocale()
  const { meetings } = useMeetings()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const recentMeetings = meetings.filter(
    (meeting) => meetingDateGroupOf({ epochMs: meeting.createdAt, now }) !== 'earlier'
  )
  const totalSec = recentMeetings.reduce((sum, meeting) => sum + meeting.durationSec, 0)

  return (
    <Card className={styles.card} title={t.sidebar.home.week.title}>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.label}>{t.sidebar.home.week.meetings}</dt>
          <dd className={styles.value}>
            {t.sidebar.home.week.meetingCount({ count: recentMeetings.length })}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.label}>{t.sidebar.home.week.totalDuration}</dt>
          <dd className={styles.value}>{formatDurationShort({ sec: totalSec, locale })}</dd>
        </div>
      </dl>
    </Card>
  )
}
