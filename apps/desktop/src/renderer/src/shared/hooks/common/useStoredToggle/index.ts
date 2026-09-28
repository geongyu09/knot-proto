import { useState } from 'react'

interface UseStoredToggleParams {
  storageKey: string
  initialValue: boolean
}

// 화면 선호일 뿐이라 저장소를 못 쓰면 초기값으로 계속 동작한다
const readStored = ({ storageKey, initialValue }: UseStoredToggleParams) => {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved === null ? initialValue : saved === 'true'
  } catch (error) {
    console.warn('화면 설정을 불러오지 못했습니다', error)
    return initialValue
  }
}

/** 창 단위 켜기/끄기 선호를 localStorage에 둔다 (SQLite 설정에 넣을 값이 아니다) */
const useStoredToggle = ({ storageKey, initialValue }: UseStoredToggleParams) => {
  const [isOn, setIsOn] = useState(() => readStored({ storageKey, initialValue }))

  const set = (next: boolean) => {
    setIsOn(next)
    try {
      localStorage.setItem(storageKey, String(next))
    } catch (error) {
      console.warn('화면 설정을 저장하지 못했습니다', error)
    }
  }

  return { isOn, set, toggle: () => set(!isOn) }
}

export default useStoredToggle
