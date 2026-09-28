import { useCallback, useEffect, useState } from 'react'
import type { DecisionListItem } from '@shared/types'
import { getMeetingDecisionsApi } from '@renderer/shared/api/decisions'
import { onMeetingsChanged } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseMeetingDecisionsParams {
  meetingId: string
}

/** 한 회의에서 나온 결정 문서 목록. 추출이 끝나면 main의 `meetings:changed`로 다시 읽는다 */
const useMeetingDecisions = ({ meetingId }: UseMeetingDecisionsParams) => {
  const { t } = useLocale()
  const [decisions, setDecisions] = useState<DecisionListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchDecisions = useCallback(
    () =>
      getMeetingDecisionsApi({ meetingId })
        .then((next) => {
          setDecisions(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.decisions.meetingCard.loadError))
        )
        .finally(() => setIsLoading(false)),
    [meetingId, t]
  )

  useEffect(() => {
    fetchDecisions()
  }, [fetchDecisions])

  useEffect(() => onMeetingsChanged(() => void fetchDecisions()), [fetchDecisions])

  return { decisions, isLoading, error, refetch: fetchDecisions }
}

export default useMeetingDecisions
