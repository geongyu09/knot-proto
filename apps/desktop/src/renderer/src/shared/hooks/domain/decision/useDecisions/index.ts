import { useCallback, useEffect, useState } from 'react'
import type { DecisionListItem } from '@shared/types'
import { getDecisionsApi } from '@renderer/shared/api/decisions'
import { onMeetingsChanged } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/** 사이드 패널 결정 탭의 문서 목록. 추출 완료·타입 변경·회의 삭제 뒤 main이 `meetings:changed`를 보낸다 */
const useDecisions = () => {
  const { t } = useLocale()
  const [decisions, setDecisions] = useState<DecisionListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (hook-guide "데이터 요청 훅")
  const fetchDecisions = useCallback(
    () =>
      getDecisionsApi()
        .then((next) => {
          setDecisions(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.decisions.sidebar.loadError))
        )
        .finally(() => setIsLoading(false)),
    [t]
  )

  const refetch = useCallback(() => {
    setIsLoading(true)

    return fetchDecisions()
  }, [fetchDecisions])

  useEffect(() => {
    fetchDecisions()
  }, [fetchDecisions])

  useEffect(() => onMeetingsChanged(() => void fetchDecisions()), [fetchDecisions])

  return { decisions, isLoading, error, refetch }
}

export default useDecisions
