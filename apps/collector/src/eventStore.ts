import type { DatabaseSync } from 'node:sqlite'
import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'

import { runInTransaction } from './db'

interface InsertEventsParams {
  db: DatabaseSync
  teamId: string
  events: TelemetryEnvelope[]
  receivedAt: number
}

/** 이벤트 id가 이미 있으면 건너뛴다 — outbox 재시도로 같은 묶음이 다시 와도 한 번만 저장한다 */
export const insertEvents = ({ db, teamId, events, receivedAt }: InsertEventsParams) => {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, team_id, install_id, session_id, name, category, props, app_version, occurred_at, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const accepted = runInTransaction({
    db,
    work: () =>
      events.reduce((count, event) => {
        const result = statement.run(
          event.id,
          teamId,
          event.installId,
          event.sessionId,
          event.name,
          event.category,
          JSON.stringify(event.props),
          event.appVersion,
          event.occurredAt,
          receivedAt
        )
        return count + Number(result.changes)
      }, 0)
  })
  return { accepted, duplicated: events.length - accepted }
}
