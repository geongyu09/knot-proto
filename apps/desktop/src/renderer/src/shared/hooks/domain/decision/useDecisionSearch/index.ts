import { useCallback, useEffect, useState } from 'react'
import type { DecisionListItem } from '@shared/types'
import { searchDecisionsApi } from '@renderer/shared/api/decisions'
import { onMeetingsChanged } from '@renderer/shared/api/events'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

/** 회의록 검색과 같은 이유로 입력이 멈춘 뒤에 찾는다 (useMeetingSearch) */
const SEARCH_DEBOUNCE_MS = 200

interface UseDecisionSearchParams {
  query: string
}

/**
 * 결정 문서 제목·결정 내용·배경 검색 (references/decisions.md "사이드 패널"). 질의가 공백뿐이면 검색하지 않는다.
 * 검색 중에도 목록이 바뀌면(추출 완료·회의 삭제) 같은 질의로 다시 찾는다.
 */
const useDecisionSearch = ({ query }: UseDecisionSearchParams) => {
  const { t } = useLocale()
  const trimmed = query.trim()
  const [results, setResults] = useState<DecisionListItem[]>([])
  const [searchedQuery, setSearchedQuery] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const search = useCallback(
    (target: string) =>
      searchDecisionsApi({ query: target })
        .then((next) => {
          setResults(next)
          setSearchedQuery(target)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.decisions.sidebar.searchError))
        ),
    [t]
  )

  useEffect(() => {
    if (!trimmed) return

    const timer = setTimeout(() => void search(trimmed), SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [trimmed, search])

  useEffect(() => {
    if (!trimmed) return

    return onMeetingsChanged(() => void search(trimmed))
  }, [trimmed, search])

  const isActive = trimmed !== ''

  return {
    isActive,
    isSearching: isActive && searchedQuery !== trimmed && !error,
    results: isActive && searchedQuery === trimmed ? results : [],
    error: isActive ? error : null
  }
}

export default useDecisionSearch
