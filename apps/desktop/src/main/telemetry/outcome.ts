/**
 * 전송 결과를 outbox 처리로 옮긴다 (references/telemetry.md "전송 계약").
 * - sent: 행 삭제
 * - retry: 지수 백오프로 재시도
 * - auth: 토큰 폐기. 최대 간격으로 미룬다
 * - drop: 다시 보내도 결과가 같은 요청. 행을 버린다
 */
export type SendOutcome = 'sent' | 'retry' | 'auth' | 'drop'

const RETRYABLE_CLIENT_STATUSES = [408, 409, 429]
const AUTH_STATUSES = [401, 403]

const HTTP_OK_MIN = 200
const HTTP_OK_MAX = 299
const HTTP_CLIENT_ERROR_MIN = 400
const HTTP_CLIENT_ERROR_MAX = 499

/** HTTP 상태 코드가 없으면(네트워크 오류·시간 초과) null을 넘긴다 */
export const outcomeOfStatus = (status: number | null): SendOutcome => {
  if (status === null) return 'retry'
  if (status >= HTTP_OK_MIN && status <= HTTP_OK_MAX) return 'sent'
  if (AUTH_STATUSES.includes(status)) return 'auth'
  if (RETRYABLE_CLIENT_STATUSES.includes(status)) return 'retry'
  if (status >= HTTP_CLIENT_ERROR_MIN && status <= HTTP_CLIENT_ERROR_MAX) return 'drop'

  return 'retry'
}
