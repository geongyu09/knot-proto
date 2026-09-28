import { useState } from 'react'

interface UseStoredValueParams<T> {
  storageKey: string
  initialValue: T
  /** 저장된 값이 손상됐거나 예전 형식이면 초기값으로 읽는다 */
  isValid: (value: unknown) => value is T
}

// 화면 선호일 뿐이라 저장소를 못 쓰면 초기값으로 계속 동작한다 (useStoredToggle과 같은 규칙)
const readStored = <T>({ storageKey, initialValue, isValid }: UseStoredValueParams<T>) => {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return initialValue

    const parsed: unknown = JSON.parse(saved)
    return isValid(parsed) ? parsed : initialValue
  } catch (error) {
    console.warn('화면 설정을 불러오지 못했습니다', error)
    return initialValue
  }
}

/** 창 단위 화면 선호(선택한 탭, 접은 묶음)를 JSON으로 localStorage에 둔다. SQLite 설정에 넣을 값이 아니다 */
const useStoredValue = <T>({ storageKey, initialValue, isValid }: UseStoredValueParams<T>) => {
  const [value, setValue] = useState(() => readStored({ storageKey, initialValue, isValid }))

  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch (error) {
      console.warn('화면 설정을 저장하지 못했습니다', error)
    }
  }

  return { value, set }
}

export default useStoredValue
