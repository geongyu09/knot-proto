import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import {
  IPC,
  type GetDecisionResponse,
  type GetDecisionsResponse,
  type GetDecisionTypesResponse,
  type GetMeetingDecisionsResponse,
  type SearchDecisionsResponse,
  type UpdateDecisionTypesResponse
} from '@shared/ipc'
import { readDecisionTypes } from '@shared/decisions'
import { findDecision, listDecisions, listMeetingDecisions, searchDecisions } from '../db/decisions'
import { findMeeting } from '../db/meetings'
import { getDecisionTypes, updateDecisionTypes } from '../db/settings'
import { t } from '../locale'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { enqueueDecisionsJob } from '../pipeline/queue'
import { track } from '../telemetry/track'

/**
 * 결정 문서 채널 (references/decisions.md "IPC"). handlers.ts가 길어 따로 둔다.
 * renderer가 보낸 payload는 신뢰하지 않는다 (.claude/rules/ipc-api-guide.md).
 */
const ID_MAX_LENGTH = 100
const SEARCH_QUERY_MAX_LENGTH = 200

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readId = ({ payload, key, label }: { payload: unknown; key: string; label: string }) => {
  const value = isRecord(payload) ? payload[key] : undefined
  if (typeof value !== 'string' || !value.trim() || value.length > ID_MAX_LENGTH) {
    throw new Error(t().main.errors.invalidRequest({ what: label }))
  }

  return value.trim()
}

const readMeetingId = (payload: unknown) =>
  readId({ payload, key: 'meetingId', label: t().main.fields.meetingId })

const handleGetDecision = (payload: unknown): GetDecisionResponse => {
  const decision = findDecision({
    decisionId: readId({ payload, key: 'decisionId', label: t().main.fields.decisionId })
  })
  const meeting = decision ? findMeeting({ meetingId: decision.meetingId }) : null

  return decision && meeting ? { decision, meeting } : null
}

/** 회의록이 만들어진 회의만 추출한다. 이미 줄 서 있으면 큐가 무시한다 */
const handleExtractDecisions = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.errors.meetingNotFound)
  if (meeting.status !== 'done') throw new Error(t().decisions.extraction.meetingNotReady)

  enqueueDecisionsJob({ meetingId, trigger: 'manual' })
}

const handleSearchDecisions = (payload: unknown): SearchDecisionsResponse => {
  if (!isRecord(payload) || typeof payload.query !== 'string') {
    throw new Error(t().main.errors.invalidRequest({ what: t().main.fields.searchQuery }))
  }
  if (payload.query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new Error(t().main.errors.searchQueryTooLong({ maxLength: SEARCH_QUERY_MAX_LENGTH }))
  }

  return searchDecisions({ query: payload.query })
}

/** 타입 이름이 바뀌면 사이드 패널 묶음 이름도 바뀌므로 목록 갱신을 알린다 */
const handleUpdateDecisionTypes = (payload: unknown): UpdateDecisionTypesResponse => {
  const types = updateDecisionTypes({
    types: readDecisionTypes({
      value: isRecord(payload) ? payload.types : undefined,
      createId: randomUUID,
      errors: t().decisions.errors
    })
  })
  notifyMeetingsChanged()
  track({ name: 'decision_types_updated', props: { count: types.length } })

  return types
}

export const registerDecisionHandlers = () => {
  ipcMain.handle(IPC.decisions.list, (): GetDecisionsResponse => listDecisions())

  ipcMain.handle(IPC.decisions.get, (_event, payload) => handleGetDecision(payload))

  ipcMain.handle(IPC.decisions.ofMeeting, (_event, payload): GetMeetingDecisionsResponse =>
    listMeetingDecisions({ meetingId: readMeetingId(payload) })
  )

  // 추출은 수 분이 걸린다. 요약처럼 큐에 넣기만 하고 결과는 이벤트로 보낸다
  ipcMain.handle(IPC.decisions.extract, (_event, payload) => handleExtractDecisions(payload))

  ipcMain.handle(IPC.decisions.search, (_event, payload) => handleSearchDecisions(payload))

  ipcMain.handle(IPC.decisionTypes.get, (): GetDecisionTypesResponse => getDecisionTypes())

  ipcMain.handle(IPC.decisionTypes.update, (_event, payload) => handleUpdateDecisionTypes(payload))
}
