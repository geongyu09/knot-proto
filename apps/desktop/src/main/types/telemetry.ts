/** outbox 행이 향하는 곳. Sentry는 SDK가 자체 대기열을 가져 outbox를 거치지 않는다 (references/telemetry.md) */
export type OutboxSink = 'collector' | 'posthog'

/** `event`는 envelope, 나머지는 `{ meetingId }`만 싣는다. 스냅샷 본문은 보낼 때 만든다 */
export type OutboxKind = 'event' | 'meeting_snapshot' | 'meeting_deleted'

export interface OutboxRow {
  id: number
  sink: OutboxSink
  kind: OutboxKind
  payload: string
  attempts: number
}

export type UploadStatus = 'pending' | 'done' | 'failed'

export interface UploadRow {
  meetingId: string
  audioPath: string
  totalBytes: number
  uploadedBytes: number
  status: UploadStatus
  attempts: number
}
