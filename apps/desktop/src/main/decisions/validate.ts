import type { DecisionActionItem, DecisionEvidence, DecisionType } from '@shared/types'

import type { DecisionLine, ExtractedDecision } from '../types/decisions'

/**
 * LLM 출력을 믿지 않고 저장 전에 거른다 (references/decisions.md "코드 검증"). 전부 순수 함수다.
 * 길이 상한은 화면이 무너지지 않을 정도의 안전장치라 넘으면 버리지 않고 자른다.
 */
const TITLE_MAX_CHARS = 80
const DECISION_MAX_CHARS = 1000
const BACKGROUND_MAX_CHARS = 1500
const ITEM_TEXT_MAX_CHARS = 300
const MAX_ALTERNATIVES = 10
const MAX_ACTION_ITEMS = 20

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const asArray = (value: unknown) => (Array.isArray(value) ? value : [])

const clip = ({ text, max }: { text: string; max: number }) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

/**
 * 코드 펜스·앞뒤 설명을 벗겨 첫 `{`부터 마지막 `}`까지를 읽는다. 읽지 못하면 null.
 */
export const parseDecisionOutput = (raw: string) => {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
    if (!isRecord(parsed) || !Array.isArray(parsed.decisions)) return null

    return parsed.decisions.filter(isRecord).map(toExtracted)
  } catch {
    return null
  }
}

const toExtracted = (value: Record<string, unknown>): ExtractedDecision => ({
  title: asString(value.title),
  decision: asString(value.decision),
  type: asString(value.type),
  background: asString(value.background),
  alternatives: asArray(value.alternatives)
    .filter(isRecord)
    .map((item) => ({ option: asString(item.option), reason: asString(item.reason) })),
  actionItems: asArray(value.actionItems)
    .filter(isRecord)
    .map((item) => ({
      task: asString(item.task),
      owner: asString(item.owner),
      due: asString(item.due)
    })),
  proposers: asArray(value.proposers).map(asString).filter(Boolean),
  participants: asArray(value.participants).map(asString).filter(Boolean),
  evidenceLines: asArray(value.evidenceLines).filter(
    (item): item is number => typeof item === 'number' && Number.isInteger(item)
  )
})

/**
 * 근거 줄 번호를 시각 구간으로 바꾼다. 연속한 줄은 한 구간으로 합친다.
 * 발화 id가 아니라 시각으로 두는 이유는 references/decisions.md "코드 검증".
 */
export const toEvidenceRanges = ({
  lineNumbers,
  lines
}: {
  lineNumbers: number[]
  lines: DecisionLine[]
}) => {
  const byNumber = new Map(lines.map((line) => [line.lineNo, line]))
  const sorted = [...new Set(lineNumbers)]
    .filter((no) => byNumber.has(no))
    .toSorted((a, b) => a - b)

  return sorted.reduce<{ ranges: DecisionEvidence[]; lastNo: number | null }>(
    ({ ranges, lastNo }, no) => {
      const line = byNumber.get(no) as DecisionLine
      const last = ranges.at(-1)
      if (last && lastNo !== null && no === lastNo + 1) {
        return {
          ranges: [...ranges.slice(0, -1), { ...last, endSec: Math.max(last.endSec, line.endSec) }],
          lastNo: no
        }
      }

      return { ranges: [...ranges, { startSec: line.startSec, endSec: line.endSec }], lastNo: no }
    },
    { ranges: [], lastNo: null }
  ).ranges
}

/** 화자 표기("화자 2"·표시 이름·라벨) → 라벨. 대소문자·공백 차이는 무시한다 */
const nameKey = (name: string) => name.replace(/\s+/g, '').toLowerCase()

export const buildSpeakerLookup = ({ lines }: { lines: DecisionLine[] }) => {
  const lookup = new Map<string, string>()
  lines.forEach(({ speakerLabel, speakerName }) => {
    lookup.set(nameKey(speakerName), speakerLabel)
    lookup.set(nameKey(speakerLabel), speakerLabel)
  })

  return (name: string) => lookup.get(nameKey(name)) ?? null
}

/** 검증을 통과한 문서의 내용. id·회의·순서·시각은 저장하는 쪽이 붙인다 */
export interface ValidatedDecision {
  typeId: string | null
  title: string
  decision: string
  background: string
  alternatives: { option: string; reason: string }[]
  actionItems: DecisionActionItem[]
  proposerLabels: string[]
  participantLabels: string[]
  evidence: DecisionEvidence[]
  /** 합치기(reduce) 검증과 D0 스크립트가 쓰는 원래 줄 번호 */
  evidenceLines: number[]
}

interface ValidateDecisionsParams {
  candidates: ExtractedDecision[]
  lines: DecisionLine[]
  types: DecisionType[]
  /** 합치기 결과를 거를 때만. 이 집합 밖의 근거 줄은 새로 지어낸 것으로 보고 뺀다 */
  allowedLines?: Set<number>
}

const resolveLabels = ({
  names,
  resolve
}: {
  names: string[]
  resolve: (name: string) => string | null
}) => [...new Set(names.map(resolve).filter((label): label is string => label !== null))]

/**
 * 후보를 거른다. 근거 없는 후보·제목이나 결정이 빈 후보는 버리고, 타입·화자는 목록에 있을 때만 남긴다.
 * 버린 개수는 로그와 수집 이벤트(`droppedCount`)에 쓴다.
 */
export const validateDecisions = ({
  candidates,
  lines,
  types,
  allowedLines
}: ValidateDecisionsParams) => {
  const lineNumbers = new Set(lines.map(({ lineNo }) => lineNo))
  const typeIdByName = new Map(types.map(({ id, name }) => [name, id]))
  const resolve = buildSpeakerLookup({ lines })

  const decisions = candidates.flatMap((candidate): ValidatedDecision[] => {
    const evidenceLines = [...new Set(candidate.evidenceLines)].filter(
      (no) => lineNumbers.has(no) && (!allowedLines || allowedLines.has(no))
    )
    if (!evidenceLines.length || !candidate.title || !candidate.decision) return []

    return [
      {
        typeId: typeIdByName.get(candidate.type) ?? null,
        title: clip({ text: candidate.title, max: TITLE_MAX_CHARS }),
        decision: clip({ text: candidate.decision, max: DECISION_MAX_CHARS }),
        background: clip({ text: candidate.background, max: BACKGROUND_MAX_CHARS }),
        alternatives: candidate.alternatives
          .filter(({ option }) => option)
          .slice(0, MAX_ALTERNATIVES)
          .map(({ option, reason }) => ({
            option: clip({ text: option, max: ITEM_TEXT_MAX_CHARS }),
            reason: clip({ text: reason, max: ITEM_TEXT_MAX_CHARS })
          })),
        actionItems: candidate.actionItems
          .filter(({ task }) => task)
          .slice(0, MAX_ACTION_ITEMS)
          .map(({ task, owner, due }) => ({
            task: clip({ text: task, max: ITEM_TEXT_MAX_CHARS }),
            ownerLabel: owner ? resolve(owner) : null,
            ownerText: clip({ text: owner, max: ITEM_TEXT_MAX_CHARS }),
            due: clip({ text: due, max: ITEM_TEXT_MAX_CHARS })
          })),
        proposerLabels: resolveLabels({ names: candidate.proposers, resolve }),
        participantLabels: resolveLabels({ names: candidate.participants, resolve }),
        evidence: toEvidenceRanges({ lineNumbers: evidenceLines, lines }),
        evidenceLines
      }
    ]
  })

  return { decisions, droppedCount: candidates.length - decisions.length }
}
