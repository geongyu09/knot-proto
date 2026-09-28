// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { RecordingStateEvent } from '@shared/ipc'

vi.mock('@renderer/shared/api/recording', () => ({
  requestMicrophonePermissionApi: vi.fn(),
  startRecordingApi: vi.fn(),
  sendRecordingChunkApi: vi.fn(),
  stopRecordingApi: vi.fn(),
  getRecordingStateApi: vi.fn(),
  setSpeakerCountApi: vi.fn(),
  reportRecordingErrorApi: vi.fn(),
  setRecordingPausedApi: vi.fn()
}))

vi.mock('@renderer/shared/api/events', () => ({
  onRecordingState: vi.fn(),
  onRecordingCommand: vi.fn(),
  onModelDownloadProgress: vi.fn(),
  onModelsChanged: vi.fn()
}))

vi.mock('@renderer/shared/api/models', () => ({
  getModelStatusApi: vi.fn(),
  downloadModelsApi: vi.fn(),
  downloadSummaryModelApi: vi.fn()
}))

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn().mockResolvedValue({ inputDevice: null })
}))

import { onModelsChanged, onRecordingCommand, onRecordingState } from '@renderer/shared/api/events'
import { getModelStatusApi } from '@renderer/shared/api/models'
import {
  getRecordingStateApi,
  reportRecordingErrorApi,
  requestMicrophonePermissionApi,
  startRecordingApi,
  stopRecordingApi
} from '@renderer/shared/api/recording'
import type { RecordingCommandEvent } from '@shared/ipc'
import RecorderHostSection from './index'

const MEETING_ID = 'meeting-1'
const IDLE_STATE: RecordingStateEvent = {
  meetingId: null,
  startedAt: null,
  pausedAt: null,
  level: 0,
  liveTranscript: { isEnabled: false, lines: [], partial: '' },
  systemAudio: { isEnabled: false }
}

const READY_MODEL_STATUS = {
  isReady: true,
  isSummaryReady: false,
  selectedWhisperModelId: 'turbo-q5' as const,
  recommendedWhisperModelId: 'turbo-q5' as const,
  whisperOptions: [],
  items: []
}

/** main이 보내는 녹음 명령을 테스트에서 직접 흘려보내기 위해 구독자를 잡아 둔다 */
let pushCommand: (event: RecordingCommandEvent) => void = () => {}

/** 메인 창에서 모델을 다 받았다는 알림을 흘려보낸다 */
let pushModelsChanged: () => void = () => {}

/** happy-dom에는 오디오 그래프가 없어 호스트가 쓰는 최소한만 흉내 낸다 */
const stubAudioGraph = () => {
  class FakeAudioWorkletNode {
    port: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null } = { onmessage: null }
    connect = <T,>(node: T) => node
    disconnect = () => {}
  }

  class FakeAudioContext {
    sampleRate = 16000
    destination = {}
    audioWorklet = { addModule: () => Promise.resolve() }
    createGain = () => ({ gain: { value: 1 }, connect: <T,>(node: T) => node })
    createMediaStreamSource = () => ({ connect: <T,>(node: T) => node })
    close = () => Promise.resolve()
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) }
  })
}

beforeEach(() => {
  stubAudioGraph()
  vi.mocked(onRecordingState).mockImplementation(() => () => {})
  vi.mocked(onRecordingCommand).mockImplementation((listener) => {
    pushCommand = listener

    return () => {}
  })
  vi.mocked(onModelsChanged).mockImplementation((listener) => {
    pushModelsChanged = listener

    return () => {}
  })
  vi.mocked(getRecordingStateApi).mockResolvedValue(IDLE_STATE)
  vi.mocked(getModelStatusApi).mockResolvedValue(READY_MODEL_STATUS)
  vi.mocked(requestMicrophonePermissionApi).mockResolvedValue(true)
  vi.mocked(startRecordingApi).mockResolvedValue(MEETING_ID)
  vi.mocked(reportRecordingErrorApi).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** 모델 상태 조회가 끝나 녹음 명령 구독이 준비된 값으로 다시 걸릴 때까지 기다린다 */
const renderHost = async () => {
  render(<RecorderHostSection />)
  await act(async () => {})
}

describe('RecorderHostSection', () => {
  it('화면에 아무것도 그리지 않는다', () => {
    const { container } = render(<RecorderHostSection />)

    expect(container.innerHTML).toBe('')
  })

  it('시작 명령을 받으면 마이크 권한을 받고 녹음을 시작한다', async () => {
    await renderHost()

    await act(async () => pushCommand({ kind: 'start' }))

    await waitFor(() => expect(startRecordingApi).toHaveBeenCalledWith({ sampleRate: 16000 }))
    expect(requestMicrophonePermissionApi).toHaveBeenCalled()
  })

  it('녹음 중 토글 명령을 받으면 그 회의의 녹음을 끝낸다', async () => {
    await renderHost()
    await act(async () => pushCommand({ kind: 'start' }))
    await waitFor(() => expect(startRecordingApi).toHaveBeenCalled())

    await act(async () => pushCommand({ kind: 'toggle' }))

    await waitFor(() => expect(stopRecordingApi).toHaveBeenCalledWith({ meetingId: MEETING_ID }))
  })

  it('모델이 준비되지 않았으면 시작하지 않고 실패를 알린다', async () => {
    vi.mocked(getModelStatusApi).mockResolvedValue({ ...READY_MODEL_STATUS, isReady: false })
    await renderHost()

    await act(async () => pushCommand({ kind: 'start' }))

    await waitFor(() => expect(reportRecordingErrorApi).toHaveBeenCalled())
    expect(startRecordingApi).not.toHaveBeenCalled()
  })

  it('다른 창에서 모델을 다 받으면 상태를 다시 읽어 녹음할 수 있다', async () => {
    vi.mocked(getModelStatusApi).mockResolvedValueOnce({ ...READY_MODEL_STATUS, isReady: false })
    render(<RecorderHostSection />)
    await waitFor(() => expect(getModelStatusApi).toHaveBeenCalledTimes(1))

    await act(async () => pushModelsChanged())
    await waitFor(() => expect(getModelStatusApi).toHaveBeenCalledTimes(2))
    await act(async () => pushCommand({ kind: 'start' }))

    await waitFor(() => expect(startRecordingApi).toHaveBeenCalled())
  })

  it('마이크 권한이 없으면 녹음을 시작하지 않고 실패를 알린다', async () => {
    vi.mocked(requestMicrophonePermissionApi).mockResolvedValue(false)
    await renderHost()

    await act(async () => pushCommand({ kind: 'start' }))

    await waitFor(() => expect(reportRecordingErrorApi).toHaveBeenCalled())
    expect(startRecordingApi).not.toHaveBeenCalled()
  })
})
