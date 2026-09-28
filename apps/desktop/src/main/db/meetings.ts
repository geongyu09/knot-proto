import type { MeetingSearchResult } from '@shared/ipc'
import type { DecisionState, Meeting, MeetingStatus } from '@shared/types'
import { SEARCH_RESULT_LIMIT, toLikePattern } from '../searchQuery'
import { getDb } from './connection'
import { t } from '../locale'

interface MeetingRow {
  id: string
  title: string
  created_at: number
  duration_sec: number
  status: MeetingStatus
  error_message: string | null
  audio_path: string | null
  summary: string | null
  speaker_count: number | null
  decision_state: DecisionState
  decision_error: string | null
  /** 조회마다 decisions 개수를 붙인다 (MEETING_COLUMNS) */
  decision_count: number
}

/** 회의 행과 결정 문서 개수. 목록·상세·검색이 같은 모양을 쓰도록 한 곳에 둔다 */
const MEETING_COLUMNS = `m.*, (SELECT COUNT(*) FROM decisions d WHERE d.meeting_id = m.id) AS decision_count`

const toMeeting = (row: MeetingRow): Meeting => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  durationSec: row.duration_sec,
  status: row.status,
  ...(row.error_message ? { errorMessage: row.error_message } : {}),
  ...(row.summary ? { summary: row.summary } : {}),
  ...(row.speaker_count ? { speakerCount: row.speaker_count } : {}),
  hasAudio: row.audio_path !== null,
  decisionState: row.decision_state,
  decisionCount: row.decision_count,
  ...(row.decision_error ? { decisionError: row.decision_error } : {})
})

interface InsertMeetingParams {
  id: string
  title: string
  createdAt: number
  audioPath: string
}

export const insertMeeting = ({ id, title, createdAt, audioPath }: InsertMeetingParams) => {
  getDb()
    .prepare(
      `INSERT INTO meetings (id, title, created_at, duration_sec, status, audio_path)
       VALUES (@id, @title, @createdAt, 0, 'recording', @audioPath)`
    )
    .run({ id, title, createdAt, audioPath })
}

export const listMeetings = () =>
  getDb()
    .prepare(`SELECT ${MEETING_COLUMNS} FROM meetings m ORDER BY m.created_at DESC`)
    .all()
    .map((row) => toMeeting(row as MeetingRow))

interface SearchRow extends MeetingRow {
  match_utterance_id: string | null
  match_text: string | null
  match_start_sec: number | null
}

const toSearchResult = (row: SearchRow): MeetingSearchResult => ({
  meeting: toMeeting(row),
  match:
    row.match_utterance_id && row.match_text !== null && row.match_start_sec !== null
      ? { utteranceId: row.match_utterance_id, text: row.match_text, startSec: row.match_start_sec }
      : null
})

/**
 * 회의 제목과 발화 텍스트를 LIKE로 전체 스캔한다. 발화로 걸리면 순서가 가장 앞선 발화 하나를 함께 준다.
 * FTS5를 쓰지 않는 이유는 references/architecture.md "회의록 검색".
 */
export const searchMeetings = ({ query }: { query: string }) => {
  const pattern = toLikePattern(query)
  if (!pattern) return []

  return getDb()
    .prepare(
      `WITH first_match AS (
         SELECT u.meeting_id, u.id, u.text, u.start_sec,
                ROW_NUMBER() OVER (PARTITION BY u.meeting_id ORDER BY u.ord) AS rank
         FROM utterances u
         WHERE u.text LIKE @pattern ESCAPE '\\'
       )
       SELECT ${MEETING_COLUMNS}, f.id AS match_utterance_id, f.text AS match_text, f.start_sec AS match_start_sec
       FROM meetings m
       LEFT JOIN first_match f ON f.meeting_id = m.id AND f.rank = 1
       WHERE f.id IS NOT NULL OR m.title LIKE @pattern ESCAPE '\\'
       ORDER BY m.created_at DESC
       LIMIT @limit`
    )
    .all({ pattern, limit: SEARCH_RESULT_LIMIT })
    .map((row) => toSearchResult(row as SearchRow))
}

export const findMeeting = ({ meetingId }: { meetingId: string }) => {
  const row = getDb()
    .prepare(`SELECT ${MEETING_COLUMNS} FROM meetings m WHERE m.id = ?`)
    .get(meetingId)

  return row ? toMeeting(row as MeetingRow) : null
}

export const findAudioPath = ({ meetingId }: { meetingId: string }) => {
  const row = getDb().prepare('SELECT audio_path FROM meetings WHERE id = ?').get(meetingId) as
    Pick<MeetingRow, 'audio_path'> | undefined

  return row?.audio_path ?? null
}

