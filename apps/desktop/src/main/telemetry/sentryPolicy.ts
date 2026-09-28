/**
 * Sentry로 회의 내용이 새지 않게 하는 규칙 (references/telemetry.md "싱크별 규칙").
 * SDK를 import하지 않는 순수 모듈이라 단위 테스트할 수 있다.
 */

/**
 * 기본 통합 중 뺄 것.
 * - LocalVariables: 스택 프레임의 지역 변수(발화 텍스트가 들어 있을 수 있음)를 싣는다
 * - Screenshots: 창 화면(회의록)을 찍는다
 * - Console: 콘솔 출력이 브레드크럼이 된다
 * - PreloadInjection: renderer SDK를 쓰지 않으므로 preload를 끼워 넣지 않는다
 */
export const DROPPED_SENTRY_INTEGRATIONS = [
  'LocalVariables',
  'Screenshots',
  'Console',
  'PreloadInjection'
]

const DROPPED_BREADCRUMB_PREFIXES = ['console', 'ui.', 'http', 'fetch', 'electron.net']

export const shouldKeepBreadcrumb = (category: string | undefined) =>
  !category || !DROPPED_BREADCRUMB_PREFIXES.some((prefix) => category.startsWith(prefix))
