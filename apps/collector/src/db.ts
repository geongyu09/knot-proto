import { DatabaseSync } from 'node:sqlite'

/**
 * 순서대로 한 번씩 적용한다. 적용 여부는 PRAGMA user_version으로 센다.
 * 이미 배포된 마이그레이션은 고치지 않고 새 항목을 뒤에 붙인다.
 */
const MIGRATIONS = [
  `
  CREATE TABLE events (
    id           TEXT PRIMARY KEY,
    team_id      TEXT NOT NULL,
    install_id   TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    props        TEXT NOT NULL,
    app_version  TEXT NOT NULL,
    occurred_at  INTEGER NOT NULL,
    received_at  INTEGER NOT NULL
  );
  CREATE INDEX events_team_occurred ON events(team_id, occurred_at);
  CREATE INDEX events_name_occurred ON events(name, occurred_at);

  CREATE TABLE meeting_snapshots (
    team_id      TEXT NOT NULL,
    install_id   TEXT NOT NULL,
    meeting_id   TEXT NOT NULL,
    sent_at      INTEGER NOT NULL,
    received_at  INTEGER NOT NULL,
    revision     INTEGER NOT NULL,
    app_version  TEXT NOT NULL,
    snapshot     TEXT NOT NULL,
    deleted_at   INTEGER,
    PRIMARY KEY (team_id, install_id, meeting_id)
  );

  CREATE TABLE recordings (
    team_id        TEXT NOT NULL,
    install_id     TEXT NOT NULL,
    meeting_id     TEXT NOT NULL,
    total_bytes    INTEGER NOT NULL,
    received_bytes INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    completed_at   INTEGER,
    PRIMARY KEY (team_id, install_id, meeting_id)
  );
  `
]

const migrate = (db: DatabaseSync) => {
  const row = db.prepare('PRAGMA user_version').get()
  const current = typeof row?.user_version === 'number' ? row.user_version : 0
  MIGRATIONS.slice(current).forEach((sql, index) => {
    // 마이그레이션 하나가 중간에 실패하면 반쯤 만든 스키마가 남지 않게 버전 갱신까지 한 트랜잭션으로 묶는다
    runInTransaction({
      db,
      work: () => {
        db.exec(sql)
        db.exec(`PRAGMA user_version = ${current + index + 1}`)
      }
    })
  })
}

interface RunInTransactionParams<T> {
  db: DatabaseSync
  work: () => T
}

/** node:sqlite에는 better-sqlite3의 db.transaction()이 없어 직접 감싼다 */
export const runInTransaction = <T>({ db, work }: RunInTransactionParams<T>) => {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (caught) {
    db.exec('ROLLBACK')
    throw caught
  }
}

/** 파일 경로 또는 `:memory:`(테스트)를 열고 마이그레이션까지 끝낸다 */
export const openDatabase = (location: string) => {
  const db = new DatabaseSync(location)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}
