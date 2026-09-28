import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecordingStateEvent } from '@shared/ipc'
import { onRecordingState } from '@renderer/shared/api/events'
import { getRecordingStateApi } from '@renderer/shared/api/recording'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

const ELAPSED_TICK_MS = 200
const MS_PER_SEC = 1000

const IDLE_STATE: RecordingStateEvent = {
  meetingId: null,
  startedAt: null,
  pausedAt: null,
  level: 0,
  liveTranscript: { isEnabled: false, lines: [], partial: '' },
  systemAudio: { isEnabled: false }
}

/**
 * 진행 중 녹음의 상태를 구독한다. 단일 출처는 main의 녹음 세션이고 녹음 호스트 창과 메인 창이 같은 값을 본다
 * (references/architecture.md의 "녹음 호스트 창 · 메뉴바 · 전역 단축키").
 */
const useRecordingState = () => {
  const { t } = useLocale()
  const [state, setState] = useState(IDLE_STATE)
  const [now, setNow] = useState(() => Date.now())
  const isEventReceivedRef = useRef(false)

  // 상태가 바뀐 순간의 시각을 함께 잡아 둔다. 그러지 않으면 녹음 중에 연 창이
  // 첫 타이머(약 0.2초)가 돌기 전까지 경과 시간을 0으로 보여준다
  const applyState = useCallback((next: RecordingStateEvent) => {
    setState(next)
    setNow(Date.now())
  }, [])

  const applyEvent = useCallback(
    (next: RecordingStateEvent) => {
      isEventReceivedRef.current = true
      applyState(next)
    },
    [applyState]
  )

  // 늦게 열린 창은 상태 이벤트를 놓쳤을 수 있어 현재 값을 한 번 물어본다
  useEffect(() => {
    getRecordingStateApi()
      .then((next) => {
        // 조회하는 동안 이벤트가 먼저 왔다면 그쪽이 더 새롭다. 오래된 스냅샷으로 덮지 않는다
        if (!isEventReceivedRef.current) applyState(next)
      })
      .catch(() =>
        setState((current) => ({
          ...current,
          errorMessage: t.recording.errors.stateUnavailable
        }))
      )
  }, [applyState, t])

  useEffect(() => onRecordingState(applyEvent), [applyEvent])

  // main이 옛 빌드면 pausedAt이 아예 없다(undefined). 그걸 일시정지로 읽으면 녹음 중에 재개 버튼이 뜬다
  const pausedAt = state.pausedAt ?? null
  const isPaused = pausedAt !== null

  // 경과 시간은 startedAt으로 각자 계산한다 — 창이 가려져 렌더가 밀려도 값이 정확하다.
  // 일시정지 중에는 pausedAt에서 멈춰 있으므로 타이머를 돌리지 않는다
  useEffect(() => {
    if (state.startedAt === null || isPaused) return

    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS)

    return () => clearInterval(timer)
  }, [state.startedAt, isPaused])

  const elapsedSec =
    state.startedAt === null ? 0 : Math.max(0, ((pausedAt ?? now) - state.startedAt) / MS_PER_SEC)

  return {
    isRecording: state.meetingId !== null,
    isPaused,
    meetingId: state.meetingId,
    level: state.level,
    speakerCount: state.speakerCount,
    errorMessage: state.errorMessage,
    liveTranscript: state.liveTranscript,
    systemAudio: state.systemAudio,
    elapsedSec
  }
}

export default useRecordingState
