import type { Speaker } from '@shared/types'
import { getDb } from './connection'
import { relabelDecisionSpeakers } from './decisions'

interface SpeakerRow {
  meeting_id: string
  label: string
  display_name: string | null
}

const toSpeaker = (row: SpeakerRow): Speaker => ({
  meetingId: row.meeting_id,
  label: row.label,
  displayName: row.display_name
})

export const listSpeakers = ({ meetingId }: { meetingId: string }) =>
  getDb()
    .prepare('SELECT * FROM speakers WHERE meeting_id = ? ORDER BY label')
    .all(meetingId)
    .map((row) => toSpeaker(row as SpeakerRow))

export const hasSpeaker = ({ meetingId, label }: { meetingId: string; label: string }) =>
  Boolean(
    getDb()
      .prepare('SELECT 1 FROM speakers WHERE meeting_id = ? AND label = ?')
      .get(meetingId, label)
  )

interface RenameSpeakerParams {
  meetingId: string
  label: string
  displayName: string
}

/** 라벨 → 이름 매핑만 바꾼다. 같은 라벨의 모든 발화에 한 번에 반영된다 */
export const renameSpeaker = ({ meetingId, label, displayName }: RenameSpeakerParams) =>
  getDb()
    .prepare(
      'UPDATE speakers SET display_name = @displayName WHERE meeting_id = @meetingId AND label = @label'
    )
    .run({ meetingId, label, displayName }).changes

interface MergeSpeakersParams {
  meetingId: string
  fromLabel: string
  intoLabel: string
}

/** 화자 A를 B에 흡수한다. 발화 이관·결정 문서 사람 필드 치환·행 삭제를 한 트랜잭션에서 한다 (references/data-model.md) */
export const mergeSpeakers = ({ meetingId, fromLabel, intoLabel }: MergeSpeakersParams) => {
  const db = getDb()
  const move = db.prepare(
    `UPDATE utterances SET speaker_label = @intoLabel
     WHERE meeting_id = @meetingId AND speaker_label = @fromLabel`
  )
  const remove = db.prepare('DELETE FROM speakers WHERE meeting_id = ? AND label = ?')

  db.transaction(() => {
    move.run({ meetingId, fromLabel, intoLabel })
    relabelDecisionSpeakers({ meetingId, fromLabel, intoLabel })
    remove.run(meetingId, fromLabel)
  })()
}

interface EnsureSpeakersParams {
  meetingId: string
  labels: string[]
}

/** 파이프라인이 찾아낸 화자 라벨을 등록한다. 이름(display_name)은 사용자가 나중에 지정한다 */
export const ensureSpeakers = ({ meetingId, labels }: EnsureSpeakersParams) => {
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO speakers (meeting_id, label, display_name) VALUES (?, ?, NULL)'
  )

  db.transaction(() => {
    labels.forEach((label) => insert.run(meetingId, label))
  })()
}
