import type { DecisionStage, DecisionType } from '@shared/types'
import type { LlmClient } from '../llm/types'
import { t } from '../locale'
import { info, warn } from '../log'
import type { DecisionLine, ExtractedDecision } from '../types/decisions'

import {
  buildDecisionChunkPrompt,
  buildDecisionReducePrompt,
  buildDecisionSystemPrompt,
  DECISIONS_GRAMMAR,
  DECISIONS_JSON_SCHEMA,
  DECISIONS_JSON_SCHEMA_NAME,
  DECISIONS_MAX_PREDICT_TOKENS,
  DECISIONS_TEMPERATURE,
  splitDecisionLines
} from './prompt'
import { parseDecisionOutput, validateDecisions } from './validate'

/**
 * 결정 추출 엔진. electron·DB를 import하지 않는다 — 앱 잡(`run.ts`)과 D0 스크립트(`scripts/decisions.ts`)가 함께 쓴다.
 * 흐름은 references/decisions.md "추출".
 */

/** 청크별 추출(map)이 전체 진행률에서 차지하는 몫. 나머지는 합치기(reduce) */
const EXTRACT_PERCENT = 85

/** 파싱 실패 시 같은 요청을 다시 묻는 횟수 (references/decisions.md "LLM 출력") */
const PARSE_RETRIES = 1

interface ProgressParams {
  stage: DecisionStage
  percent: number
}

interface AskParams {
  client: LlmClient
  system: string
  prompt: string
  label: string
  workDir: string
}

const ask = async ({ client, system, prompt, label, workDir }: AskParams) => {
  for (let attempt = 0; attempt <= PARSE_RETRIES; attempt += 1) {
    const raw = await client.complete({
      system,
      prompt,
      maxTokens: DECISIONS_MAX_PREDICT_TOKENS,
      label: attempt ? `${label}-retry${attempt}` : label,
      workDir,
      temperature: DECISIONS_TEMPERATURE,
      grammar: DECISIONS_GRAMMAR,
      jsonSchema: { name: DECISIONS_JSON_SCHEMA_NAME, schema: DECISIONS_JSON_SCHEMA }
    })
    const parsed = parseDecisionOutput(raw)
    if (parsed) return parsed

    warn(`결정 추출 응답 파싱 실패 (${label}, ${attempt + 1}번째): ${raw.slice(0, 200)}`)
  }

  throw new Error(t().decisions.extraction.unreadableOutput)
}

interface ExtractDecisionsParams {
  client: LlmClient
  lines: DecisionLine[]
  types: DecisionType[]
  /** local이 프롬프트·출력 파일을 두는 폴더. 만들고 지우는 것은 부르는 쪽의 몫이다 */
  workDir: string
  onProgress?: (progress: ProgressParams) => void
}

/**
 * 발화 줄에서 결정을 뽑아 검증까지 마친 목록을 돌려준다. 청크가 둘 이상이고 후보가 둘 이상일 때만 합치기를 돈다.
 * 합치기 결과의 근거 줄은 map 후보 근거 줄의 합집합 안으로 거른다.
 */
export const extractDecisions = async ({
  client,
  lines,
  types,
  workDir,
  onProgress = () => {}
}: ExtractDecisionsParams) => {
  if (!lines.length) throw new Error(t().decisions.extraction.nothingToExtract)

  const system = buildDecisionSystemPrompt({ types })
  const chunks = splitDecisionLines({ lines, budgetChars: client.chunkBudgetChars })
  const candidates: ExtractedDecision[] = []

  for (const [index, chunk] of chunks.entries()) {
    onProgress({ stage: 'extract', percent: (index / chunks.length) * EXTRACT_PERCENT })
    const found = await ask({
      client,
      system,
      prompt: buildDecisionChunkPrompt({ chunk, index, total: chunks.length }),
      label: `decisions-${index}`,
      workDir
    })
    candidates.push(...found)
  }

  const mapped = validateDecisions({ candidates, lines, types })
  if (chunks.length === 1 || mapped.decisions.length < 2) {
    return { ...mapped, chunkCount: chunks.length, candidateCount: candidates.length }
  }

  onProgress({ stage: 'reduce', percent: EXTRACT_PERCENT })
  const allowedLines = new Set(mapped.decisions.flatMap(({ evidenceLines }) => evidenceLines))
  const reduced = await ask({
    client,
    system,
    prompt: buildDecisionReducePrompt({
      candidates: candidates.filter((candidate) =>
        candidate.evidenceLines.some((no) => allowedLines.has(no))
      )
    }),
    label: 'decisions-reduce',
    workDir
  })
  const merged = validateDecisions({ candidates: reduced, lines, types, allowedLines })
  info(
    `결정 합치기: 후보 ${mapped.decisions.length}개 → ${merged.decisions.length}개 (합치기에서 버림 ${merged.droppedCount}개)`
  )

  return {
    decisions: merged.decisions,
    droppedCount: mapped.droppedCount + merged.droppedCount,
    chunkCount: chunks.length,
    candidateCount: candidates.length
  }
}
