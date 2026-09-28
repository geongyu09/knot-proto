import type { DatabaseSync } from 'node:sqlite'
import type { MeetingSnapshot } from '@meeting-stt/telemetry/snapshot'

interface MeetingKey {
  db: DatabaseSync
  teamId: string
  installId: string
  meetingId: string
}

interface UpsertSnapshotParams {
  db: DatabaseSync
  teamId: string
  snapshot: MeetingSnapshot
  receivedAt: number
}

const readRevision = (row: Record<string, unknown> | undefined) =>
  typeof row?.revision === 'number' ? row.revision : 0

/**
 * (팀, 설치, 회의)마다 최신본 하나만 둔다. 늦게 도착한 옛 스냅샷(sentAt이 더 작음)으로는 덮어쓰지 않는다.
 * 지워졌던 회의라도 새 스냅샷이 오면 되살린다 — 앱에서 삭제를 취소할 수는 없지만 순서가 뒤바뀐 전송을 견디기 위해서다.
 */
export const upsertSnapshot = ({ db, teamId, snapshot, receivedAt }: UpsertSnapshotParams) => {
  const applied = db
    .prepare(
      `
      INSERT INTO meeting_snapshots
        (team_id, install_id, meeting_id, sent_at, received_at, revision, app_version, snapshot, deleted_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)
      ON CONFLICT (team_id, install_id, meeting_id) DO UPDATE SET
        sent_at = excluded.sent_at,
        received_at = excluded.received_at,
        revision = meeting_snapshots.revision + 1,
        app_version = excluded.app_version,
        snapshot = excluded.snapshot,
        deleted_at = NULL
      WHERE excluded.sent_at >= meeting_snapshots.sent_at
      RETURNING revision
      `
    )
    .get(
      teamId,
      snapshot.installId,
      snapshot.meetingId,
      snapshot.sentAt,
      receivedAt,
      snapshot.appVersion,
      JSON.stringify(snapshot)
    )
  if (applied) return { isApplied: true, revision: readRevision(applied) }

  const stored = db
    .prepare(
      'SELECT revision FROM meeting_snapshots WHERE team_id = ? AND install_id = ? AND meeting_id = ?'
    )
    .get(teamId, snapshot.installId, snapshot.meetingId)
  return { isApplied: false, revision: readRevision(stored) }
}

interface MarkMeetingDeletedParams extends MeetingKey {
  deletedAt: number
}

/** 보관 기간·삭제 절차가 정해지기 전이라 행은 지우지 않고 표시만 한다 (telemetry.md "수집 서버") */
export const markMeetingDeleted = ({
  db,
  teamId,
  installId,
  meetingId,
  deletedAt
}: MarkMeetingDeletedParams) => {
  const result = db
    .prepare(
      `UPDATE meeting_snapshots SET deleted_at = ?
       WHERE team_id = ? AND install_id = ? AND meeting_id = ? AND deleted_at IS NULL`
    )
    .run(deletedAt, teamId, installId, meetingId)
  return { isMarked: Number(result.changes) > 0 }
}
