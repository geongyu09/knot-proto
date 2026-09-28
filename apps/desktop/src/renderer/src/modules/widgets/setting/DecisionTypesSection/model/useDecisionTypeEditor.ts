import { useEffect, useRef, useState, type RefObject } from 'react'
import type { DecisionType } from '@shared/types'
import { getDecisionTypesApi, updateDecisionTypesApi } from '@renderer/shared/api/decisionTypes'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { TypeRow } from '../types/typeRow'
import { isSameTypes, moveRow as moveRowOf, toSavedTypes } from '../utils/typeRows'

const messageOf = ({ caught, fallback }: { caught: unknown; fallback: string }) =>
  caught instanceof Error && caught.message ? caught.message : fallback

interface WithKeysParams {
  types: DecisionType[]
  nextKeyRef: RefObject<number>
}

const withKeys = ({ types, nextKeyRef }: WithKeysParams) =>
  types.map<TypeRow>((type) => ({ ...type, key: nextKeyRef.current++ }))

/**
 * 설정의 결정 타입 편집 상태. 용어 사전처럼 명시적으로 저장하고, 검증(이름 중복·길이·개수)은 main이 한다
 * (references/decisions.md "결정 타입").
 */
const useDecisionTypeEditor = () => {
  const { t } = useLocale()
  const labels = t.decisions.settings
  const nextKeyRef = useRef(0)
  const [saved, setSaved] = useState<DecisionType[]>([])
  const [rows, setRows] = useState<TypeRow[]>([])
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    getDecisionTypesApi()
      .then((types) => {
        setSaved(types)
        setRows(withKeys({ types, nextKeyRef }))
      })
      .catch((caught: unknown) => setLoadError(messageOf({ caught, fallback: labels.loadError })))
      .finally(() => setIsLoading(false))
  }, [labels.loadError])

  const addRow = () => {
    const key = nextKeyRef.current++
    setFocusKey(key)
    setRows([...rows, { key, id: '', name: '', description: '' }])
  }

  const updateRow = ({ key, patch }: { key: number; patch: Partial<DecisionType> }) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const moveRow = ({ key, offset }: { key: number; offset: number }) =>
    setRows(moveRowOf({ rows, key, offset }))

  const removeRow = (key: number) => setRows(rows.filter((row) => row.key !== key))

  const saveTypes = async () => {
    setIsSaving(true)
    setActionError(null)
    setNotice(null)

    try {
      const next = await updateDecisionTypesApi({ types: toSavedTypes(rows) })
      setSaved(next)
      setFocusKey(null)
      setRows(withKeys({ types: next, nextKeyRef }))
      setNotice(labels.saved({ count: next.length }))
    } catch (caught) {
      setActionError(messageOf({ caught, fallback: labels.saveError }))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    rows,
    focusKey,
    isLoading,
    loadError,
    isDirty: !isSameTypes({ rows, saved }),
    isSaving,
    actionError,
    notice,
    addRow,
    updateRow,
    moveRow,
    removeRow,
    saveTypes
  }
}

export default useDecisionTypeEditor
