import type { Meeting } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useNow from '@renderer/shared/hooks/common/useNow'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { groupMeetingsByDate } from '@renderer/shared/utils/meetingDateGroup'

import { NOW_REFRESH_MS } from '../constants/sidebar'
import MeetingListItem from './MeetingListItem'
import styles from './MeetingList.module.css'

interface MeetingListProps {
  meetings: Meeting[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}

export default function MeetingList({ meetings, isLoading, error, onRetry }: MeetingListProps) {
  const { t, locale } = useLocale()
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })

  if (isLoading && !meetings.length) return <p className={styles.message}>{t.common.loading}</p>
  if (error) {
    return (
      <div className={styles.error}>
        <p className={styles.errorMessage}>{error.message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t.common.retry}
        </Button>
      </div>
    )
  }
  if (!meetings.length) {
    return <p className={styles.message}>{t.sidebar.list.empty}</p>
  }

  return (
    <>
      {groupMeetingsByDate({ meetings, now, locale }).map(({ group, label, meetings: grouped }) => (
        <section key={group} className={styles.group} aria-label={label}>
          <h2 className={styles.heading}>{label}</h2>
          <ul className={styles.list}>
            {grouped.map((meeting) => (
              <li key={meeting.id}>
                <MeetingListItem meeting={meeting} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
