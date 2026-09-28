import type { Database } from 'better-sqlite3'

/**
 * user_version 기준 순차 마이그레이션. 배열에 추가만 하고 기존 항목은 수정하지 않는다
 * (references/data-model.md).
 */
const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS meetings (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    duration_sec  REAL NOT NULL DEFAULT 0,
    status        TEXT NOT NULL,
    error_message TEXT,
    audio_path    TEXT,
    summary       TEXT
  );

  CREATE TABLE IF NOT EXISTS utterances (
    id            TEXT PRIMARY KEY,
    meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    ord           INTEGER NOT NULL,
    speaker_label TEXT NOT NULL,
    start_sec     REAL NOT NULL,
    end_sec       REAL NOT NULL,
    text          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_utterances_meeting ON utterances(meeting_id, ord);

  CREATE TABLE IF NOT EXISTS speakers (
    meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    display_name  TEXT,
    PRIMARY KEY (meeting_id, label)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: 녹음 정지 시 입력한 참석자 수. 화자 분리의 num-clusters가 된다 (references/data-model.md)
  'ALTER TABLE meetings ADD COLUMN speaker_count INTEGER;',
  // 3: 교정 제안(RefinePair[] JSON)과 회의별 용어(string[] JSON). 둘 다 회의와 함께 사라지는 파생물이라 컬럼으로 둔다
  `
  ALTER TABLE meetings ADD COLUMN refine_pairs TEXT;
  ALTER TABLE meetings ADD COLUMN glossary_terms TEXT;
  `,
  // 4: 자동 교정으로 전환 (2026-09-25). 회의별 용어는 없애고, 제안 컬럼은 "반영한 쌍"으로 뜻이 바뀌므로 이름을 바꾸고
  //    미확정 제안(반영된 적 없음)은 비운다. refined_at이 NULL이면 아직 교정하지 않은 회의다 (references/data-model.md)
  `
  ALTER TABLE meetings DROP COLUMN glossary_terms;
  ALTER TABLE meetings RENAME COLUMN refine_pairs TO refine_applied;
  UPDATE meetings SET refine_applied = NULL;
  ALTER TABLE meetings ADD COLUMN refined_at INTEGER;
  `,
  // 5: 교정이 처음 바꾸기 전 원문 (2026-09-28). 문장 교정은 고치는 범위가 넓어 발화별로 되돌릴 수 있게 한다
  //    (references/data-model.md "자동 교정 결과 저장")
  'ALTER TABLE utterances ADD COLUMN original_text TEXT;',
  // 6: 사용 정보 outbox와 녹음 업로드 상태 (test/usage-analytics 브랜치 전용, references/data-model.md "사용 정보 outbox").
  //    업로드 행은 회의가 지워져도 워커가 정리하도록 FK를 걸지 않는다
  `
  CREATE TABLE IF NOT EXISTS telemetry_outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sink            TEXT NOT NULL,
    kind            TEXT NOT NULL,
    payload         TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_telemetry_outbox_due ON telemetry_outbox(sink, next_attempt_at);

  CREATE TABLE IF NOT EXISTS telemetry_uploads (
    meeting_id      TEXT PRIMARY KEY,
    audio_path      TEXT NOT NULL,
    total_bytes     INTEGER NOT NULL,
    uploaded_bytes  INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL
  );
  `,
  // 7: 결정 문서 (test/usage-analytics 브랜치, references/data-model.md "결정 문서").
  //    type_id는 settings JSON을 가리켜 FK가 없다 — 타입을 지워도 문서는 미분류로 남아야 한다
  `
  ALTER TABLE meetings ADD COLUMN decision_state TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE meetings ADD COLUMN decision_error TEXT;
  ALTER TABLE meetings ADD COLUMN decisions_extracted_at INTEGER;

  CREATE TABLE IF NOT EXISTS decisions (
    id                 TEXT PRIMARY KEY,
    meeting_id         TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    ord                INTEGER NOT NULL,
    type_id            TEXT,
    title              TEXT NOT NULL,
    decision           TEXT NOT NULL,
    background         TEXT NOT NULL DEFAULT '',
    alternatives       TEXT NOT NULL DEFAULT '[]',
    action_items       TEXT NOT NULL DEFAULT '[]',
    proposer_labels    TEXT NOT NULL DEFAULT '[]',
    participant_labels TEXT NOT NULL DEFAULT '[]',
    evidence           TEXT NOT NULL,
    created_at         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_decisions_meeting ON decisions(meeting_id, ord);
  `
]

export const migrate = (db: Database) => {
  const current = db.pragma('user_version', { simple: true }) as number

  MIGRATIONS.slice(current).forEach((sql, index) => {
    db.exec(sql)
    db.pragma(`user_version = ${current + index + 1}`)
  })
}
