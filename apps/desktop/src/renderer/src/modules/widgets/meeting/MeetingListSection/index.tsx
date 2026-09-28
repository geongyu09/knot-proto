import useNow from '@renderer/shared/hooks/common/useNow'
import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { groupMeetingsByDate } from '@renderer/shared/utils/meetingDateGroup'

import MeetingRow from './ui/MeetingRow'
import styles from './index.module.css'

/** 날짜 묶음이 자정을 넘기면 바뀌어야 하므로 1분마다 현재 시각을 새로 읽는다 */
const NOW_REFRESH_MS = 60_000

/** `/meetings` 회의록 목록 (knot "문서 목록/기본", references/architecture.md "화면별 구성") */
export default function MeetingListSection() {
  const { t, locale } = useLocale()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const { meetings, isLoading, error, refetch } = useMeetings()
  const text = t.sidebar.meetingsPage

  const renderBody = () => {
    if (error) {
      return (
        <div className={styles.error}>
          <p className={styles.errorMessage}>{error.message}</p>
          <Button variant="secondary" size="sm" onClick={refetch}>
            {t.common.retry}
          </Button>
        </div>
      )
    }
    if (isLoading && !meetings.length) return <p className={styles.hint}>{t.common.loading}</p>
    if (!meetings.length) {
      return (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{text.empty}</p>
          <p className={styles.hint}>{text.emptyHint}</p>
        </div>
      )
    }

    return groupMeetingsByDate({ meetings, now, locale }).map(
      ({ group, label, meetings: grouped }) => (
        <section key={group} className={styles.group} aria-label={label}>
          <h2 className={styles.heading}>
            {label}
            <span className={styles.count}>{grouped.length}</span>
          </h2>
          <ul className={styles.list}>
            {grouped.map((meeting) => (
              <li key={meeting.id} className={styles.item}>
                <MeetingRow meeting={meeting} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )
    )
  }

  return (
    <div className={styles.section}>
      <header className={styles.header}>
        <h1 className={styles.title}>{text.title}</h1>
        <p className={styles.description}>{text.description}</p>
      </header>
      {renderBody()}
    </div>
  )
}
