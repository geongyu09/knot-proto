import type {
  Decision,
  DecisionActionItem,
  DecisionAlternative,
  DecisionEvidence,
  DecisionListItem
} from '@shared/types'
import { SEARCH_RESULT_LIMIT, toLikePattern } from '../searchQuery'
import { getDb } from './connection'

interface DecisionRow {
  id: string
  meeting_id: string
  ord: number
  type_id: string | null
  title: string
  decision: string
  background: string
  alternatives: string
  action_items: string
  proposer_labels: string
  participant_labels: string
  evidence: string
  created_at: number
}

interface ListRow {
  id: string
  meeting_id: string
  type_id: string | null
  title: string
  meeting_title: string
  meeting_created_at: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isString = (value: unknown): value is string => typeof value === 'string'

const isAlternative = (value: unknown): value is DecisionAlternative =>
  isRecord(value) && isString(value.option) && isString(value.reason)

const isActionItem = (value: unknown): value is DecisionActionItem =>
  isRecord(value) &&
  isString(value.task) &&
  (value.ownerLabel === null || isString(value.ownerLabel)) &&
  isString(value.ownerText) &&
  isString(value.due)

const isEvidence = (value: unknown): value is DecisionEvidence =>
  isRecord(value) && typeof value.startSec === 'number' && typeof value.endSec === 'number'

/** JSON 컬럼이 깨져 있으면 빈 배열로 읽는다 — 문서 하나 때문에 목록이 멈추면 안 된다 (references/data-model.md) */
const readJsonArray = <Item>(value: string, guard: (item: unknown) => item is Item) => {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(guard) : []
  } catch {
    return []
  }
}

const toDecision = (row: DecisionRow): Decision => ({
  id: row.id,
  meetingId: row.meeting_id,
  ord: row.ord,
  typeId: row.type_id,
  title: row.title,
  decision: row.decision,
  background: row.background,
  alternatives: readJsonArray(row.alternatives, isAlternative),
  actionItems: readJsonArray(row.action_items, isActionItem),
  proposerLabels: readJsonArray(row.proposer_labels, isString),
  participantLabels: readJsonArray(row.participant_labels, isString),
  evidence: readJsonArray(row.evidence, isEvidence),
  createdAt: row.created_at
})

const toListItem = (row: ListRow): DecisionListItem => ({
  id: row.id,
  meetingId: row.meeting_id,
  typeId: row.type_id,
  title: row.title,
  meetingTitle: row.meeting_title,
  meetingCreatedAt: row.meeting_created_at
})

const LIST_SELECT = `SELECT d.id, d.meeting_id, d.type_id, d.title,
                            m.title AS meeting_title, m.created_at AS meeting_created_at
                     FROM decisions d JOIN meetings m ON m.id = d.meeting_id`

/** 사이드 패널 결정 탭. 묶음은 renderer가 타입 순서로 만든다 */
export const listDecisions = () =>
  getDb()
    .prepare(`${LIST_SELECT} ORDER BY m.created_at DESC, d.ord`)
    .all()
    .map((row) => toListItem(row as ListRow))

export const listMeetingDecisions = ({ meetingId }: { meetingId: string }) =>
  getDb()
    .prepare(`${LIST_SELECT} WHERE d.meeting_id = ? ORDER BY d.ord`)
    .all(meetingId)
    .map((row) => toListItem(row as ListRow))

export const findDecision = ({ decisionId }: { decisionId: string }) => {
  const row = getDb().prepare('SELECT * FROM decisions WHERE id = ?').get(decisionId)

  return row ? toDecision(row as DecisionRow) : null
}

/** 스냅샷·검증용 회의 하나의 문서 전체 */
export const listMeetingDecisionDocuments = ({ meetingId }: { meetingId: string }) =>
  getDb()
    .prepare('SELECT * FROM decisions WHERE meeting_id = ? ORDER BY ord')
    .all(meetingId)
    .map((row) => toDecision(row as DecisionRow))

