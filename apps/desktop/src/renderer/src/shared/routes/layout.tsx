import { useEffect } from 'react'
import { Outlet, useMatch, useNavigate } from 'react-router'
import UpdateBanner from '@renderer/modules/features/update/UpdateBanner'
import MeetingSidebarSection from '@renderer/modules/widgets/meeting/MeetingSidebarSection'
import GnbSection from '@renderer/modules/widgets/navigation/GnbSection'
import DockSection from '@renderer/modules/widgets/recording/DockSection'
import { onRecordingState } from '@renderer/shared/api/events'
import useStoredToggle from '@renderer/shared/hooks/common/useStoredToggle'
import useScreenTracking from '@renderer/shared/hooks/domain/telemetry/useScreenTracking'

import { PATHS, meetingDetailPath } from './paths'
import styles from './layout.module.css'

/**
 * 메인 창의 공통 레이아웃. 녹음이 어디서 정지됐든(녹음 화면·메뉴바·단축키) 결과 화면으로 데려간다 —
 * 녹음을 끝낸 직후에 보고 싶은 것은 회의록이다 (references/architecture.md).
 * 녹음 호스트 창은 이 레이아웃 밖에 있어 스스로 이동하지 않는다.
 */
export function MainWindowLayout() {
  const navigate = useNavigate()
  useScreenTracking()

  useEffect(
    () =>
      onRecordingState(({ stoppedMeetingId }) => {
        if (stoppedMeetingId) navigate(meetingDetailPath({ meetingId: stoppedMeetingId }))
      }),
    [navigate]
  )

  return <Outlet />
}

/** 회의 목록 패널 열림 상태. 창 단위 화면 선호라 SQLite가 아니라 localStorage에 둔다 */
const MEETING_LIST_OPEN_KEY = 'meetingSidebar.isOpen'

/**
 * 상단 GNB · 회의 목록 패널 · 본문 · 하단 독 (knot, references/architecture.md "메인 창 레이아웃").
 * 목록 패널은 본문 위에 겹치지 않고 본문을 밀어낸다. 녹음 화면에는 같은 조작이 크게 있어 독을 숨긴다.
 * 업데이트 알림은 어느 화면에서든 보이도록 본문 위에 둔다.
 */
export function AppShellLayout() {
  const {
    isOn: isListOpen,
    set: setListOpen,
    toggle: toggleList
  } = useStoredToggle({
    storageKey: MEETING_LIST_OPEN_KEY,
    initialValue: false
  })
  const isRecordRoute = useMatch(PATHS.record) !== null

  return (
    <div className={styles.shell}>
      <GnbSection isListOpen={isListOpen} onToggleList={toggleList} />
      <div className={styles.body}>
        {isListOpen ? <MeetingSidebarSection onClose={() => setListOpen(false)} /> : null}
        <main className={[styles.main, isRecordRoute ? '' : styles.withDock].join(' ')}>
          <UpdateBanner />
          <Outlet />
        </main>
      </div>
      {isRecordRoute ? null : (
        <div className={styles.dockSlot}>
          <DockSection />
        </div>
      )}
    </div>
  )
}
