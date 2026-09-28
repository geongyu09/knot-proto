import { useEffect, useState } from 'react'
import type { DecisionProgressEvent } from '@shared/ipc'
import type { DecisionStage } from '@shared/types'
import { onDecisionProgress } from '@renderer/shared/api/events'

interface UseDecisionProgressParams {
  meetingId: string
}

/** 잡이 끝났거나 실패한 단계. 나머지(queued·extract·reduce)는 진행 중이다 */
const IDLE_STAGES: DecisionStage[] = ['done', 'error']

/**
 * 이 회의의 결정 추출 진행 이벤트. 아직 이벤트를 받지 못했으면 stage가 null이고,
 * 그때는 부르는 쪽이 `Meeting.decisionState`로 판단한다. 상태에 meetingId를 담아 다른 회의로 바뀌면 버린다.
 */
const useDecisionProgress = ({ meetingId }: UseDecisionProgressParams) => {
  const [progress, setProgress] = useState<DecisionProgressEvent | null>(null)

  useEffect(
    () =>
      onDecisionProgress((event) => {
        if (event.meetingId === meetingId) setProgress(event)
      }),
    [meetingId]
  )

  const current = progress?.meetingId === meetingId ? progress : null

  return {
    stage: current?.stage ?? null,
    percent: current?.percent ?? 0,
    errorMessage: current?.errorMessage ?? null,
    isRunning: current !== null && !IDLE_STAGES.includes(current.stage)
  }
}

export default useDecisionProgress
