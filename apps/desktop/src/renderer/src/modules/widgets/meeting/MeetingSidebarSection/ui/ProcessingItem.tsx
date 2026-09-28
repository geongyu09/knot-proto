import { useState } from 'react'
import { NavLink } from 'react-router'
import type { Meeting } from '@shared/types'
import DecisionProgress from '@renderer/modules/features/decision/DecisionProgress'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import { reprocessMeetingApi } from '@renderer/shared/api/meetings'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useExtractDecisions from '@renderer/shared/hooks/domain/decision/useExtractDecisions'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'

import type { ProcessingKind } from '../types/sidebar'
import styles from './ProcessingItem.module.css'

interface ProcessingItemProps {
  meeting: Meeting
  kind: ProcessingKind
}

/**
 * "처리 중" 묶음의 회의 하나. 제목은 회의 상세로 가는 링크이고, 실패면 빨간 한 줄 + 다시 시도.
 * 파이프라인 실패는 회의 상세의 다시 시도와 같이 저장된 참석자 수로 다시 인식하고, 추출 실패는 추출만 다시 넣는다.
 */
export default function ProcessingItem({ meeting, kind }: ProcessingItemProps) {
  const { t } = useLocale()
  const labels = t.decisions.sidebar
  const {
    extract,
    isRequesting,
    error: extractError
  } = useExtractDecisions({
    meetingId: meeting.id
  })
  const [isReprocessing, setIsReprocessing] = useState(false)
  const [reprocessError, setReprocessError] = useState<string | null>(null)

  const handleReprocess = async () => {
    setIsReprocessing(true)
    setReprocessError(null)

    try {
      await reprocessMeetingApi({
        meetingId: meeting.id,
        speakerCount: meeting.speakerCount ?? null
      })
    } catch (caught) {
      setReprocessError(caught instanceof Error ? caught.message : labels.retryError)
    } finally {
      setIsReprocessing(false)
    }
  }

  const isPipelineFailure = kind === 'pipelineFailed'
  // 원본 녹음이 없으면 다시 인식할 재료가 없다
  const canRetry = isPipelineFailure ? meeting.hasAudio : kind === 'extractFailed'
  const isBusy = isRequesting || isReprocessing
  const actionError = reprocessError ?? extractError

  const renderStatus = () => {
    if (kind === 'pipelineRunning') return <PipelineProgress meetingId={meeting.id} />
    if (kind === 'extracting') return <DecisionProgress meetingId={meeting.id} />

    const message = isPipelineFailure
      ? (meeting.errorMessage ?? labels.pipelineError)
      : (meeting.decisionError ?? labels.extractError)

    return (
      <span className={styles.failure}>
        <span className={styles.error} title={message}>
          {message}
        </span>
        {canRetry ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isBusy}
            onClick={isPipelineFailure ? handleReprocess : () => void extract()}
          >
            {isBusy ? labels.retrying : labels.retry}
          </Button>
        ) : null}
      </span>
    )
  }

  return (
    <div className={styles.item}>
      <NavLink to={meetingDetailPath({ meetingId: meeting.id })} className={styles.title}>
        {meeting.title}
      </NavLink>
      {renderStatus()}
      {actionError ? (
        <span className={styles.error} role="alert">
          {actionError}
        </span>
      ) : null}
    </div>
  )
}
