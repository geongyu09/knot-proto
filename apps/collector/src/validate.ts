import type {
  TelemetryCategory,
  TelemetryPropValue,
  TelemetryProps
} from '@meeting-stt/telemetry/events'
import type { EventBatch, TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import {
  MEETING_SNAPSHOT_SCHEMA_VERSION,
  type MeetingSnapshot,
  type SnapshotDecision,
  type SnapshotDecisionType,
  type SnapshotMeeting,
  type SnapshotRefinePair,
  type SnapshotSpeaker,
  type SnapshotUtterance
} from '@meeting-stt/telemetry/snapshot'

import type { ParseResult } from './types/parse'

/** 팀 id·설치 id·회의 id는 녹음 저장 경로가 되므로 경로 문자(`/`, `.`)를 받지 않는다 */
export const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export const MAX_EVENTS_PER_BATCH = 500
/** 데스크탑 main이 만든 이벤트(job_failed.message 등)는 renderer 상한(80자)보다 길 수 있다. 거절 대신 자른다 */
export const MAX_STORED_PROP_LENGTH = 2000

const MAX_PROP_KEYS = 50
const MAX_SHORT_STRING_LENGTH = 200
const MAX_LONG_TEXT_LENGTH = 200_000
const MAX_LIST_LENGTH = 50_000
const CATEGORIES: ReadonlySet<string> = new Set<TelemetryCategory>([
  'usage',
  'performance',
  'error',
  'environment'
])

const fail = (error: string) => ({ ok: false, error }) as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isEpochMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isShortString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_SHORT_STRING_LENGTH

const isNullableText = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.length <= MAX_LONG_TEXT_LENGTH)

const isNullableEpochMs = (value: unknown): value is number | null =>
  value === null || isEpochMs(value)

export const isPathSegment = (value: unknown): value is string =>
  typeof value === 'string' && PATH_SEGMENT_PATTERN.test(value)

const clampProp = (value: TelemetryPropValue) =>
  typeof value === 'string' ? value.slice(0, MAX_STORED_PROP_LENGTH) : value

const parseProps = (value: unknown): ParseResult<TelemetryProps> => {
  if (!isRecord(value)) return fail('props가 객체가 아닙니다')
  const entries = Object.entries(value)
  if (entries.length > MAX_PROP_KEYS) return fail(`props는 ${MAX_PROP_KEYS}개까지입니다`)
  const props: TelemetryProps = {}
  for (const [key, prop] of entries) {
    const isPrimitive =
      prop === null ||
      typeof prop === 'boolean' ||
      typeof prop === 'string' ||
      (typeof prop === 'number' && Number.isFinite(prop))
    // 객체·배열 props는 회의 내용이 통째로 실리는 통로가 될 수 있어 받지 않는다
    if (!isPrimitive) return fail(`props.${key}가 원시값이 아닙니다`)
    props[key.slice(0, MAX_SHORT_STRING_LENGTH)] = clampProp(prop)
  }
  return { ok: true, value: props }
}

const parseEnvelope = (value: unknown): ParseResult<TelemetryEnvelope> => {
  if (!isRecord(value)) return fail('이벤트가 객체가 아닙니다')
  const { id, name, category, occurredAt, installId, sessionId, appVersion } = value
  if (!isPathSegment(id)) return fail('id 형식이 틀렸습니다')
  if (!isShortString(name)) return fail('name이 없거나 너무 깁니다')
  if (typeof category !== 'string' || !CATEGORIES.has(category)) {
    return fail(`알 수 없는 category: ${String(category)}`)
  }
  if (!isEpochMs(occurredAt)) return fail('occurredAt이 epoch ms가 아닙니다')
  if (!isPathSegment(installId)) return fail('installId 형식이 틀렸습니다')
  if (!isShortString(sessionId)) return fail('sessionId가 없습니다')
  if (!isShortString(appVersion)) return fail('appVersion이 없습니다')
  const props = parseProps(value.props)
  if (!props.ok) return props
  return {
    ok: true,
    value: {
      id,
      name,
      category: category as TelemetryCategory,
      props: props.value,
      occurredAt,
      installId,
      sessionId,
      appVersion
    }
  }
}

/** `POST /v1/events` 본문. 하나라도 모양이 틀리면 묶음 전체를 거절한다 */
export const parseEventBatch = (input: unknown): ParseResult<EventBatch> => {
  if (!isRecord(input) || !Array.isArray(input.events)) return fail('events 배열이 없습니다')
  if (input.events.length === 0) return fail('events가 비었습니다')
  if (input.events.length > MAX_EVENTS_PER_BATCH) {
    return fail(`events는 한 번에 ${MAX_EVENTS_PER_BATCH}개까지입니다`)
  }
  const events: TelemetryEnvelope[] = []
  for (const [index, raw] of input.events.entries()) {
    const envelope = parseEnvelope(raw)
    if (!envelope.ok) return fail(`events[${index}]: ${envelope.error}`)
    events.push(envelope.value)
  }
  return { ok: true, value: { events } }
}

