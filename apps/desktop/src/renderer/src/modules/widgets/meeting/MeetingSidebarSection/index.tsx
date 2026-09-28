import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import useStoredValue from '@renderer/shared/hooks/common/useStoredValue'
import useDecisions from '@renderer/shared/hooks/domain/decision/useDecisions'
import useDecisionSearch from '@renderer/shared/hooks/domain/decision/useDecisionSearch'
import useDecisionTypes from '@renderer/shared/hooks/domain/decision/useDecisionTypes'
import useMeetings from '@renderer/shared/hooks/domain/meeting/useMeetings'
import useMeetingSearch from '@renderer/shared/hooks/domain/meeting/useMeetingSearch'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { SIDEBAR_TAB_STORAGE_KEY } from './constants/sidebar'
import type { SidebarTab } from './types/sidebar'
import DecisionList from './ui/DecisionList'
import DecisionSearchResultList from './ui/DecisionSearchResultList'
import MeetingList from './ui/MeetingList'
import SearchField from './ui/SearchField'
import SearchResultList from './ui/SearchResultList'
import SidebarTabs from './ui/SidebarTabs'
import styles from './index.module.css'

const isSidebarTab = (value: unknown): value is SidebarTab =>
  value === 'decisions' || value === 'meetings'

interface MeetingSidebarSectionProps {
  onClose: () => void
}

/**
 * GNB의 목록 버튼으로 여닫는 패널. 위쪽 탭으로 결정 문서(타입별 묶음)와 회의록(날짜 묶음)을 오간다
 * (references/decisions.md "사이드 패널"). 화면을 옮겨도 언마운트되지 않으므로 두 탭 목록을 모두
 * `meetings:changed`로 갱신한다 (references/architecture.md "메인 창 레이아웃").
 */
export default function MeetingSidebarSection({ onClose }: MeetingSidebarSectionProps) {
  const { t } = useLocale()
  const panelId = useId()
  const [query, setQuery] = useState('')
  const { value: tab, set: setTab } = useStoredValue<SidebarTab>({
    storageKey: SIDEBAR_TAB_STORAGE_KEY,
    initialValue: 'decisions',
    isValid: isSidebarTab
  })
  const isDecisionTab = tab === 'decisions'
  const meetingList = useMeetings()
  const decisionList = useDecisions()
  const { types, isLoading: isTypesLoading } = useDecisionTypes()
  // 보이지 않는 탭의 대상까지 찾지 않도록 선택한 탭에만 질의를 준다
  const meetingSearch = useMeetingSearch({ query: isDecisionTab ? '' : query })
  const decisionSearch = useDecisionSearch({ query: isDecisionTab ? query : '' })
  const search = isDecisionTab ? decisionSearch : meetingSearch

  // 검색어가 있으면 검색 입력의 Esc가 먼저 검색을 지운다 (SearchField가 이벤트를 막는다)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    onClose()
  }

  const navLabelOf = () => {
    if (search.isActive) return t.sidebar.nav.searchResults

    return isDecisionTab ? t.decisions.sidebar.navLabel : t.sidebar.nav.meetingList
  }

  const renderDecisionTab = () =>
    decisionSearch.isActive ? (
      <DecisionSearchResultList
        query={query}
        results={decisionSearch.results}
        isSearching={decisionSearch.isSearching}
        error={decisionSearch.error}
      />
    ) : (
      <DecisionList
        meetings={meetingList.meetings}
        decisions={decisionList.decisions}
        types={types}
        isLoading={decisionList.isLoading || isTypesLoading}
        error={decisionList.error}
        onRetry={decisionList.refetch}
      />
    )

  const renderMeetingTab = () =>
    meetingSearch.isActive ? (
      <SearchResultList
        query={query}
        results={meetingSearch.results}
        isSearching={meetingSearch.isSearching}
        error={meetingSearch.error}
      />
    ) : (
      <MeetingList
        meetings={meetingList.meetings}
        isLoading={meetingList.isLoading}
        error={meetingList.error}
        onRetry={meetingList.refetch}
      />
    )

  return (
    <aside className={styles.panel} onKeyDown={handleKeyDown}>
      <div className={styles.header}>
        <SidebarTabs tab={tab} panelId={panelId} onChange={setTab} />
        <SearchField
          value={query}
          placeholder={
            isDecisionTab ? t.decisions.sidebar.searchPlaceholder : t.sidebar.search.placeholder
          }
          onChange={setQuery}
        />
      </div>
      <nav id={panelId} className={styles.body} aria-label={navLabelOf()}>
        {isDecisionTab ? renderDecisionTab() : renderMeetingTab()}
      </nav>
    </aside>
  )
}
