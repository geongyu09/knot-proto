import { nativeTheme } from 'electron'

/**
 * 앱은 라이트만 그린다 (knot 리디자인, 2026-09-28). macOS가 다크여도 스크롤바·폼 컨트롤이
 * 라이트로 그려지도록 고정한다 (references/architecture.md "다크 모드 없음")
 */
export const applyLightTheme = () => {
  nativeTheme.themeSource = 'light'
}
