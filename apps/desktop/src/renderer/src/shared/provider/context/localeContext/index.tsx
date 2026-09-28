import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, getMessages, type Locale } from '@shared/i18n'
import { onSettingsChanged } from '@renderer/shared/api/events'
import { getSettingsApi } from '@renderer/shared/api/settings'

/** 기본값이 한국어라 Provider 없이 렌더하는 통합 테스트는 한국어 문구를 그대로 검증한다 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

interface LocaleProviderProps {
  children: ReactNode
}

/**
 * UI 언어의 단일 출처 (references/architecture.md "UI 언어"). 마운트 시 설정을 한 번 읽고,
 * 이후에는 `settings:changed` push로 따라간다 — 녹음 호스트 창은 설정 화면과 다른 창이라 push로만 알 수 있다.
 */
export function LocaleProvider({ children }: LocaleProviderProps) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)

  useEffect(() => {
    let isActive = true

    getSettingsApi()
      .then((settings) => {
        if (isActive) setLocale(settings.locale)
      })
      .catch((caught: unknown) => {
        // 설정을 못 읽어도 기본 언어로 뜬다. 오류 자체는 설정 화면이 사용자에게 보여 준다
        console.warn('locale: settings unavailable, using default', caught)
      })
    const unsubscribe = onSettingsChanged(({ locale: next }) => setLocale(next))

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  // 글꼴 폴백·맞춤법 검사 같은 브라우저 동작이 lang을 본다
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** 컴포넌트는 `t.settings.title`처럼 읽는다. 값이 들어가는 문구는 사전의 함수를 부른다 */
export const useLocale = () => {
  const locale = useContext(LocaleContext)

  return { locale, t: getMessages(locale) }
}