/** 제목·결정 내용·배경 부분 일치. LIKE 이스케이프는 회의 검색과 같다 (references/decisions.md "사이드 패널") */
export const searchDecisions = ({ query }: { query: string }) => {
  const pattern = toLikePattern(query)
  if (!pattern) return []

  return getDb()
    .prepare(
      `${LIST_SELECT}
       WHERE d.title LIKE @pattern ESCAPE '\\'
          OR d.decision LIKE @pattern ESCAPE '\\'
          OR d.background LIKE @pattern ESCAPE '\\'
       ORDER BY m.created_at DESC, d.ord
       LIMIT @limit`
    )
    .all({ pattern, limit: SEARCH_RESULT_LIMIT })
    .map((row) => toListItem(row as ListRow))
}

interface ReplaceDecisionsParams {
  meetingId: string
  decisions: Decision[]
  extractedAt: number
}

/**
 * 추출 성공. 그 회의의 문서를 통째로 바꾸고 상태를 done으로 한 트랜잭션에서 한다 —
 * 실패한 다시 추출이 이전 문서를 지우지 않게 하기 위해서다 (references/data-model.md "결정 문서").
 */
export const replaceDecisions = ({ meetingId, decisions, extractedAt }: ReplaceDecisionsParams) => {
  const db = getDb()
  const remove = db.prepare('DELETE FROM decisions WHERE meeting_id = ?')
  const insert = db.prepare(
    `INSERT INTO decisions (id, meeting_id, ord, type_id, title, decision, background, alternatives,
                            action_items, proposer_labels, participant_labels, evidence, created_at)
     VALUES (@id, @meetingId, @ord, @typeId, @title, @decision, @background, @alternatives,
             @actionItems, @proposerLabels, @participantLabels, @evidence, @createdAt)`
  )
  const markDone = db.prepare(
    `UPDATE meetings SET decision_state = 'done', decision_error = NULL, decisions_extracted_at = ?
     WHERE id = ?`
  )

  db.transaction(() => {
    remove.run(meetingId)
    decisions.forEach((decision) =>
      insert.run({
        ...decision,
        meetingId,
        alternatives: JSON.stringify(decision.alternatives),
        actionItems: JSON.stringify(decision.actionItems),
        proposerLabels: JSON.stringify(decision.proposerLabels),
        participantLabels: JSON.stringify(decision.participantLabels),
        evidence: JSON.stringify(decision.evidence)
      })
    )
    markDone.run(extractedAt, meetingId)
  })()
}

const replaceLabel = ({ labels, from, into }: { labels: string[]; from: string; into: string }) => [
  ...new Set(labels.map((label) => (label === from ? into : label)))
]

/**
 * 화자 병합(A→B)을 문서의 사람 필드에도 반영한다. 빼면 병합된 화자가 알 수 없는 라벨로 남는다.
 * 화자 병합 트랜잭션 안에서 부른다 (references/data-model.md "결정 문서").
 */
export const relabelDecisionSpeakers = ({
  meetingId,
  fromLabel,
  intoLabel
}: {
  meetingId: string
  fromLabel: string
  intoLabel: string
}) => {
  const db = getDb()
  const update = db.prepare(
    `UPDATE decisions SET proposer_labels = @proposers, participant_labels = @participants,
                          action_items = @actionItems
     WHERE id = @id`
  )

  listMeetingDecisionDocuments({ meetingId }).forEach((decision) => {
    const relabel = (labels: string[]) => replaceLabel({ labels, from: fromLabel, into: intoLabel })
    update.run({
      id: decision.id,
      proposers: JSON.stringify(relabel(decision.proposerLabels)),
      participants: JSON.stringify(relabel(decision.participantLabels)),
      actionItems: JSON.stringify(
        decision.actionItems.map((item) =>
          item.ownerLabel === fromLabel ? { ...item, ownerLabel: intoLabel } : item
        )
      )
    })
  })
}
