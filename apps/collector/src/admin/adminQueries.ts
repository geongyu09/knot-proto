import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

import { getRecording, type RecordingKey } from '../recordingStore'
import { parseMeetingSnapshot } from '../validate'

/** 관리자 화면은 한국 팀이 보므로 날짜 경계를 KST로 자른다 (서버 컨테이너는 UTC) */
const KST_OFFSET_MODIFIER = '+9 hours'
const DAILY_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECENT_ERROR_LIMIT = 10
export const EVENTS_PAGE_SIZE = 100
const MEETINGS_LIMIT = 500
const MEETING_EVENTS_LIMIT = 200

type Row = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value : String(value ?? ''))
const numeric = (value: unknown) => (typeof value === 'number' ? value : Number(value ?? 0))
const nullableNumeric = (value: unknown) => (value === null ? null : numeric(value))

const parseProps = (raw: unknown) => {
  try {
    const parsed: unknown = JSON.parse(text(raw))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Row) : {}
  } catch {
    // 저장 때 JSON.stringify로 넣은 값이라 여기 오면 DB를 손으로 고친 것이다. 빈 props로 보여 준다
    return {}
  }
}

export interface EventRow {
  id: string
  teamId: string
  installId: string
  sessionId: string
  name: string
  category: string
  props: Row
  appVersion: string
  occurredAt: number
}

const toEventRow = (row: Row): EventRow => ({
  id: text(row.id),
  teamId: text(row.team_id),
  installId: text(row.install_id),
  sessionId: text(row.session_id),
  name: text(row.name),
  category: text(row.category),
  props: parseProps(row.props),
  appVersion: text(row.app_version),
  occurredAt: numeric(row.occurred_at)
})

const EVENT_COLUMNS =
  'id, team_id, install_id, session_id, name, category, props, app_version, occurred_at'

