// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn(),
  setShortcutsSuspendedApi: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@renderer/shared/api/update', () => ({
  checkUpdateApi: vi.fn(),
  downloadUpdateApi: vi.fn(),
  installUpdateApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onUpdateAvailable: vi.fn(() => () => {}),
  onRecordingState: vi.fn(() => () => {})
}))
vi.mock('@renderer/shared/api/recording', () => ({
  requestMicrophonePermissionApi: vi.fn().mockResolvedValue(true),
  getRecordingStateApi: vi.fn()
}))

import type { RecordingStateEvent } from '@shared/ipc'
import { getRecordingStateApi } from '@renderer/shared/api/recording'
import {
  getSettingsApi,
  setShortcutsSuspendedApi,
  updateSettingsApi
} from '@renderer/shared/api/settings'
import SettingsSection from './index'

const AUDIO_LABEL = '원본 녹음 파일 보관'
/** 팀 테스트 빌드는 업데이트 스위치를 숨긴다 (references/telemetry.md "빌드 분리") */
const UPDATE_LABEL = '시작할 때 업데이트 확인'
const QUIET_LABEL = '조용히 처리'
const RECORDING_SHORTCUT_BUTTON = '녹음 시작·정지 변경'
const LOCALE_LABEL = 'UI 언어'

/** 설정 행의 켜기/끄기는 제목을 이름으로 갖는 role="switch" 버튼이다 */
const findSwitch = (name: string) => screen.findByRole('switch', { name })
const isOn = (element: HTMLElement) => element.getAttribute('aria-checked') === 'true'

const DEVICE_LABEL = '입력 장치'
const TEST_START_BUTTON = '테스트 시작'
const TEST_STOP_BUTTON = '테스트 정지'
const USB_DEVICE = { deviceId: 'usb-1', label: 'USB 마이크' }
const BUILT_IN_DEVICE = { deviceId: 'builtin-1', label: 'MacBook Pro 마이크' }
const IDLE_STATE: RecordingStateEvent = {
  meetingId: null,
  startedAt: null,
  pausedAt: null,
  level: 0,
  liveTranscript: { isEnabled: false, lines: [], partial: '' },
  systemAudio: { isEnabled: false }
}

const DEFAULT_SETTINGS = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  recordingShortcut: 'Alt+Command+R',
  inputDevice: null,
  locale: 'ko' as const,
  isAutoRefineExternal: false
}

const toDeviceInfo = ({ deviceId, label }: { deviceId: string; label: string }) => ({
  deviceId,
  label,
  kind: 'audioinput' as const,
  groupId: deviceId
})

