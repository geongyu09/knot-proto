import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { insertEvents } from '../eventStore'
import * as log from '../log'
import type { CollectorDeps, CollectorEnv } from '../types/collector'
import { parseEventBatch } from '../validate'
import { readJson, tooLarge } from './body'

const MAX_EVENT_BATCH_BYTES = 2 * 1024 * 1024

/** `POST /v1/events` — 이벤트 묶음 저장. 2xx면 데스크탑이 outbox 행을 지운다 */
export const createEventsRoute = ({ db, now = Date.now }: CollectorDeps) =>
  new Hono<CollectorEnv>().post(
    '/',
    bodyLimit({ maxSize: MAX_EVENT_BATCH_BYTES, onError: tooLarge }),
    async (c) => {
      const batch = parseEventBatch(await readJson(c))
      const teamId = c.get('teamId')
      if (!batch.ok) {
        log.warn(`[${teamId}] 이벤트 묶음 거절: ${batch.error}`)
        return c.json({ error: batch.error }, 400)
      }
      const result = insertEvents({
        db,
        teamId,
        events: batch.value.events,
        receivedAt: now()
      })
      const names = [...new Set(batch.value.events.map((event) => event.name))].join(', ')
      log.info(
        `[${teamId}] 이벤트 ${result.accepted}개 저장, 중복 ${result.duplicated}개 (${names})`
      )
      return c.json(result)
    }
  )
