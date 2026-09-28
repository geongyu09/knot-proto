import { useState } from 'react'

import type { Recording } from '../audio/recorder'
import Button from '../components/Button'
import Icon from '../components/Icon'
import LevelWaveform from '../components/LevelWaveform'
import { formatDb, formatSeconds, rmsToDb } from '../lib/units'
import { formatTimestamp } from '@meeting-stt/core/format'
import useRecorder, { LEVEL_HISTORY_SIZE } from './useRecorder'

/** `click()` 직후에 revoke하면 다운로드가 시작되기 전에 URL이 사라지는 브라우저가 있다 */
const REVOKE_DELAY_MS = 1000

interface RecordPanelProps {
  /** 파이프라인이 도는 중에는 녹음을 시작하지 못하게 한다 */
  isDisabled: boolean
  onRecorded: (recording: Recording) => void
}

const downloadRecording = (recording: Recording) => {
  const url = URL.createObjectURL(recording.file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = recording.file.name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

export default function RecordPanel({ isDisabled, onRecorded }: RecordPanelProps) {
  const [lastRecording, setLastRecording] = useState<Recording | null>(null)
  const { isRecording, isBusy, levels, elapsedSec, errorMessage, start, stop } = useRecorder({
    onRecorded: (recording) => {
      setLastRecording(recording)
      onRecorded(recording)
    }
  })

  const levelDb = rmsToDb(levels.at(-1) ?? 0)

  return (
    <section className="panel">
      <h2>녹음</h2>

      <div className="recorder">
        <p className={isRecording ? 'elapsed recording' : 'elapsed'}>
          {formatTimestamp({ sec: elapsedSec })}
        </p>
        <div className="meterRow">
          <LevelWaveform level={levels.at(-1) ?? 0} barCount={LEVEL_HISTORY_SIZE} />
          <span className="meterValue">{isRecording ? formatDb(levelDb) : '—'}</span>
        </div>
      </div>

      <div className="actions">
        {isRecording ? (
          // 빨강은 오류 전용이라 녹음 정지에 danger를 쓰지 않는다 (architecture.md "공통 컴포넌트")
          <Button variant="primary" onClick={() => void stop()} disabled={isBusy}>
            녹음 정지
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={isBusy || isDisabled}>
            <Icon name="mic" />
            녹음 시작
          </Button>
        )}
        {lastRecording ? (
          <Button variant="secondary" onClick={() => downloadRecording(lastRecording)}>
            WAV 저장
          </Button>
        ) : null}
      </div>

      <p className="hint">
        마이크 입력을 16kHz mono로 직접 모은다. 정지하면 WAV가 만들어져 아래 오디오 칸에 그대로
        들어간다. 말할 때 −20 dBFS 근처면 적당하고, −40 dBFS 아래로 머물면 Whisper가 구간을 통째로
        놓친다.
      </p>
      {lastRecording ? (
        <p className="hint">
          마지막 녹음: {lastRecording.file.name} ({formatSeconds(lastRecording.durationSec)})
        </p>
      ) : null}
      {isRecording ? (
        <p className="hint emphasis">
          녹음 중에는 새로고침·탭 닫기를 하지 않는다. 디스크에 쓰지 않는다
        </p>
      ) : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </section>
  )
}
