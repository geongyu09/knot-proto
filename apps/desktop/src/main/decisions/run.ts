import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import type { Decision, DecisionStage } from '@shared/types'
import { replaceDecisions } from '../db/decisions'
import { findMeeting } from '../db/meetings'
import { getDecisionTypes } from '../db/settings'
import { listSpeakers } from '../db/speakers'
import { listUtterances } from '../db/utterances'
import { createLlmClient } from '../llm/provider'
import { t } from '../locale'
import { info } from '../log'
import { track, trackMeetingSnapshot } from '../telemetry/track'

import { extractDecisions } from './extract'
import { buildDecisionLines } from './lines'
import { decisionsWorkDir } from './paths'

/** 결정 추출이 왜 돌았는지. 수집 이벤트 `decisions_completed.trigger`에 싣는다 */
export type DecisionTrigger = 'auto' | 'manual' | 'reprocess'

interface RunDecisionsParams {
  meetingId: string
  trigger: DecisionTrigger
  onProgress: (progress: { stage: DecisionStage; percent: number }) => void
}

/**
 * 회의 하나의 결정 문서를 새로 만든다. 성공했을 때만 그 회의의 문서를 트랜잭션으로 교체한다 —
 * 실패하면 이전 문서가 그대로 남는다 (references/decisions.md "흐름"). 공급자는 잡이 시작할 때 한 번 읽는다.
 */
export const runDecisions = async ({ meetingId, trigger, onProgress }: RunDecisionsParams) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.errors.meetingNotFound)
  if (meeting.status !== 'done') throw new Error(t().decisions.extraction.meetingNotReady)

  const displayNames = Object.fromEntries(
    listSpeakers({ meetingId }).map(({ label, displayName }) => [label, displayName])
  )
  const lines = buildDecisionLines({ utterances: listUtterances({ meetingId }), displayNames })
  if (!lines.length) throw new Error(t().decisions.extraction.nothingToExtract)

  const client = await createLlmClient()
  const types = getDecisionTypes()
  const workDir = decisionsWorkDir({ meetingId })
  const startedAt = Date.now()
  await mkdir(workDir, { recursive: true })
  info(`회의 ${meetingId} 결정 추출 시작 (${client.provider}, 발화 ${lines.length}줄)`)

  try {
    const result = await extractDecisions({ client, lines, types, workDir, onProgress })
    const extractedAt = Date.now()
    const decisions = result.decisions.map((item, ord): Decision => ({
      id: randomUUID(),
      meetingId,
      ord,
      typeId: item.typeId,
      title: item.title,
      decision: item.decision,
      background: item.background,
      alternatives: item.alternatives,
      actionItems: item.actionItems,
      proposerLabels: item.proposerLabels,
      participantLabels: item.participantLabels,
      evidence: item.evidence,
      createdAt: extractedAt
    }))
    replaceDecisions({ meetingId, decisions, extractedAt })

    info(
      `회의 ${meetingId} 결정 추출 완료 (문서 ${decisions.length}개, 버림 ${result.droppedCount}개, 청크 ${result.chunkCount}개)`
    )
    track({
      name: 'decisions_completed',
      props: {
        meetingId,
        provider: client.provider,
        elapsedMs: extractedAt - startedAt,
        chunkCount: result.chunkCount,
        count: decisions.length,
        droppedCount: result.droppedCount,
        trigger
      }
    })
    // 결정 문서도 회의 내용이라 스냅샷을 다시 보낸다 (references/decisions.md "사용 정보 수집")
    trackMeetingSnapshot({ meetingId })
  } finally {
    // 회의록에서 다시 만들 수 있는 파생물이라 실패해도 남기지 않는다
    await rm(workDir, { recursive: true, force: true })
  }
}
