import { NavLink } from 'react-router'
import type { DecisionListItem } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { decisionDetailPath } from '@renderer/shared/routes/paths'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import { highlightMatch } from '../utils/highlightMatch'
import styles from './DecisionSearchResultList.module.css'

const TITLE_MAX_CHARS = 200

interface DecisionSearchResultListProps {
  query: string
  results: DecisionListItem[]
  isSearching: boolean
  error: Error | null
}

/** 결정 탭 검색 결과. 제목의 일치 부분을 강조하고 아래에 출처 회의를 적는다 */
export default function DecisionSearchResultList({
  query,
  results,
  isSearching,
  error
}: DecisionSearchResultListProps) {
  const { t, locale } = useLocale()

  if (error) return <p className={styles.error}>{error.message}</p>
  if (isSearching) return <p className={styles.message}>{t.sidebar.search.searching}</p>
  if (!results.length) {
    return (
      <p className={styles.message}>{t.decisions.sidebar.noResults({ query: query.trim() })}</p>
    )
  }

  return (
    <ul className={styles.list}>
      {results.map((decision) => (
        <li key={decision.id}>
          <NavLink
            to={decisionDetailPath({ decisionId: decision.id })}
            className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
          >
            <span className={styles.title}>
              {highlightMatch({ text: decision.title, query, maxChars: TITLE_MAX_CHARS }).map(
                (segment, index) =>
                  // 조각은 순서로만 구분되고 다시 정렬되지 않는다
                  segment.isMatch ? (
                    <mark key={index}>{segment.text}</mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  )
              )}
            </span>
            <span className={styles.meta}>
              {decision.meetingTitle} ·{' '}
              {formatMeetingDate({ epochMs: decision.meetingCreatedAt, locale })}
            </span>
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
