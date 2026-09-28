import type { DatabaseSync } from 'node:sqlite'

export interface RecordingKey {
  teamId: string
  installId: string
  meetingId: string
}

export interface RecordingProgress {
  totalBytes: number
  receivedBytes: number
  isComplete: boolean
}

interface GetRecordingParams extends RecordingKey {
  db: DatabaseSync
}

export const getRecording = ({ db, teamId, installId, meetingId }: GetRecordingParams) => {
  const row = db
    .prepare(
      `SELECT total_bytes, received_bytes, completed_at FROM recordings
       WHERE team_id = ? AND install_id = ? AND meeting_id = ?`
    )
    .get(teamId, installId, meetingId)
  if (!row) return null
  const progress: RecordingProgress = {
    totalBytes: Number(row.total_bytes),
    receivedBytes: Number(row.received_bytes),
    isComplete: row.completed_at !== null
  }
  return progress
}

interface SaveRecordingProgressParams extends RecordingKey {
  db: DatabaseSync
  totalBytes: number
  receivedBytes: number
  now: number
}

export const saveRecordingProgress = ({
  db,
  teamId,
  installId,
  meetingId,
  totalBytes,
  receivedBytes,
  now
}: SaveRecordingProgressParams) => {
  const completedAt = receivedBytes === totalBytes ? now : null
  db.prepare(
    `
    INSERT INTO recordings
      (team_id, install_id, meeting_id, total_bytes, received_bytes, created_at, updated_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (team_id, install_id, meeting_id) DO UPDATE SET
      total_bytes = excluded.total_bytes,
      received_bytes = excluded.received_bytes,
      updated_at = excluded.updated_at,
      completed_at = excluded.completed_at
    `
  ).run(teamId, installId, meetingId, totalBytes, receivedBytes, now, now, completedAt)
}
