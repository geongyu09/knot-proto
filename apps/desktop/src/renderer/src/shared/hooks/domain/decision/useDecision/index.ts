import { useCallback, useEffect, useState } from 'react'
import type { GetDecisionResponse } from '@shared/ipc'
import { getDecisionApi } from '@renderer/shared/api/decisions'
import { onMeetingsChanged } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseDecisionParams {
  decisionId: string
}

/**
 * 결정 문서 하나와 출처 회의. 다시 추출·회의 삭제로 문서가 사라지면 main의 `meetings:changed` 뒤 다시 읽어
 * `result`가 null이 된다 (references/decisions.md "결정 문서 화면").
 */
const useDecision = ({ decisionId }: UseDecisionParams) => {
  const { t } = useLocale()
  const [result, setResult] = useState<GetDecisionResponse>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchDecision = useCallback(
    () =>
      getDecisionApi({ decisionId })
        .then((next) => {
          setResult(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.decisions.document.loadError))
        )
        .finally(() => setIsLoading(false)),
    [decisionId, t]
  )

  useEffect(() => {
    fetchDecision()
  }, [fetchDecision])

  useEffect(() => onMeetingsChanged(() => void fetchDecision()), [fetchDecision])

  return {
    decision: result?.decision ?? null,
    meeting: result?.meeting ?? null,
    isLoading,
    error,
    refetch: fetchDecision
  }
}

export default useDecision
