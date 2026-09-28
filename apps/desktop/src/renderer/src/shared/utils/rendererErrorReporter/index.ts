import { trackApi } from '@renderer/shared/api/telemetry'

const messageOf = (value: unknown) => (value instanceof Error ? value.message : String(value))

/**
 * renderer의 처리되지 않은 오류를 main에 넘긴다. main이 자체 서버와 Sentry로 보낸다 —
 * renderer에는 Sentry SDK를 두지 않는다 (references/telemetry.md "싱크별 규칙").
 * 해제 함수를 돌려준다.
 */
export const reportRendererErrors = () => {
  const handleError = (event: ErrorEvent) =>
    trackApi({
      name: 'renderer_error',
      props: { message: event.message || messageOf(event.error), source: 'error' }
    })
  const handleRejection = (event: PromiseRejectionEvent) =>
    trackApi({
      name: 'renderer_error',
      props: { message: messageOf(event.reason), source: 'unhandledrejection' }
    })

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleRejection)

  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleRejection)
  }
}