interface ParseListParams<T> {
  value: unknown
  field: string
  parseItem: (item: unknown) => ParseResult<T>
}

const parseList = <T>({ value, field, parseItem }: ParseListParams<T>): ParseResult<T[]> => {
  if (!Array.isArray(value)) return fail(`${field}가 배열이 아닙니다`)
  if (value.length > MAX_LIST_LENGTH) return fail(`${field}가 너무 깁니다`)
  const items: T[] = []
  for (const [index, raw] of value.entries()) {
    const item = parseItem(raw)
    if (!item.ok) return fail(`${field}[${index}]: ${item.error}`)
    items.push(item.value)
  }
  return { ok: true, value: items }
}

const parseSnapshotMeeting = (value: unknown): ParseResult<SnapshotMeeting> => {
  if (!isRecord(value)) return fail('meeting이 객체가 아닙니다')
  const { title, createdAt, durationSec, status, errorMessage, speakerCount, summary } = value
  const { refinedAt, hasAudio, decisionState, decisionError } = value
  if (typeof title !== 'string' || title.length > MAX_LONG_TEXT_LENGTH) return fail('meeting.title')
  if (!isEpochMs(createdAt)) return fail('meeting.createdAt')
  if (!isNonNegativeNumber(durationSec)) return fail('meeting.durationSec')
  if (!isShortString(status)) return fail('meeting.status')
  if (!isNullableText(errorMessage)) return fail('meeting.errorMessage')
  if (speakerCount !== null && !Number.isInteger(speakerCount)) return fail('meeting.speakerCount')
  if (!isNullableText(summary)) return fail('meeting.summary')
  if (!isNullableEpochMs(refinedAt)) return fail('meeting.refinedAt')
  if (typeof hasAudio !== 'boolean') return fail('meeting.hasAudio')
  // 결정 문서 필드는 2026-09-28에 추가됐다. 옛 데스크탑 빌드는 보내지 않는다
  if (decisionState !== undefined && !isShortString(decisionState))
    return fail('meeting.decisionState')
  if (decisionError !== undefined && !isNullableText(decisionError))
    return fail('meeting.decisionError')
  return {
    ok: true,
    value: {
      title,
      createdAt,
      durationSec,
      status,
      errorMessage,
      speakerCount: speakerCount as number | null,
      summary,
      refinedAt,
      hasAudio,
      ...(decisionState === undefined ? {} : { decisionState }),
      ...(decisionError === undefined ? {} : { decisionError })
    }
  }
}

const parseUtterance = (value: unknown): ParseResult<SnapshotUtterance> => {
  if (!isRecord(value)) return fail('발화가 객체가 아닙니다')
  const { id, speakerLabel, startSec, endSec, text, originalText } = value
  if (!isShortString(id)) return fail('id')
  if (!isShortString(speakerLabel)) return fail('speakerLabel')
  if (!isNonNegativeNumber(startSec) || !isNonNegativeNumber(endSec)) return fail('startSec·endSec')
  if (typeof text !== 'string' || text.length > MAX_LONG_TEXT_LENGTH) return fail('text')
  if (!isNullableText(originalText)) return fail('originalText')
  return { ok: true, value: { id, speakerLabel, startSec, endSec, text, originalText } }
}

const parseSpeaker = (value: unknown): ParseResult<SnapshotSpeaker> => {
  if (!isRecord(value)) return fail('화자가 객체가 아닙니다')
  const { label, displayName } = value
  if (!isShortString(label)) return fail('label')
  if (displayName !== null && typeof displayName !== 'string') return fail('displayName')
  return { ok: true, value: { label, displayName } }
}

