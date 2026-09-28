import ProgressBar from '@renderer/shared/components/primitives/ui/ProgressBar'
import useDecisionProgress from '@renderer/shared/hooks/domain/decision/useDecisionProgress'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './index.module.css'

interface DecisionProgressProps {
  meetingId: string
}

/**
 * 결정 추출 진행률. 파이프라인 진행률(`PipelineProgress`) 다음 단계라 같은 모양으로 그린다.
 * 첫 이벤트가 오기 전(큐에서 교정을 기다리는 중)에는 대기 문구를 보여 준다.
 */
export default function DecisionProgress({ meetingId }: DecisionProgressProps) {
  const { t } = useLocale()
  const { stage, percent } = useDecisionProgress({ meetingId })
  const label = t.decisions.stages[stage ?? 'queued']

  return (
    <div className={styles.container}>
      <span className={styles.status}>
        <span className={styles.label}>{label}</span>
        <span className={styles.percent}>{percent}%</span>
      </span>
      <ProgressBar percent={percent} label={t.decisions.progressLabel} />
    </div>
  )
}