interface UpdateMeetingStatusParams {
  meetingId: string
  status: MeetingStatus
  errorMessage?: string
}

export const updateMeetingStatus = ({
  meetingId,
  status,
  errorMessage
}: UpdateMeetingStatusParams) => {
  getDb()
    .prepare(
      'UPDATE meetings SET status = @status, error_message = @errorMessage WHERE id = @meetingId'
    )
    .run({ meetingId, status, errorMessage: errorMessage ?? null })
}

export const updateMeetingDuration = ({
  meetingId,
  durationSec
}: {
  meetingId: string
  durationSec: number
}) => {
  getDb()
    .prepare('UPDATE meetings SET duration_sec = @durationSec WHERE id = @meetingId')
    .run({ meetingId, durationSec })
}

/** 녹음 정지 시 입력한 참석자 수. 파이프라인이 화자 분리 전에 읽는다 */
export const updateMeetingSpeakerCount = ({
  meetingId,
  speakerCount
}: {
  meetingId: string
  speakerCount: number
}) => {
  getDb()
    .prepare('UPDATE meetings SET speaker_count = @speakerCount WHERE id = @meetingId')
    .run({ meetingId, speakerCount })
}

/**
 * 다시 인식 요청. 참석자 수를 바꾸고(null이면 임계값 폴백) 바로 처리 중으로 표시한다 —
 * 큐에서 기다리는 동안 두 번 요청되지 않고, 화면이 진행률을 보인다 (references/data-model.md "다시 인식").
 */
export const markMeetingReprocessing = ({
  meetingId,
  speakerCount
}: {
  meetingId: string
  speakerCount: number | null
}) => {
  getDb()
    .prepare(
      `UPDATE meetings
       SET speaker_count = @speakerCount, status = 'processing', error_message = NULL
       WHERE id = @meetingId`
    )
    .run({ meetingId, speakerCount })
}

/** 제목을 바꾼다. 대상 회의가 없으면 0을 돌려준다 */
export const renameMeeting = ({ meetingId, title }: { meetingId: string; title: string }) =>
  getDb().prepare('UPDATE meetings SET title = @title WHERE id = @meetingId').run({
    meetingId,
    title
  }).changes

/** 원본 WAV를 지운 뒤 경로를 비운다. 파일이 없는 회의는 재처리할 수 없다 */
export const clearAudioPath = ({ meetingId }: { meetingId: string }) => {
  getDb().prepare('UPDATE meetings SET audio_path = NULL WHERE id = ?').run(meetingId)
}

/** 발화·화자는 ON DELETE CASCADE로 함께 지워진다 (references/data-model.md) */
export const deleteMeeting = ({ meetingId }: { meetingId: string }) =>
  getDb().prepare('DELETE FROM meetings WHERE id = ?').run(meetingId).changes

/** 로컬 LLM 요약 결과를 저장한다 (Phase 5). 다시 만들면 덮어쓴다 */
export const updateMeetingSummary = ({
  meetingId,
  summary
}: {
  meetingId: string
  summary: string
}) =>
  getDb()
    .prepare('UPDATE meetings SET summary = @summary WHERE id = @meetingId')
    .run({ meetingId, summary }).changes > 0

/** 이전 실행이 녹음·처리 중에 죽은 경우 남는 행. 시작 시 한 번 정리한다 */
export const failStaleMeetings = () =>
  getDb()
    .prepare(
      `UPDATE meetings
       SET status = 'error', error_message = @errorMessage
       WHERE status IN ('recording', 'processing')`
    )
    .run({ errorMessage: t().main.pipeline.interruptedByQuit }).changes

/** 결정 추출을 줄 세운 순간. 이전 실패 문구는 지운다 (references/data-model.md "결정 문서") */
export const markDecisionsPending = ({ meetingId }: { meetingId: string }) => {
  getDb()
    .prepare("UPDATE meetings SET decision_state = 'pending', decision_error = NULL WHERE id = ?")
    .run(meetingId)
}

/** 추출 실패. 이전에 성공한 문서는 지우지 않는다 */
export const failDecisions = ({ meetingId, message }: { meetingId: string; message: string }) => {
  getDb()
    .prepare(
      "UPDATE meetings SET decision_state = 'error', decision_error = @message WHERE id = @meetingId"
    )
    .run({ meetingId, message })
}

/** 추출 중에 앱이 꺼져 남은 pending. 켜자마자 다시 돌리지 않고 실패로 보인다 (references/decisions.md "흐름") */
export const failStaleDecisions = () =>
  getDb()
    .prepare(
      "UPDATE meetings SET decision_state = 'error', decision_error = @message WHERE decision_state = 'pending'"
    )
    .run({ message: t().decisions.extraction.interruptedByQuit }).changes