const parseRefinePair = (value: unknown): ParseResult<SnapshotRefinePair> => {
  if (!isRecord(value)) return fail('교정 쌍이 객체가 아닙니다')
  const { utteranceId, from, to } = value
  if (!isShortString(utteranceId)) return fail('utteranceId')
  if (typeof from !== 'string' || typeof to !== 'string') return fail('from·to')
  return { ok: true, value: { utteranceId, from, to } }
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isAlternative = (value: unknown) =>
  isRecord(value) && typeof value.option === 'string' && typeof value.reason === 'string'

const isActionItem = (value: unknown) =>
  isRecord(value) &&
  typeof value.task === 'string' &&
  (value.ownerLabel === null || typeof value.ownerLabel === 'string') &&
  typeof value.ownerText === 'string' &&
  typeof value.due === 'string'

const isEvidence = (value: unknown) =>
  isRecord(value) && isNonNegativeNumber(value.startSec) && isNonNegativeNumber(value.endSec)

const everyOf = (value: unknown, check: (item: unknown) => boolean) =>
  Array.isArray(value) && value.every(check)

const parseDecision = (value: unknown): ParseResult<SnapshotDecision> => {
  if (!isRecord(value)) return fail('결정 문서가 객체가 아닙니다')
  const { id, ord, typeId, title, decision, background, createdAt } = value
  const { alternatives, actionItems, proposerLabels, participantLabels, evidence } = value
  if (!isShortString(id)) return fail('id')
  if (!Number.isInteger(ord)) return fail('ord')
  if (typeId !== null && !isShortString(typeId)) return fail('typeId')
  if (typeof title !== 'string' || typeof decision !== 'string' || typeof background !== 'string')
    return fail('title·decision·background')
  if (!isEpochMs(createdAt)) return fail('createdAt')
  if (!everyOf(alternatives, isAlternative)) return fail('alternatives')
  if (!everyOf(actionItems, isActionItem)) return fail('actionItems')
  if (!isStringArray(proposerLabels) || !isStringArray(participantLabels))
    return fail('proposerLabels·participantLabels')
  if (!everyOf(evidence, isEvidence)) return fail('evidence')
  return {
    ok: true,
    value: {
      id,
      ord: ord as number,
      typeId,
      title,
      decision,
      background,
      alternatives: alternatives as SnapshotDecision['alternatives'],
      actionItems: actionItems as SnapshotDecision['actionItems'],
      proposerLabels,
      participantLabels,
      evidence: evidence as SnapshotDecision['evidence'],
      createdAt
    }
  }
}

const parseDecisionType = (value: unknown): ParseResult<SnapshotDecisionType> => {
  if (!isRecord(value)) return fail('결정 타입이 객체가 아닙니다')
  const { id, name, description } = value
  if (!isShortString(id) || !isShortString(name) || typeof description !== 'string')
    return fail('id·name·description')
  return { ok: true, value: { id, name, description } }
}

/** 옛 데스크탑 빌드는 결정 필드를 보내지 않는다. 없으면 없는 대로 둔다 */
const parseOptionalList = <T>(params: ParseListParams<T>): ParseResult<T[] | undefined> =>
  params.value === undefined ? { ok: true, value: undefined } : parseList(params)

const parseGlossaryTerm = (value: unknown): ParseResult<string> =>
  typeof value === 'string' ? { ok: true, value } : fail('용어가 문자열이 아닙니다')

/** `PUT /v1/meetings/{installId}/{meetingId}` 본문. 경로 값과의 일치는 라우트가 확인한다 */
export const parseMeetingSnapshot = (input: unknown): ParseResult<MeetingSnapshot> => {
  if (!isRecord(input)) return fail('본문이 객체가 아닙니다')
  if (input.schemaVersion !== MEETING_SNAPSHOT_SCHEMA_VERSION) {
    return fail(`지원하지 않는 schemaVersion: ${String(input.schemaVersion)}`)
  }
  const { installId, meetingId, sentAt, appVersion } = input
  if (!isPathSegment(installId) || !isPathSegment(meetingId))
    return fail('installId·meetingId 형식')
  if (!isEpochMs(sentAt)) return fail('sentAt이 epoch ms가 아닙니다')
  if (!isShortString(appVersion)) return fail('appVersion이 없습니다')
  const meeting = parseSnapshotMeeting(input.meeting)
  if (!meeting.ok) return meeting
  const utterances = parseList({
    value: input.utterances,
    field: 'utterances',
    parseItem: parseUtterance
  })
  if (!utterances.ok) return utterances
  const speakers = parseList({ value: input.speakers, field: 'speakers', parseItem: parseSpeaker })
  if (!speakers.ok) return speakers
  const refinePairs = parseList({
    value: input.refinePairs,
    field: 'refinePairs',
    parseItem: parseRefinePair
  })
  if (!refinePairs.ok) return refinePairs
  const glossaryTerms = parseList({
    value: input.glossaryTerms,
    field: 'glossaryTerms',
    parseItem: parseGlossaryTerm
  })
  if (!glossaryTerms.ok) return glossaryTerms
  const decisions = parseOptionalList({
    value: input.decisions,
    field: 'decisions',
    parseItem: parseDecision
  })
  if (!decisions.ok) return decisions
  const decisionTypes = parseOptionalList({
    value: input.decisionTypes,
    field: 'decisionTypes',
    parseItem: parseDecisionType
  })
  if (!decisionTypes.ok) return decisionTypes
  return {
    ok: true,
    value: {
      schemaVersion: MEETING_SNAPSHOT_SCHEMA_VERSION,
      installId,
      meetingId,
      sentAt,
      appVersion,
      meeting: meeting.value,
      utterances: utterances.value,
      speakers: speakers.value,
      refinePairs: refinePairs.value,
      glossaryTerms: glossaryTerms.value,
      ...(decisions.value ? { decisions: decisions.value } : {}),
      ...(decisionTypes.value ? { decisionTypes: decisionTypes.value } : {})
    }
  }
}
