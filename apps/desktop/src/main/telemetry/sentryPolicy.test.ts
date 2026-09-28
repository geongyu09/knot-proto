import { describe, expect, it } from 'vitest'
import { shouldKeepBreadcrumb } from './sentryPolicy'

describe('shouldKeepBreadcrumb', () => {
  it('콘솔·UI·네트워크 브레드크럼은 버린다', () => {
    expect(shouldKeepBreadcrumb('console')).toBe(false)
    expect(shouldKeepBreadcrumb('ui.click')).toBe(false)
    expect(shouldKeepBreadcrumb('http')).toBe(false)
    expect(shouldKeepBreadcrumb('electron.net')).toBe(false)
  })

  it('앱 수명 주기 브레드크럼은 남긴다', () => {
    expect(shouldKeepBreadcrumb('electron')).toBe(true)
    expect(shouldKeepBreadcrumb(undefined)).toBe(true)
  })
})
