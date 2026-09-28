import { Link } from 'react-router'
import Card from '@renderer/shared/components/primitives/layout/Card'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useRecordingState from '@renderer/shared/hooks/domain/recording/useRecordingState'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { PATHS } from '@renderer/shared/routes/paths'
import { formatClock } from '@renderer/shared/utils/formatClock'

import styles from './index.module.css'

/**
 * 홈 왼쪽 아래 "진행 중인 녹음" (knot Card/RecordingList). 처리 중·실패 회의는 "최근 회의"가 보여 준다 —
 * 큐에서 여러 회의가 함께 기다릴 수 있어서다 (references/architecture.md "화면별 구성" > 홈)
 */
export default function CurrentRecordingCard() {
  const { t } = useLocale()
  const { isRecording, isPaused, elapsedSec } = useRecordingState()
  const text = t.sidebar.home.current

  return (
    <Card className={styles.card} title={text.title}>
      {isRecording ? (
        <div className={styles.current}>
          <span className={styles.micTile} aria-hidden="true">
            <Icon name="mic" size={20} />
          </span>
          <div className={styles.text}>
            <span className={isPaused ? styles.pausedStatus : styles.status}>
              <span className={styles.dot} aria-hidden="true" />
              {isPaused ? text.paused : text.recording} · {formatClock({ sec: elapsedSec })}
            </span>
            <span className={styles.name}>{text.name}</span>
            <span className={styles.hint}>{text.hint}</span>
          </div>
          <Link to={PATHS.record} className={styles.open}>
            {text.open}
          </Link>
        </div>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{text.empty}</p>
          <p className={styles.hint}>{text.emptyHint}</p>
        </div>
      )}
    </Card>
  )
}
