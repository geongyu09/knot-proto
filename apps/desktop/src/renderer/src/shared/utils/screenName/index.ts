import { matchPath } from 'react-router'
import { PATHS } from '@renderer/shared/routes/paths'

type ScreenName = keyof typeof PATHS

/**
 * 해시 경로를 화면 이름(`PATHS`의 키)으로 바꾼다. 경로의 회의 id 대신 화면 종류만 사용 정보에 싣는다.
 * 모르는 경로는 'unknown'.
 */
export const screenNameOf = (pathname: string) => {
  const names = Object.keys(PATHS) as ScreenName[]

  return names.find((name) => matchPath(PATHS[name], pathname)) ?? 'unknown'
}
