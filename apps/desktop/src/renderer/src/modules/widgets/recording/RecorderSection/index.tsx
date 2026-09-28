import { useState } from 'react'
import { formatAccelerator } from '@shared/shortcut'
import PauseRecordingButton from '@renderer/modules/features/recording/PauseRecordingButton'
import {
  controlRecordingApi,
  setLiveTranscriptApi,
  setSystemAudioApi
} from '@renderer/shared/api/recording'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import Button from '@renderer/shared/components/primitives/ui/Button'
import LevelWaveform from '@renderer/shared/components/primitives/ui/LevelWaveform'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import useSpeakerCount from '@renderer/shared/hooks/domain/recording/useSpeakerCount'
import useSettings from '@renderer/shared/hooks/domain/setting/useSettings'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatClock } from '@renderer/shared/utils/formatClock'

import LiveTranscriptView from './ui/LiveTranscriptView'
import RecordingOptionsPanel from './ui/RecordingOptionsPanel'
import ViewModeToggle from './ui/ViewModeToggle'
import styles from './index.module.css'

const WAVEFORM_BAR_COUNT = 48

/**
 * 메인 창의 녹음 화면. 오디오 그래프는 녹음 호스트 창이 들고 있으므로 여기서는 명령을 보내고
 * 상태를 구독만 한다 (references/architecture.md의 "녹음 호스트 창 · 메뉴바 · 전역 단축키").
 * 상태가 바뀌어도 요소가 움직이지 않도록 자리를 고정해 두고 내용만 바꾼다 ("화면별 구성" > 녹음).
 */
export default function RecorderSection() {
  const { t: messages } = useLocale()
  const t = messages.recording
  const {
    isRecording,
    isPaused,
    level,
    elapsedSec,
    speakerCount,
    errorMessage,
    liveTranscript,
    systemAudio
  } = useRecordingState()
  const { text, isValid, changeText } = useSpeakerCount({ speakerCount })
  const { settings } = useSettings()
  const [controlError, setControlError] = useState<string | null>(null)
  const [isSystemAudioBusy, setIsSystemAudioBusy] = useState(false)

  // 켜기는 main이 도구를 잠깐 돌려 권한 창을 띄우므로 끝날 때까지 스위치를 잠근다
  const handleSystemAudioChange = async (isEnabled: boolean) => {
    setIsSystemAudioBusy(true)
    try {
      await setSystemAudioApi({ isEnabled })
      setControlError(null)
    } catch {
      setControlError(t.systemAudio.toggleError)
    } finally {
      setIsSystemAudioBusy(false)
    }
  }

  const handleViewChange = async (isLive: boolean) => {
    try {
      await setLiveTranscriptApi({ isEnabled: isLive })
      setControlError(null)
    } catch {
      setControlError(t.live.toggleError)
    }
  }

  const handleControl = async (kind: 'start' | 'stop') => {
    try {
      await controlRecordingApi({ kind })
      setControlError(null)
    } catch {
      setControlError(t.recorder.controlError)
    }
  }

  const renderStatus = () => {
    if (!isRecording) return t.status.idle

    return isPaused ? t.status.paused : t.status.recording
  }

  const renderControls = () => {
    if (!isRecording) {
      return (
        <Button className={styles.controlButton} onClick={() => handleControl('start')}>
          <span className={styles.startIcon} aria-hidden="true" />
          {t.recorder.start}
        </Button>
      )
    }

    return (
      <>
        <PauseRecordingButton
          isPaused={isPaused}
          className={styles.pauseButton}
          onError={setControlError}
        />
        <Button className={styles.controlButton} onClick={() => handleControl('stop')}>
          <span className={styles.stopIcon} aria-hidden="true" />
          {t.recorder.stopAndTranscribe}
        </Button>
      </>
    )
  }

  const message = controlError ?? errorMessage

  return (
    <section className={styles.section} aria-label={t.recorder.sectionLabel}>
      <header className={styles.header}>
        <div className={styles.statusRow}>
          <span className={isRecording && !isPaused ? styles.recordingStatus : styles.idleStatus}>
            <span className={styles.dot} aria-hidden="true" />
            {renderStatus()}
          </span>
          {isRecording && systemAudio.isEnabled ? (
            <Badge tone="accent">{t.systemAudio.badge}</Badge>
          ) : null}
        </div>
        <p className={isRecording ? styles.elapsed : styles.idleElapsed}>
          {formatClock({ sec: elapsedSec })}
        </p>
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          <div className={styles.display}>
            <div className={styles.displayHeader}>
              <ViewModeToggle isLive={liveTranscript.isEnabled} onChange={handleViewChange} />
            </div>
            <div className={styles.displayBody}>
              {liveTranscript.isEnabled ? (
                <LiveTranscriptView liveTranscript={liveTranscript} isRecording={isRecording} />
              ) : (
                <LevelWaveform level={level} barCount={WAVEFORM_BAR_COUNT} />
              )}
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.controlRow}>{renderControls()}</div>
            {/* 오류는 안내 두 줄 자리에 대신 쓴다. 높이가 같아 나타나거나 사라져도 아래가 밀리지 않는다 */}
            {message ? (
              <p className={styles.error} role="alert">
                {message}
              </p>
            ) : (
              <p className={styles.hint}>
                {t.recorder.keepsRunning}
                <br />
                {settings ? (
                  <>
                    {t.recorder.shortcutHintPrefix}
                    <kbd className={styles.key}>
                      {formatAccelerator(settings.recordingShortcut)}
                    </kbd>
                    {t.recorder.shortcutHintSuffix}
                  </>
                ) : (
                  t.recorder.shortcutHintPlain
                )}
              </p>
            )}
          </div>
        </div>

        <RecordingOptionsPanel
          isRecording={isRecording}
          speakerCount={{ text, isValid, onChange: changeText }}
          systemAudio={{
            isEnabled: systemAudio.isEnabled,
            errorMessage: systemAudio.errorMessage,
            isBusy: isSystemAudioBusy,
            onChange: handleSystemAudioChange
          }}
        />
      </div>
    </section>
  )
}
