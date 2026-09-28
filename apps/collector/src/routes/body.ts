import type { Context } from 'hono'

import * as log from '../log'

/** 본문이 JSON이 아니면 undefined. 검증 함수가 "객체가 아닙니다"로 400을 만든다 */
export const readJson = async (c: Context) => {
  try {
    const body: unknown = await c.req.json()
    return body
  } catch (caught) {
    log.warn(`JSON 본문 파싱 실패: ${log.messageOf(caught)}`)
    return undefined
  }
}

export const tooLarge = (c: Context) => c.json({ error: '본문이 너무 큽니다' }, 413)