export const getOverview = ({ db, now }: { db: DatabaseSync; now: number }) => {
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM events) AS events,
         (SELECT COUNT(*) FROM events WHERE category = 'error') AS errors,
         (SELECT COUNT(DISTINCT install_id) FROM events) AS installs,
         (SELECT COUNT(DISTINCT team_id) FROM events) AS teams,
         (SELECT COUNT(*) FROM meeting_snapshots WHERE deleted_at IS NULL) AS meetings,
         (SELECT COUNT(*) FROM recordings WHERE completed_at IS NOT NULL) AS recordings,
         (SELECT COALESCE(SUM(received_bytes), 0) FROM recordings) AS recordingBytes`
    )
    .get() as Row

  const since = now - DAILY_WINDOW_DAYS * MS_PER_DAY
  const dailyCounts = db
    .prepare(
      `SELECT date(occurred_at / 1000, 'unixepoch', ?) AS day, COUNT(*) AS count
       FROM events WHERE occurred_at >= ? GROUP BY day ORDER BY day`
    )
    .all(KST_OFFSET_MODIFIER, since)
    .map((row) => ({ day: text(row.day), count: numeric(row.count) }))

  const nameCounts = db
    .prepare(
      `SELECT name, category, COUNT(*) AS count FROM events
       GROUP BY name, category ORDER BY count DESC`
    )
    .all()
    .map((row) => ({
      name: text(row.name),
      category: text(row.category),
      count: numeric(row.count)
    }))

  const recentErrors = db
    .prepare(
      `SELECT ${EVENT_COLUMNS} FROM events WHERE category = 'error'
       ORDER BY occurred_at DESC LIMIT ?`
    )
    .all(RECENT_ERROR_LIMIT)
    .map(toEventRow)

  return {
    totals: {
      events: numeric(totals.events),
      errors: numeric(totals.errors),
      installs: numeric(totals.installs),
      teams: numeric(totals.teams),
      meetings: numeric(totals.meetings),
      recordings: numeric(totals.recordings),
      recordingBytes: numeric(totals.recordingBytes)
    },
    dailyCounts,
    nameCounts,
    recentErrors
  }
}

export interface EventFilter {
  teamId?: string
  installId?: string
  name?: string
  category?: string
}

const FILTER_COLUMNS: Record<keyof EventFilter, string> = {
  teamId: 'team_id',
  installId: 'install_id',
  name: 'name',
  category: 'category'
}

/** 값이 있는 필터만 `column = ?`로 묶는다. 컬럼 이름은 위 고정 표에서만 온다 */
const whereOf = (filter: EventFilter) => {
  const entries = (Object.keys(FILTER_COLUMNS) as (keyof EventFilter)[]).flatMap((key) => {
    const value = filter[key]
    return value ? [{ clause: `${FILTER_COLUMNS[key]} = ?`, value }] : []
  })
  return {
    sql: entries.length > 0 ? `WHERE ${entries.map((entry) => entry.clause).join(' AND ')}` : '',
    params: entries.map((entry): SQLInputValue => entry.value)
  }
}

export const listEvents = ({
  db,
  filter,
  page
}: {
  db: DatabaseSync
  filter: EventFilter
  page: number
}) => {
  const where = whereOf(filter)
  // 다음 페이지가 있는지 알려고 한 줄 더 읽는다
  const rows = db
    .prepare(
      `SELECT ${EVENT_COLUMNS} FROM events ${where.sql}
       ORDER BY occurred_at DESC, received_at DESC LIMIT ? OFFSET ?`
    )
    .all(...where.params, EVENTS_PAGE_SIZE + 1, page * EVENTS_PAGE_SIZE)
    .map(toEventRow)
  const total = numeric(
    (db.prepare(`SELECT COUNT(*) AS n FROM events ${where.sql}`).get(...where.params) as Row).n
  )
  return { events: rows.slice(0, EVENTS_PAGE_SIZE), hasNext: rows.length > EVENTS_PAGE_SIZE, total }
}

/** 필터 선택지. 이벤트 이름은 데스크탑이 서버보다 새 버전일 수 있어 카탈로그가 아니라 DB에서 모은다 */
export const getFilterOptions = (db: DatabaseSync) => ({
  teamIds: db
    .prepare(
      'SELECT DISTINCT team_id FROM events UNION SELECT DISTINCT team_id FROM meeting_snapshots ORDER BY 1'
    )
    .all()
    .map((row) => text(row.team_id)),
  names: db
    .prepare('SELECT DISTINCT name FROM events ORDER BY name')
    .all()
    .map((row) => text(row.name))
})

export const listInstalls = (db: DatabaseSync) => {
  const rows = db
    .prepare(
      `SELECT e.team_id, e.install_id,
         MIN(e.occurred_at) AS first_at, MAX(e.occurred_at) AS last_at, COUNT(*) AS event_count,
         (SELECT COUNT(*) FROM meeting_snapshots m
           WHERE m.team_id = e.team_id AND m.install_id = e.install_id AND m.deleted_at IS NULL) AS meeting_count,
         (SELECT props FROM events env
           WHERE env.team_id = e.team_id AND env.install_id = e.install_id AND env.name = 'environment'
           ORDER BY env.occurred_at DESC LIMIT 1) AS environment
       FROM events e GROUP BY e.team_id, e.install_id ORDER BY last_at DESC`
    )
    .all()
  return rows.map((row) => ({
    teamId: text(row.team_id),
    installId: text(row.install_id),
    firstAt: numeric(row.first_at),
    lastAt: numeric(row.last_at),
    eventCount: numeric(row.event_count),
    meetingCount: numeric(row.meeting_count),
    environment: row.environment === null ? null : parseProps(row.environment)
  }))
}

export interface MeetingFilter {
  teamId?: string
  installId?: string
}

export const listMeetings = ({ db, filter }: { db: DatabaseSync; filter: MeetingFilter }) => {
  const where = whereOf(filter)
  const rows = db
    .prepare(
      `SELECT m.team_id, m.install_id, m.meeting_id, m.revision, m.received_at, m.deleted_at, m.snapshot,
         r.received_bytes, r.total_bytes, r.completed_at
       FROM (SELECT * FROM meeting_snapshots ${where.sql}) m
       LEFT JOIN recordings r
         ON r.team_id = m.team_id AND r.install_id = m.install_id AND r.meeting_id = m.meeting_id
       ORDER BY m.received_at DESC LIMIT ?`
    )
    .all(...where.params, MEETINGS_LIMIT)
  return rows.map((row) => {
    const snapshot = parseMeetingSnapshot(parseSnapshotJson(row.snapshot))
    return {
      teamId: text(row.team_id),
      installId: text(row.install_id),
      meetingId: text(row.meeting_id),
      revision: numeric(row.revision),
      receivedAt: numeric(row.received_at),
      deletedAt: nullableNumeric(row.deleted_at),
      snapshot: snapshot.ok ? snapshot.value : null,
      recording:
        row.total_bytes === null
          ? null
          : {
              receivedBytes: numeric(row.received_bytes),
              totalBytes: numeric(row.total_bytes),
              isComplete: row.completed_at !== null
            }
    }
  })
}

const parseSnapshotJson = (raw: unknown): unknown => {
  try {
    return JSON.parse(text(raw))
  } catch {
    // 파싱 실패는 parseMeetingSnapshot이 "객체가 아닙니다"로 돌려주고 화면이 그 사실을 보여 준다
    return undefined
  }
}

export const getMeeting = ({ db, key }: { db: DatabaseSync; key: RecordingKey }) => {
  const row = db
    .prepare(
      `SELECT revision, received_at, deleted_at, snapshot FROM meeting_snapshots
       WHERE team_id = ? AND install_id = ? AND meeting_id = ?`
    )
    .get(key.teamId, key.installId, key.meetingId)
  if (!row) return null
  const snapshot = parseMeetingSnapshot(parseSnapshotJson(row.snapshot))
  // 이벤트 props의 meetingId로 그 회의에 관한 이벤트를 모은다 (녹음 정지·파이프라인·편집 등)
  const events = db
    .prepare(
      `SELECT ${EVENT_COLUMNS} FROM events
       WHERE team_id = ? AND install_id = ? AND json_extract(props, '$.meetingId') = ?
       ORDER BY occurred_at DESC LIMIT ?`
    )
    .all(key.teamId, key.installId, key.meetingId, MEETING_EVENTS_LIMIT)
    .map(toEventRow)
  return {
    revision: numeric(row.revision),
    receivedAt: numeric(row.received_at),
    deletedAt: nullableNumeric(row.deleted_at),
    rawSnapshot: text(row.snapshot),
    snapshot: snapshot.ok ? snapshot.value : null,
    snapshotError: snapshot.ok ? null : snapshot.error,
    recording: getRecording({ db, ...key }),
    events
  }
}
