import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import * as log from '../log'
import { markMeetingDeleted, upsertSnapshot } from '../meetingStore'
import type { CollectorDeps, CollectorEnv } from '../types/collector'
import { isPathSegment, parseMeetingSnapshot } from '../validate'
import { readJson, tooLarge } from './body'

const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024

/** `PUT`·`DELETE /v1/meetings/{installId}/{meetingId}` — 회의 스냅샷 최신본 저장·삭제 표시 */
export const createMeetingsRoute = ({ db, now = Date.now }: CollectorDeps) =>
  new Hono<CollectorEnv>()
    .put(
      '/:installId/:meetingId',
      bodyLimit({ maxSize: MAX_SNAPSHOT_BYTES, onError: tooLarge }),
      async (c) => {
        const { installId, meetingId } = c.req.param()
        const snapshot = parseMeetingSnapshot(await readJson(c))
        if (!snapshot.ok) {
          log.warn(`[${c.get('teamId')}] 회의 스냅샷 거절 ${meetingId}: ${snapshot.error}`)
          return c.json({ error: snapshot.error }, 400)
        }
        if (snapshot.value.installId !== installId || snapshot.value.meetingId !== meetingId) {
          return c.json({ error: '경로와 본문의 installId·meetingId가 다릅니다' }, 400)
        }
        const result = upsertSnapshot({
          db,
          teamId: c.get('teamId'),
          snapshot: snapshot.value,
          receivedAt: now()
        })
        log.info(
          `[${c.get('teamId')}] 회의 스냅샷 ${meetingId} ${result.isApplied ? `저장 (revision ${result.revision})` : '무시 (더 새 스냅샷이 있음)'}, 발화 ${snapshot.value.utterances.length}개`
        )
        return c.json({ meetingId, ...result })
      }
    )
    .delete('/:installId/:meetingId', (c) => {
      const { installId, meetingId } = c.req.param()
      if (!isPathSegment(installId) || !isPathSegment(meetingId)) {
        return c.json({ error: 'installId·meetingId 형식이 틀렸습니다' }, 400)
      }
      const result = markMeetingDeleted({
        db,
        teamId: c.get('teamId'),
        installId,
        meetingId,
        deletedAt: now()
      })
      log.info(`[${c.get('teamId')}] 회의 ${meetingId} 삭제 표시 ${result.isMarked ? '' : '(이미 없거나 표시됨)'}`)
      return c.json({ meetingId, ...result })
    })
