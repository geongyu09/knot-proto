// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppSettings } from '@shared/types'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn(),
  updateSettingsApi: vi.fn()
}))

import { getSettingsApi, updateSettingsApi } from '@renderer/shared/api/settings'
import AutoRefineToggle from './index'

const SETTINGS: AppSettings = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  recordingShortcut: 'Alt+Command+R',
  inputDevice: null,
  locale: 'ko',
  isAutoRefineExternal: false
}

const TOGGLE_NAME = '회의록을 만들면 자동으로 교정'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AutoRefineToggle', () => {
  it('기본은 꺼져 있고 회의록이 외부로 전송된다는 설명을 보여 준다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(SETTINGS)
    render(<AutoRefineToggle />)

    const toggle = await screen.findByRole('switch', { name: TOGGLE_NAME })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/회의록이 선택한 공급자 서버로 전송됩니다/)).toBeTruthy()
  })

  it('켜면 main의 최신 설정에 합쳐 저장한다', async () => {
    const user = userEvent.setup()
    // 다른 화면이 그사이 저장한 값(원본 보관)을 덮어쓰지 않아야 한다
    const latest = { ...SETTINGS, isAudioKept: true }
    vi.mocked(getSettingsApi).mockResolvedValueOnce(SETTINGS).mockResolvedValue(latest)
    vi.mocked(updateSettingsApi).mockResolvedValue({ ...latest, isAutoRefineExternal: true })
    render(<AutoRefineToggle />)

    await user.click(await screen.findByRole('switch', { name: TOGGLE_NAME }))

    await waitFor(() =>
      expect(updateSettingsApi).toHaveBeenCalledWith({ ...latest, isAutoRefineExternal: true })
    )
    expect(
      (await screen.findByRole('switch', { name: TOGGLE_NAME })).getAttribute('aria-checked')
    ).toBe('true')
  })
})
