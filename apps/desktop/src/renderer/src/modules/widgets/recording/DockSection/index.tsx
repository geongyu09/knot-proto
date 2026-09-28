import { Link, useNavigate } from 'react-router'
import { controlRecordingApi } from '@renderer/shared/api/recording'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './index.module.css'

/**
 * 하단 녹음 독 (knot Dock/Bar). 대기 중이면 마이크로 녹음 화면에 가고, 녹음 중이면 시간 칩과 정지 버튼을 보인다.
 * 바로 녹음을 시작하지 않는 이유: 참석자 수·상대방 소리를 녹음 화면에서 먼저 고른다 (references/architecture.md "메인 창 레이아웃")
 */
export default function DockSection() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { isRecording, isPaused, elapsedSec } = useRecordingState()

  const handleStop = () => {
    // 실패하면 녹음은 계속되고 시간 칩이 남아 있다. 녹음 화면이 오류를 보여 준다
    controlRecordingApi({ kind: 'stop' }).catch((error: unknown) => {
      console.error('독에서 녹음을 끝내지 못했습니다', error)
      navigate(PATHS.record)
    })
  }

  if (!isRecording) {
    return (
      <div className={styles.dock} role="group" aria-label={t.sidebar.dock.label}>
        <Link
          to={PATHS.record}
          className={styles.iconButton}
          aria-label={t.sidebar.dock.newRecording}
        >
          <Icon name="mic" size={24} />
        </Link>
      </div>
    )
  }

  const elapsed = formatClock({ sec: elapsedSec })

  return (
    <div className={styles.dock} role="group" aria-label={t.sidebar.dock.label}>
      <div className={styles.chip}>
        <Link
          to={PATHS.record}
          className={styles.time}
          aria-label={t.sidebar.dock.openRecording({ elapsed })}
        >
          <span className={isPaused ? styles.pausedDot : styles.dot} aria-hidden="true" />
          <span className={styles.clock}>{elapsed}</span>
          <Icon name="chevronRight" size={12} />
        </Link>
        <button
          type="button"
          className={styles.stop}
          aria-label={t.sidebar.dock.stop}
          onClick={handleStop}
        >
          <Icon name="stop" size={16} />
        </button>
      </div>
    </div>
  )
}
