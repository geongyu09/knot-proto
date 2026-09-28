import { Hono } from 'hono'

import { teamAuth } from './auth'
import * as log from './log'
import { createEventsRoute } from './routes/events'
import { createMeetingsRoute } from './routes/meetings'
import { createRecordingsRoute } from './routes/recordings'
import type { CollectorDeps, CollectorEnv } from './types/collector'

/** 수집 서버 라우트 전체. 서버를 띄우지 않고 app.request()로 테스트할 수 있게 자원을 주입받는다 */
export const createApp = (deps: CollectorDeps) => {
  const app = new Hono<CollectorEnv>()

  app.get('/health', (c) => c.json({ ok: true }))

  app.use('/v1/*', teamAuth(deps.teamTokens))
  app.route('/v1/events', createEventsRoute(deps))
  app.route('/v1/meetings', createMeetingsRoute(deps))
  app.route('/v1/recordings', createRecordingsRoute(deps))

  app.notFound((c) => c.json({ error: '없는 경로입니다' }, 404))
  app.onError((caught, c) => {
    log.error(`${c.req.method} ${c.req.path} 처리 실패: ${log.messageOf(caught)}`)
    return c.json({ error: '서버 내부 오류' }, 500)
  })

  return app
}
