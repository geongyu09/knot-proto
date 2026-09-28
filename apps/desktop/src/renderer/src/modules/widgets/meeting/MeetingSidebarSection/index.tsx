import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'
import useMeetingSearch from '@renderer/shared/hooks/domain/meeting/useMeetingSearch'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import MeetingList from './ui/MeetingList'
import SearchField from './ui/SearchField'
import SearchResultList from './ui/SearchResultList'
import styles from './index.module.css'

interface MeetingSidebarSectionProps {
  onClose: () => void
}

/**
 * GNB의 목록 버튼으로 여닫는 회의 목록 패널 (knot "사이드바 열림").
 * 화면을 옮겨도 언마운트되지 않으므로 목록은 `meetings:changed`로 갱신한다
 * (references/architecture.md "메인 창 레이아웃").
 */
export default function MeetingSidebarSection({ onClose }: MeetingSidebarSectionProps) {
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const { meetings, isLoading, error, refetch } = useMeetings()
  const search = useMeetingSearch({ query })

  // 검색어가 있으면 검색 입력의 Esc가 먼저 검색을 지운다 (SearchField가 이벤트를 막는다)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    onClose()
  }

  return (
    <aside className={styles.panel} onKeyDown={handleKeyDown}>
      <div className={styles.header}>
        <SearchField value={query} onChange={setQuery} />
      </div>
      <nav
        className={styles.body}
        aria-label={search.isActive ? t.sidebar.nav.searchResults : t.sidebar.nav.meetingList}
      >
        {search.isActive ? (
          <SearchResultList
            query={query}
            results={search.results}
            isSearching={search.isSearching}
            error={search.error}
          />
        ) : (
          <MeetingList meetings={meetings} isLoading={isLoading} error={error} onRetry={refetch} />
        )}
      </nav>
    </aside>
  )
}
