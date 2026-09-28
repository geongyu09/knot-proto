/** 첫 재시도 간격. 시도할 때마다 두 배로 늘린다 */
const BASE_RETRY_MS = 30_000
/** 재시도 간격 상한. 오프라인이 길어도 한 시간에 한 번은 다시 본다 */
const MAX_RETRY_MS = 60 * 60 * 1000

interface RetryDelayParams {
  /** 방금 실패한 것을 포함한 누적 시도 횟수 (1부터) */
  attempts: number
  /** 401·403. 토큰이 폐기된 것이라 곧바로 다시 보내도 소용없다 */
  isAuthFailure?: boolean
}

/** 실패한 전송을 언제 다시 시도할지 (지수 백오프, references/telemetry.md "흐름") */
export const retryDelayMs = ({ attempts, isAuthFailure = false }: RetryDelayParams) => {
  if (isAuthFailure) return MAX_RETRY_MS

  const exponent = Math.max(0, attempts - 1)

  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** exponent)
}
