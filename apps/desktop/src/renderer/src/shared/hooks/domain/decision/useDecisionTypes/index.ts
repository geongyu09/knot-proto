import { useCallback, useEffect, useState } from 'react'
import type { DecisionType } from '@shared/types'
import { getDecisionTypesApi } from '@renderer/shared/api/decisionTypes'
import { onMeetingsChanged } from '@renderer/shared/api/events'

/**
 * 결정 타입 목록 (읽기 전용). 묶음 이름·순서와 문서의 타입 칩에 쓴다.
 * 설정에서 타입을 저장하면 main이 `meetings:changed`를 보내므로 그때 다시 읽는다.
 * 읽기에 실패하면 빈 목록으로 두고 문서는 미분류로 보인다 — 목록 자체를 막을 만한 실패가 아니다.
 */
const useDecisionTypes = () => {
  const [types, setTypes] = useState<DecisionType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchTypes = useCallback(
    () =>
      getDecisionTypesApi()
        .then(setTypes)
        .catch((caught: unknown) => console.warn('결정 타입을 불러오지 못했습니다', caught))
        .finally(() => setIsLoading(false)),
    []
  )

  useEffect(() => {
    fetchTypes()
  }, [fetchTypes])

  useEffect(() => onMeetingsChanged(() => void fetchTypes()), [fetchTypes])

  return { types, isLoading }
}

export default useDecisionTypes
