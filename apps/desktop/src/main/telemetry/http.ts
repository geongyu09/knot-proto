import { messageOf, warn } from '../log'
import { outcomeOfStatus } from './outcome'

/** 요청 하나의 시간 상한. 녹음 조각(8MB)도 이 안에 올라가야 한다 */
const REQUEST_TIMEOUT_MS = 60_000

interface SendHttpParams {
  url: string
  method: 'POST' | 'PUT' | 'DELETE'
  headers: Record<string, string>
  body?: string | Uint8Array<ArrayBuffer>
}

/**
 * 수집 요청 하나를 보낸다. 실패를 throw하지 않고 결과로 돌려준다 —
 * 전송 실패가 사용자 작업을 실패시키지 않게 하기 위해서다 (references/telemetry.md "흐름").
 */
export const sendHttp = async ({ url, method, headers, body }: SendHttpParams) => {
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const json: unknown = await response.json().catch(() => null)

    return { outcome: outcomeOfStatus(response.status), status: response.status, json }
  } catch (caught) {
    warn(`사용 정보 전송 실패 (${method} ${new URL(url).pathname}): ${messageOf(caught)}`)

    return { outcome: outcomeOfStatus(null), status: null, json: null }
  }
}
