import type { OutboxKind, OutboxRow, OutboxSink, UploadRow } from '../types/telemetry'
import { getDb } from './connection'

/** 사용 정보 outbox와 녹음 업로드 상태 (references/data-model.md "사용 정보 outbox") */

interface EnqueueOutboxParams {
  sink: OutboxSink
  kind: OutboxKind
  payload: unknown
  now: number
}

export const enqueueOutbox = ({ sink, kind, payload, now }: EnqueueOutboxParams) => {
  getDb()
    .prepare(
      `INSERT INTO telemetry_outbox (sink, kind, payload, created_at, next_attempt_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(sink, kind, JSON.stringify(payload), now, now)
}

interface MeetingRowParams {
  sink: OutboxSink
  kind: OutboxKind
  meetingId: string
}

/** 회의 단위 행(스냅샷·삭제)이 이미 줄 서 있는지. 스냅샷은 보낼 때 최신본을 만들므로 회의당 하나면 된다 */
export const hasPendingMeetingRow = ({ sink, kind, meetingId }: MeetingRowParams) =>
  getDb()
    .prepare(
      `SELECT 1 FROM telemetry_outbox
       WHERE sink = ? AND kind = ? AND json_extract(payload, '$.meetingId') = ? LIMIT 1`
    )
    .get(sink, kind, meetingId) !== undefined

export const deletePendingMeetingRows = ({ sink, kind, meetingId }: MeetingRowParams) => {
  getDb()
    .prepare(
      `DELETE FROM telemetry_outbox
       WHERE sink = ? AND kind = ? AND json_extract(payload, '$.meetingId') = ?`
    )
    .run(sink, kind, meetingId)
}

interface ListDueOutboxParams {
  sink: OutboxSink
  now: number
  limit: number
}

export const listDueOutbox = ({ sink, now, limit }: ListDueOutboxParams) =>
  getDb()
    .prepare(
      `SELECT id, sink, kind, payload, attempts FROM telemetry_outbox
       WHERE sink = ? AND next_attempt_at <= ? ORDER BY id LIMIT ?`
    )
    .all(sink, now, limit) as OutboxRow[]

export const deleteOutboxRows = ({ ids }: { ids: number[] }) => {
  const remove = getDb().prepare('DELETE FROM telemetry_outbox WHERE id = ?')
  getDb().transaction(() => ids.forEach((id) => remove.run(id)))()
}

interface PostponeParams {
  ids: number[]
  nextAttemptAt: (attempts: number) => number
}

/** 실패한 행의 시도 횟수를 올리고 다음 시도 시각을 미룬다. 시각은 올린 횟수로 계산한다 */
export const postponeOutboxRows = ({ ids, nextAttemptAt }: PostponeParams) => {
  const db = getDb()
  const read = db.prepare('SELECT attempts FROM telemetry_outbox WHERE id = ?')
  const update = db.prepare(
    'UPDATE telemetry_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?'
  )

  db.transaction(() =>
    ids.forEach((id) => {
      const row = read.get(id) as { attempts: number } | undefined
      if (!row) return

      const attempts = row.attempts + 1
      update.run(attempts, nextAttemptAt(attempts), id)
    })
  )()
}

interface UploadDbRow {
  meeting_id: string
  audio_path: string
  total_bytes: number
  uploaded_bytes: number
  status: UploadRow['status']
  attempts: number
}

const toUpload = (row: UploadDbRow): UploadRow => ({
  meetingId: row.meeting_id,
  audioPath: row.audio_path,
  totalBytes: row.total_bytes,
  uploadedBytes: row.uploaded_bytes,
  status: row.status,
  attempts: row.attempts
})

export const findUpload = ({ meetingId }: { meetingId: string }) => {
  const row = getDb()
    .prepare('SELECT * FROM telemetry_uploads WHERE meeting_id = ?')
    .get(meetingId) as UploadDbRow | undefined

  return row ? toUpload(row) : null
}

interface InsertUploadParams {
  meetingId: string
  audioPath: string
  totalBytes: number
  now: number
}

/** 이미 있으면 그대로 둔다 — 다시 인식한 회의의 녹음은 같은 파일이라 다시 올리지 않는다 */
export const insertUpload = ({ meetingId, audioPath, totalBytes, now }: InsertUploadParams) => {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO telemetry_uploads
       (meeting_id, audio_path, total_bytes, status, next_attempt_at)
       VALUES (?, ?, ?, 'pending', ?)`
    )
    .run(meetingId, audioPath, totalBytes, now)
}

export const findDueUpload = ({ now }: { now: number }) => {
  const row = getDb()
    .prepare(
      `SELECT * FROM telemetry_uploads
       WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 1`
    )
    .get(now) as UploadDbRow | undefined

  return row ? toUpload(row) : null
}

interface UpdateUploadParams {
  meetingId: string
  uploadedBytes: number
  status: UploadRow['status']
  attempts: number
  nextAttemptAt: number
}

export const updateUpload = ({
  meetingId,
  uploadedBytes,
  status,
  attempts,
  nextAttemptAt
}: UpdateUploadParams) => {
  getDb()
    .prepare(
      `UPDATE telemetry_uploads
       SET uploaded_bytes = ?, status = ?, attempts = ?, next_attempt_at = ?
       WHERE meeting_id = ?`
    )
    .run(uploadedBytes, status, attempts, nextAttemptAt, meetingId)
}
