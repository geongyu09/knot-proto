/**
 * 수집 서버가 받은 데이터를 터미널에 요약한다. 조회 API가 없으므로 SQLite 파일을 읽기 전용으로 직접 연다 (telemetry.md "수집 서버").
 *
 * 저장소 루트에서: pnpm collector:inspect [--data-dir ./data/dev] [--limit 20]
 * 데이터 폴더는 apps/collector 기준. 배포 서버에서는 컨테이너 안에서 --data-dir /data로 돌린다.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'

const DEFAULT_DATA_DIR = './data/dev'
const DEFAULT_LIMIT = 20
const DATABASE_FILE = 'collector.sqlite'
const PROPS_PREVIEW_LENGTH = 80
const TITLE_PREVIEW_LENGTH = 30
const BYTES_PER_MB = 1024 * 1024

const { values } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    limit: { type: 'string', default: String(DEFAULT_LIMIT) }
  }
})

const databasePath = path.resolve(values['data-dir'], DATABASE_FILE)
const limit = Number(values.limit) || DEFAULT_LIMIT

const write = (line = '') => process.stdout.write(`${line}\n`)

const timeOf = (epochMs: unknown) =>
  typeof epochMs === 'number' ? new Date(epochMs).toLocaleString('ko-KR') : '-'

const preview = ({ text, maxLength }: { text: string; maxLength: number }) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}…` : text

const printSection = ({ title, rows }: { title: string; rows: Record<string, unknown>[] }) => {
  write(`\n■ ${title}`)
  if (rows.length === 0) {
    write('  (없음)')
    return
  }
  console.table(rows)
}

const snapshotSummary = (raw: unknown) => {
  try {
    const snapshot = JSON.parse(String(raw)) as {
      meeting?: { title?: string; durationSec?: number }
      utterances?: unknown[]
      speakers?: unknown[]
    }
    return {
      title: preview({ text: snapshot.meeting?.title ?? '', maxLength: TITLE_PREVIEW_LENGTH }),
      durationSec: Math.round(snapshot.meeting?.durationSec ?? 0),
      utterances: snapshot.utterances?.length ?? 0,
      speakers: snapshot.speakers?.length ?? 0
    }
  } catch (caught) {
    return {
      title: `(스냅샷 JSON 파싱 실패: ${String(caught)})`,
      durationSec: 0,
      utterances: 0,
      speakers: 0
    }
  }
}

const main = () => {
  if (!existsSync(databasePath)) {
    write(`DB 파일이 없습니다: ${databasePath}`)
    write('서버가 아직 아무것도 받지 않았거나 --data-dir이 틀렸습니다.')
    process.exitCode = 1
    return
  }
  const db = new DatabaseSync(databasePath, { readOnly: true })
  write(`DB: ${databasePath}`)

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM events) AS events,
         (SELECT COUNT(DISTINCT install_id) FROM events) AS installs,
         (SELECT COUNT(*) FROM meeting_snapshots WHERE deleted_at IS NULL) AS meetings,
         (SELECT COUNT(*) FROM recordings WHERE completed_at IS NOT NULL) AS recordings`
    )
    .get()
  write(
    `이벤트 ${counts?.events}개 · 설치 ${counts?.installs}곳 · 회의 ${counts?.meetings}개 · 완료된 녹음 ${counts?.recordings}개`
  )

  printSection({
    title: '이벤트 이름별 개수',
    rows: db
      .prepare(
        'SELECT name, category, COUNT(*) AS count FROM events GROUP BY name ORDER BY count DESC'
      )
      .all()
  })

  printSection({
    title: `최근 이벤트 ${limit}개`,
    rows: db
      .prepare(
        `SELECT occurred_at, team_id, name, props FROM events ORDER BY occurred_at DESC, received_at DESC LIMIT ?`
      )
      .all(limit)
      .map((row) => ({
        at: timeOf(row.occurred_at),
        team: row.team_id,
        name: row.name,
        props: preview({ text: String(row.props), maxLength: PROPS_PREVIEW_LENGTH })
      }))
  })

  printSection({
    title: `최근 회의 스냅샷 ${limit}개`,
    rows: db
      .prepare(
        `SELECT team_id, meeting_id, revision, received_at, deleted_at, snapshot
         FROM meeting_snapshots ORDER BY received_at DESC LIMIT ?`
      )
      .all(limit)
      .map((row) => ({
        receivedAt: timeOf(row.received_at),
        team: row.team_id,
        meetingId: row.meeting_id,
        revision: row.revision,
        ...snapshotSummary(row.snapshot),
        deleted: row.deleted_at === null ? '' : timeOf(row.deleted_at)
      }))
  })

  printSection({
    title: `최근 녹음 업로드 ${limit}개`,
    rows: db
      .prepare(
        `SELECT team_id, meeting_id, received_bytes, total_bytes, updated_at, completed_at
         FROM recordings ORDER BY updated_at DESC LIMIT ?`
      )
      .all(limit)
      .map((row) => ({
        updatedAt: timeOf(row.updated_at),
        team: row.team_id,
        meetingId: row.meeting_id,
        mb: `${(Number(row.received_bytes) / BYTES_PER_MB).toFixed(1)} / ${(Number(row.total_bytes) / BYTES_PER_MB).toFixed(1)}`,
        isComplete: row.completed_at !== null
      }))
  })

  db.close()
}

main()
