import { normalizeGlossaryTerms } from '@shared/glossary'
import { isLlmReady } from '@shared/llm'
import { applyRefinePairs } from '@shared/refine'
import type { RefinePair, RefineSource, RefineStage } from '@shared/types'
import { applyRefineResult } from '../db/refine'
import { getAppSettings, getGlossarySettings } from '../db/settings'
import { listUtterances } from '../db/utterances'
import { createLlmClient, getLlmStatus } from '../llm/provider'
import type { LlmClient } from '../llm/types'
import { t } from '../locale'
import { info } from '../log'
import { track, trackMeetingSnapshot } from '../telemetry/track'

import { runRefine } from './run'
import { runSentenceRefine } from './sentence'

/**
 * 교정 잡 본체 (references/architecture.md "회의록 교정"). 줄 세우기·진행률 전달·실패 처리는 큐(`pipeline/queue.ts`)가 한다.
 */

const globalGlossary = () => normalizeGlossaryTerms(getGlossarySettings().terms)

type RefineProgress = (progress: { stage: RefineStage; percent: number }) => void

interface RefineRunParams {
  client: LlmClient
  meetingId: string
  sources: RefineSource[]
  glossary: string[]
  onProgress: RefineProgress
}

interface RefineMeetingParams {
  meetingId: string
  onProgress: RefineProgress
}

/** 로컬의 용어 교정. 코드 후보 + O/X 판정으로 쌍을 얻고, 본문에 실제로 들어간 쌍만 남긴다 */
const runTermRefine = async ({
  client,
  meetingId,
  sources,
  glossary,
  onProgress
}: RefineRunParams) => {
  if (!glossary.length) throw new Error(t().main.refine.glossaryEmpty)

  const pairs = await runRefine({
    client,
    meetingId,
    sources,
    glossary,
    onProgress
  })
  const suggestions = applyRefinePairs({ sources, pairs })
  // 긴 쌍에 먹혀 본문에 들어가지 않은 쌍은 결과에 남기지 않는다
  const isApplied = ({ utteranceId, from, to }: RefinePair) =>
    suggestions.some(
      (suggestion) =>
        suggestion.id === utteranceId &&
        suggestion.pairs.some((applied) => applied.from === from && applied.to === to)
    )

  return {
    texts: suggestions.map(({ id, after }) => ({ id, text: after })),
    pairs: pairs.filter(isApplied)
  }
}

/**
 * 공급자에 따라 로컬은 용어 교정, 외부는 문장 교정을 돌리고 결과를 바로 본문에 반영한다.
 * 결과는 이전 것을 통째로 대체한다 (references/architecture.md "회의록 교정").
 */
export const refineMeeting = async ({ meetingId, onProgress }: RefineMeetingParams) => {
  const sources = listUtterances({ meetingId }).map(({ id, text }) => ({ id, text }))
  if (!sources.length) throw new Error(t().main.refine.nothingToRefine)

  const startedAt = Date.now()
  const client = await createLlmClient()
  const params = { client, meetingId, sources, glossary: globalGlossary(), onProgress }
  const { texts, pairs } =
    client.provider === 'local' ? await runTermRefine(params) : await runSentenceRefine(params)

  applyRefineResult({ meetingId, texts, appliedPairs: pairs, refinedAt: Date.now() })
  info(`회의 ${meetingId} 교정 완료 (발화 ${texts.length}개, 쌍 ${pairs.length}개 반영)`)
  track({
    name: 'refine_completed',
    props: {
      meetingId,
      provider: client.provider,
      mode: client.provider === 'local' ? 'term' : 'sentence',
      elapsedMs: Date.now() - startedAt,
      changedCount: texts.length,
      pairCount: pairs.length
    }
  })
  trackMeetingSnapshot({ meetingId })
}

/** 자동 교정을 건너뛸 이유. 없으면 null. 로컬은 용어 사전, 외부는 자동 교정 스위치가 필요하다 */
export const autoRefineSkipReason = async () => {
  const status = await getLlmStatus()
  if (!isLlmReady(status)) return 'LLM이 준비되지 않음'
  if (status.provider === 'local')
    return globalGlossary().length ? null : '전역 용어 사전이 비어 있음'

  // 외부 공급자는 회의록이 그 회사 서버로 전송되므로 사용자가 켰을 때만 자동으로 돈다
  return getAppSettings().isAutoRefineExternal ? null : '외부 공급자 자동 교정이 꺼져 있음'
}
