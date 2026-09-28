/** 선택한 탭과 접은 묶음. 창 단위 화면 선호라 SQLite가 아니라 localStorage에 둔다 (열림 상태와 같은 규칙) */
export const SIDEBAR_TAB_STORAGE_KEY = 'meetingSidebar.tab'
export const COLLAPSED_GROUPS_STORAGE_KEY = 'meetingSidebar.collapsedDecisionGroups'

/** 날짜 묶음·"오늘" 표기가 자정을 넘기면 바뀌어야 하므로 1분마다 현재 시각을 새로 읽는다 */
export const NOW_REFRESH_MS = 60_000
