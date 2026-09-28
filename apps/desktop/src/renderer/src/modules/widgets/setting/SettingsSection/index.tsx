import type { ReactNode } from 'react'
import { DEFAULT_RECORDING_SHORTCUT } from '@shared/shortcut'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import useInputDevices from '@renderer/shared/hooks/domain/recording/useInputDevices'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import InputDeviceSelect from './ui/InputDeviceSelect'
import LocaleSelect from './ui/LocaleSelect'
import MicrophoneTest from './ui/MicrophoneTest'
import SettingToggle from './ui/SettingToggle'
import ShortcutField from './ui/ShortcutField'
import styles from './index.module.css'

interface SettingsSectionProps {
  /** 단축키와 업데이트 사이에 끼울 카테고리. 설정 화면은 모델 위젯을 넣는다 */
  children?: ReactNode
}

export default function SettingsSection({ children }: SettingsSectionProps) {
  const { t } = useLocale()
  const { settings, isLoading, error, updateSettings } = useSettings()
  const { devices, isLoading: isDevicesLoading, error: devicesError } = useInputDevices()
  const { isRecording } = useRecordingState()

  // 모델 카테고리는 설정값과 무관하므로 설정을 못 불러와도 보여준다
  if (isLoading && !settings) {
    return (
      <div className={styles.section}>
        <p className={styles.message}>{t.settings.loading}</p>
        {children}
      </div>
    )
  }
  if (!settings) {
    return (
      <div className={styles.section}>
        <p className={styles.error} role="alert">
          {error?.message ?? t.settings.loadError}
        </p>
        {children}
      </div>
    )
  }

  return (
    <div className={styles.section}>
      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}
      <SettingGroup title={t.settings.groups.microphone}>
        <InputDeviceSelect
          value={settings.inputDevice}
          devices={devices}
          isLoading={isDevicesLoading}
          error={devicesError}
          onChange={(inputDevice) => updateSettings({ inputDevice })}
        />
        <MicrophoneTest inputDevice={settings.inputDevice} isRecording={isRecording} />
      </SettingGroup>
      <SettingGroup title={t.settings.groups.recording}>
        <SettingToggle
          title={t.settings.audioKeep.title}
          isChecked={settings.isAudioKept}
          onChange={(isAudioKept) => updateSettings({ isAudioKept })}
        >
          {t.settings.audioKeep.description}
        </SettingToggle>
        <SettingToggle
          title={t.settings.quietProcessing.title}
          isChecked={settings.isQuietProcessing}
          onChange={(isQuietProcessing) => updateSettings({ isQuietProcessing })}
        >
          {t.settings.quietProcessing.description}
        </SettingToggle>
      </SettingGroup>
      <SettingGroup title={t.settings.groups.shortcut}>
        <ShortcutField
          title={t.settings.recordingShortcut.title}
          accelerator={settings.recordingShortcut}
          defaultAccelerator={DEFAULT_RECORDING_SHORTCUT}
          onChange={(recordingShortcut) => updateSettings({ recordingShortcut })}
        >
          {t.settings.recordingShortcut.description}
        </ShortcutField>
      </SettingGroup>
      {children}
      {/* 팀 테스트 빌드는 자동 업데이트를 쓰지 않고, 수집 빌드임을 여기 적는다 (references/telemetry.md "빌드 분리") */}
      <SettingGroup title={t.settings.groups.update}>
        <p className={styles.message}>{t.settings.teamBuild.notice}</p>
      </SettingGroup>
      <SettingGroup title={t.settings.groups.language}>
        <LocaleSelect value={settings.locale} onChange={(locale) => updateSettings({ locale })} />
      </SettingGroup>
    </div>
  )
}