/** happy-dom에는 장치 목록·오디오 그래프가 없어 설정 화면이 쓰는 최소한만 흉내 낸다 */
const stubMediaDevices = (devices: { deviceId: string; label: string }[]) => {
  const stream = { getTracks: () => [] }
  vi.stubGlobal('navigator', {
    mediaDevices: {
      enumerateDevices: () => Promise.resolve(devices.map(toDeviceInfo)),
      getUserMedia: vi.fn(() => Promise.resolve(stream)),
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  })

  class FakeAnalyserNode {
    fftSize = 2048
    connect = <T,>(node: T) => node
    getFloatTimeDomainData = (samples: Float32Array) => samples.fill(0.2)
  }

  class FakeAudioContext {
    sampleRate = 16000
    destination = {}
    createAnalyser = () => new FakeAnalyserNode()
    createGain = () => ({ gain: { value: 1 }, connect: <T,>(node: T) => node })
    createMediaStreamSource = () => ({ connect: <T,>(node: T) => node })
    close = () => Promise.resolve()
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
}

beforeEach(() => {
  stubMediaDevices([BUILT_IN_DEVICE, USB_DEVICE])
  vi.mocked(getRecordingStateApi).mockResolvedValue(IDLE_STATE)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SettingsSection', () => {
  it('원본 녹음 보관이 꺼진 상태를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)

    expect(isOn(await findSwitch(AUDIO_LABEL))).toBe(false)
    expect(screen.getByText(/보관하지 않은 회의는 나중에 다시 처리할 수 없습니다/)).toBeTruthy()
  })

  it('보관을 켜면 설정을 저장하고 결과를 반영한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, isAudioKept: true })
    render(<SettingsSection />)

    await user.click(await findSwitch(AUDIO_LABEL))

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, isAudioKept: true })
    expect(isOn(await findSwitch(AUDIO_LABEL))).toBe(true)
  })

  it('업데이트 자리에 팀 테스트 빌드 안내를 보여 주고 업데이트 스위치는 두지 않는다', async () => {
    render(<SettingsSection />)

    expect(await screen.findByText(/팀 테스트 빌드입니다/)).toBeTruthy()
    expect(screen.queryByRole('switch', { name: UPDATE_LABEL })).toBeNull()
  })

  it('조용히 처리를 켜면 느려진다는 안내와 함께 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, isQuietProcessing: true })
    render(<SettingsSection />)

    const toggle = await findSwitch(QUIET_LABEL)
    expect(isOn(toggle)).toBe(false)
    expect(screen.getByText(/처리 시간이 길어지고/)).toBeTruthy()

    await user.click(toggle)

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, isQuietProcessing: true })
    expect(isOn(await findSwitch(QUIET_LABEL))).toBe(true)
  })

  it('저장에 실패하면 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockRejectedValue(new Error('설정을 저장하지 못했습니다'))
    render(<SettingsSection />)

    await user.click(await findSwitch(AUDIO_LABEL))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('설정을 저장하지 못했습니다')).toBeTruthy()
  })

  it('단축키를 입력받는 동안 전역 단축키를 풀고, 누른 조합을 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      recordingShortcut: 'Control+Shift+F5'
    })
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: RECORDING_SHORTCUT_BUTTON })
    expect(button.textContent).toBe('⌥⌘R')

    await user.click(button)
    expect(setShortcutsSuspendedApi).toHaveBeenLastCalledWith({ isSuspended: true })

    fireEvent.keyDown(button, { code: 'F5', key: 'F5', ctrlKey: true, shiftKey: true })

    await waitFor(() =>
      expect(updateSettingsApi).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        recordingShortcut: 'Control+Shift+F5'
      })
    )
    expect(await screen.findByText('⌃⇧F5')).toBeTruthy()
    expect(setShortcutsSuspendedApi).toHaveBeenLastCalledWith({ isSuspended: false })
  })

  it('수식키 없는 입력은 무시하고 Esc로 취소한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: RECORDING_SHORTCUT_BUTTON })
    await user.click(button)

    fireEvent.keyDown(button, { code: 'KeyA', key: 'a' })
    expect(button.textContent).toBe('키를 누르세요…')

    fireEvent.keyDown(button, { code: 'Escape', key: 'Escape' })

    expect(await screen.findByText('⌥⌘R')).toBeTruthy()
    expect(updateSettingsApi).not.toHaveBeenCalled()
    expect(setShortcutsSuspendedApi).toHaveBeenLastCalledWith({ isSuspended: false })
  })

  it('단축키 등록에 실패하면 main의 안내를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockRejectedValue(
      new Error('단축키 ⌘Space를 등록하지 못했습니다. 다른 앱이 쓰는 중일 수 있습니다')
    )
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: RECORDING_SHORTCUT_BUTTON })
    await user.click(button)
    fireEvent.keyDown(button, { code: 'Space', key: ' ', metaKey: true })

    expect(await screen.findByText(/⌘Space를 등록하지 못했습니다/)).toBeTruthy()
    expect(button.textContent).toBe('⌥⌘R')
  })

  it('설정을 불러오지 못하면 오류를 보여준다', async () => {
    vi.mocked(getSettingsApi).mockRejectedValue(new Error('설정을 불러오지 못했습니다'))
    render(<SettingsSection />)

    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('설정을 카테고리별로 묶고 children을 단축키와 업데이트 사이에 둔다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(
      <SettingsSection>
        <section aria-label="음성 인식 모델" />
      </SettingsSection>
    )

    await findSwitch(AUDIO_LABEL)
    const regions = screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label') ?? region.querySelector('h2')?.textContent)
    expect(regions).toEqual(['마이크', '녹음·처리', '단축키', '음성 인식 모델', '업데이트', '언어'])
    expect(
      within(screen.getByRole('region', { name: '녹음·처리' })).getByRole('switch', {
        name: QUIET_LABEL
      })
    ).toBeTruthy()
  })

  it('연결된 마이크를 고르면 장치 id와 이름을 함께 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, inputDevice: USB_DEVICE })
    render(<SettingsSection />)

    const select = (await screen.findByRole('combobox', {
      name: DEVICE_LABEL
    })) as HTMLSelectElement
    expect(await screen.findByRole('option', { name: 'USB 마이크' })).toBeTruthy()
    expect(select.value).toBe('')

    await user.selectOptions(select, 'usb-1')

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, inputDevice: USB_DEVICE })
    expect(
      ((await screen.findByRole('combobox', { name: DEVICE_LABEL })) as HTMLSelectElement).value
    ).toBe('usb-1')
  })

  it('시스템 기본 마이크로 되돌리면 null을 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, inputDevice: USB_DEVICE })
    vi.mocked(updateSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)

    const select = await screen.findByRole('combobox', { name: DEVICE_LABEL })
    await screen.findByRole('option', { name: 'USB 마이크' })
    await user.selectOptions(select, '')

    expect(updateSettingsApi).toHaveBeenCalledWith(DEFAULT_SETTINGS)
  })

  it('골라 둔 마이크가 빠져 있으면 연결되지 않았다고 알리고 기본 마이크 폴백을 안내한다', async () => {
    stubMediaDevices([BUILT_IN_DEVICE])
    vi.mocked(getSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, inputDevice: USB_DEVICE })
    render(<SettingsSection />)

    expect(await screen.findByRole('option', { name: 'USB 마이크 (연결되지 않음)' })).toBeTruthy()
    expect(screen.getByText(/고른 마이크가 연결돼 있지 않습니다/)).toBeTruthy()
  })

  it('마이크 테스트를 시작하면 입력 세기를 보여주고 정지하면 지운다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)

    await user.click(await screen.findByRole('button', { name: TEST_START_BUTTON }))

    expect(await screen.findByRole('meter', { name: '마이크 입력 세기' })).toBeTruthy()
    expect(await screen.findByText('소리가 잘 들어옵니다.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: TEST_STOP_BUTTON }))

    expect(await screen.findByRole('button', { name: TEST_START_BUTTON })).toBeTruthy()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('마이크를 열지 못하면 테스트가 그 이유를 보여준다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    render(<SettingsSection />)
    await screen.findByRole('option', { name: 'USB 마이크' })
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error('Permission denied')
    )

    await user.click(await screen.findByRole('button', { name: TEST_START_BUTTON }))

    expect(await screen.findByText('Permission denied')).toBeTruthy()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('녹음 중에는 마이크 테스트를 막는다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(getRecordingStateApi).mockResolvedValue({
      ...IDLE_STATE,
      meetingId: 'meeting-1',
      startedAt: Date.now(),
      level: 0.1
    })
    render(<SettingsSection />)

    const button = await screen.findByRole('button', { name: TEST_START_BUTTON })
    expect(await screen.findByText(/녹음 중에는 테스트할 수 없습니다/)).toBeTruthy()
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('UI 언어를 English로 바꾸면 locale을 저장한다', async () => {
    const user = userEvent.setup()
    vi.mocked(getSettingsApi).mockResolvedValue(DEFAULT_SETTINGS)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...DEFAULT_SETTINGS, locale: 'en' })
    render(<SettingsSection />)

    const select = (await screen.findByRole('combobox', {
      name: LOCALE_LABEL
    })) as HTMLSelectElement
    expect(select.value).toBe('ko')
    expect(screen.getByRole('option', { name: 'English' })).toBeTruthy()

    await user.selectOptions(select, 'en')

    expect(updateSettingsApi).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, locale: 'en' })
    expect(
      ((await screen.findByRole('combobox', { name: LOCALE_LABEL })) as HTMLSelectElement).value
    ).toBe('en')
  })

  it('설정을 못 불러와도 children은 보여준다', async () => {
    vi.mocked(getSettingsApi).mockRejectedValue(new Error('실패'))
    render(
      <SettingsSection>
        <p>모델 영역</p>
      </SettingsSection>
    )

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('모델 영역')).toBeTruthy()
  })
})
