// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

vi.mock('@renderer/shared/api/settings', () => ({
  getSettingsApi: vi.fn()
}))
vi.mock('@renderer/shared/api/events', () => ({
  onSettingsChanged: vi.fn()
}))

import type { SettingsChangedEvent } from '@shared/ipc'
import type { AppSettings } from '@shared/types'
import { onSettingsChanged } from '@renderer/shared/api/events'
import { getSettingsApi } from '@renderer/shared/api/settings'
import { LocaleProvider, useLocale } from './index'

const SETTINGS: AppSettings = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  recordingShortcut: 'Alt+Command+R',
  inputDevice: null,
  locale: 'ko',
  isAutoRefineExternal: false
}

function Probe() {
  const { locale, t } = useLocale()

  return (
    <p>
      {locale}:{t.main.tray.quit}
    </p>
  )
}

describe('LocaleProvider', () => {
  let emitSettingsChanged: (event: SettingsChangedEvent) => void = () => {}

  beforeEach(() => {
    vi.mocked(onSettingsChanged).mockImplementation((listener) => {
      emitSettingsChanged = listener

      return () => {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('Provider 없이도 기본값(한국어)으로 읽힌다', () => {
    render(<Probe />)

    expect(screen.getByText('ko:종료')).toBeTruthy()
  })

  it('설정의 언어를 읽어 적용하고 html lang을 맞춘다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue({ ...SETTINGS, locale: 'en' })

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    )

    expect(await screen.findByText('en:Quit')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })

  it('다른 창이 저장한 설정 push를 따라간다', async () => {
    vi.mocked(getSettingsApi).mockResolvedValue(SETTINGS)

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    )
    expect(await screen.findByText('ko:종료')).toBeTruthy()

    act(() => emitSettingsChanged({ ...SETTINGS, locale: 'en' }))

    expect(await screen.findByText('en:Quit')).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })

  it('설정을 못 읽어도 기본 언어로 뜬다', async () => {
    vi.mocked(getSettingsApi).mockRejectedValue(new Error('ipc down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    )

    expect(await screen.findByText('ko:종료')).toBeTruthy()
    expect(warn).toHaveBeenCalled()
  })
})
