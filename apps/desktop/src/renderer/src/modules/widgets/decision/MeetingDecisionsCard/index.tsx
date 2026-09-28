import { useState } from 'react'
import { Link } from 'react-router'
import DecisionProgress from '@renderer/modules/features/decision/DecisionProgress'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useDecisionProgress from '@renderer/shared/hooks/domain/decision/useDecisionProgress'
import useExtractDecisions from '@renderer/shared/hooks/domain/decision/useExtractDecisions'
import useMeetingDecisions from '@renderer/shared/hooks/domain/decision/useMeetingDecisions'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { decisionDetailPath } from '@renderer/shared/routes/paths'

import { extractionStateOf } from './utils/extractionStateOf'
import styles from './index.module.css'

interface MeetingDecisionsCardProps {
  meetingId: string
}

/**
 * 회의 상세 오른쪽 레일 맨 위의 "결정 문서" 카드 — 이 회의의 문서 목록·추출 상태·추출 버튼.
 * 기존 회의는 자동으로 추출하지 않으므로 여기서만 추출한다 (references/decisions.md "회의 상세").
 */
export default function MeetingDecisionsCard({ meetingId }: MeetingDecisionsCardProps) {
  const { t } = useLocale()
  const labels = t.decisions.meetingCard
  const { meeting } = useMeeting({ meetingId })
  const { decisions, error: loadError } = useMeetingDecisions({ meetingId })
  const progress = useDecisionProgress({ meetingId })
  const { extract, isRequesting, error: requestError } = useExtractDecisions({ meetingId })
  const [isRequested, setIsRequested] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  // 회의록이 아직 없으면 추출할 것도 없다
  if (meeting?.status !== 'done') return null

  const state = extractionStateOf({
    decisionState: meeting.decisionState,
    stage: progress.stage,
    isRequested: isRequested && progress.stage === null
  })
  const isRunning = state === 'running' || isRequesting
  const errorMessage =
    state === 'error'
      ? (progress.errorMessage ?? meeting.decisionError ?? labels.requestError)
      : null

  const handleExtract = async () => {
    setIsConfirming(false)
    if (await extract()) setIsRequested(true)
  }

  const renderList = () => {
    if (state === 'none') return <p className={styles.message}>{labels.never}</p>
    if (!decisions.length) {
      return state === 'done' ? <p className={styles.message}>{labels.empty}</p> : null
    }

    return (
      <ul className={styles.list} aria-label={labels.listLabel}>
        {decisions.map((decision) => (
          <li key={decision.id}>
            <Link className={styles.link} to={decisionDetailPath({ decisionId: decision.id })}>
              {decision.title}
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  const renderAction = () => {
    if (state === 'none') {
      return (
        <Button size="sm" className={styles.action} disabled={isRunning} onClick={handleExtract}>
          {labels.extract}
        </Button>
      )
    }
    if (isConfirming) {
      return (
        <div className={styles.confirm} role="alert">
          <span>{labels.reextractConfirm({ count: decisions.length })}</span>
          <span className={styles.confirmActions}>
            <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)}>
              {labels.cancel}
            </Button>
            <Button size="sm" disabled={isRunning} onClick={handleExtract}>
              {labels.confirmReextract}
            </Button>
          </span>
        </div>
      )
    }

    return (
      <Button
        variant="secondary"
        size="sm"
        className={styles.action}
        disabled={isRunning}
        onClick={() => setIsConfirming(true)}
      >
        {labels.reextract}
      </Button>
    )
  }

  return (
    <section className={styles.card} aria-label={labels.title}>
      <h2 className={styles.title}>
        {labels.title}
        {decisions.length ? <span className={styles.count}>{decisions.length}</span> : null}
      </h2>
      {state === 'running' ? <DecisionProgress meetingId={meetingId} /> : renderList()}
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      {requestError || loadError ? (
        <p className={styles.error} role="alert">
          {requestError ?? loadError?.message}
        </p>
      ) : null}
      {renderAction()}
    </section>
  )
}
