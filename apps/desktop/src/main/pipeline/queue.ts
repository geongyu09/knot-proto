import type { PipelineProgressEvent, RefineProgressEvent, SummaryProgressEvent } from '@shared/ipc'
import { normalizeGlossaryTerms } from '@shared/glossary'
import { isLlmReady } from '@shared/llm'
import { applyRefinePairs } from '@shared/refine'
import type {
  PipelineStage,
  RefinePair,
  RefineSource,
  RefineStage,
  SummaryStage
} from '@shared/types'
import { discardRecording } from '../audio/recordings'
import {
  findAudioPath,
  findMeeting,
  updateMeetingStatus,
  updateMeetingSummary
} from '../db/meetings'
import { applyRefineResult } from '../db/refine'
import { getAppSettings, getGlossarySettings, getLlmProvider } from '../db/settings'
import { saveTranscript } from '../db/transcript'
import { listUtterances } from '../db/utterances'
import { runGlossaryDraft } from '../glossary/draft'
import { createLlmClient, getLlmStatus } from '../llm/provider'
import type { LlmClient } from '../llm/types'
import { error as logError, info, messageOf, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { runRefine } from '../refine/run'
import { runSentenceRefine } from '../refine/sentence'
import { runSummary } from '../summary/run'
import { buildTranscriptText } from '../summary/transcript'
import { trackPipelineCompleted } from '../telemetry/pipeline'
import { createStageTimer } from '../telemetry/stageTimer'
import { track, trackMeetingSnapshot } from '../telemetry/track'
import { registerRecordingUpload } from '../telemetry/upload'
import { runPipeline } from './run'
import { t } from '../locale'

const DONE_PERCENT = 100

type MeetingJob = { kind: 'pipeline' | 'summary' | 'refine'; meetingId: string }

/** 용어 초안은 회의에 묶이지 않고 결과를 invoke로 돌려줘야 해서, 성공·실패 처리를 `run`이 스스로 한다 */
type GlossaryJob = { kind: 'glossary'; run: () => Promise<void> }

/**
 * 파이프라인·요약·교정·용어 초안은 같은 CPU·GPU를 쓴다. 따로 큐를 두면 동시에 돌아 모두 느려지므로
 * 한 큐에서 동시성 1로 처리한다 (references/architecture.md).
 */
type Job = MeetingJob | GlossaryJob

let notifyPipeline: (event: PipelineProgressEvent) => void = () => {}
let notifySummary: (event: SummaryProgressEvent) => void = () => {}
let notifyRefine: (event: RefineProgressEvent) => void = () => {}
let pending: Job[] = []
let isRunning = false

/** main이 창을 만든 뒤 한 번 등록한다. 창이 없을 때 보내면 무시된다 */
export const setPipelineProgressListener = (listener: (event: PipelineProgressEvent) => void) => {
  notifyPipeline = listener
}

export const setSummaryProgressListener = (listener: (event: SummaryProgressEvent) => void) => {
  notifySummary = listener
}

export const setRefineProgressListener = (listener: (event: RefineProgressEvent) => void) => {
  notifyRefine = listener
}

/** 잡이 실패했을 때 어느 단계였는지 사용 정보에 싣기 위해 회의별 마지막 단계를 기억한다 */
const lastStages = new Map<string, string>()

const report = ({
  meetingId,
  stage,
  percent
}: {
  meetingId: string
  stage: PipelineStage
  percent: number
}) => {
  lastStages.set(meetingId, stage)
  notifyPipeline({ meetingId, stage, percent: Math.round(percent) })
}

interface ReportSummaryParams extends Omit<SummaryProgressEvent, 'stage'> {
  stage: SummaryStage
}

const reportSummary = ({ percent, ...rest }: ReportSummaryParams) => {
  lastStages.set(rest.meetingId, rest.stage)
  notifySummary({ ...rest, percent: Math.round(percent) })
}

interface ReportRefineParams extends Omit<RefineProgressEvent, 'stage'> {
  stage: RefineStage
}

const reportRefine = ({ percent, ...rest }: ReportRefineParams) => {
  lastStages.set(rest.meetingId, rest.stage)
  notifyRefine({ ...rest, percent: Math.round(percent) })
}

/**
 * 회의록이 만들어졌으면 원본 WAV는 기본적으로 지운다 (설정 `audio.keep`, references/architecture.md).
 * 이 브랜치에서는 녹음 업로드가 끝날 때까지 지우지 않고, 업로드가 끝나면 업로드 워커가 지운다
 * (references/telemetry.md "수집 항목").
 * 여기서 실패해도 회의록은 이미 저장됐으므로 잡을 실패로 만들지 않는다.
 */
const applyAudioRetention = async ({
  meetingId,
  audioPath
}: {
  meetingId: string
  audioPath: string
}) => {
  if (await registerRecordingUpload({ meetingId, audioPath })) return
  if (getAppSettings().isAudioKept) return

  try {
    await discardRecording({ meetingId })
  } catch (caught) {
    warn(`회의 ${meetingId} 원본 녹음 삭제 실패: ${messageOf(caught)}`)
  }
}

const processMeeting = async (meetingId: string) => {
  const audioPath = findAudioPath({ meetingId })
  if (!audioPath) throw new Error(t().main.pipeline.audioFileMissing)

  const isReprocess = listUtterances({ meetingId }).length > 0
  // 잡이 시작할 때 한 번 읽는다. 진행 중인 잡의 스레드는 바꿀 수 없다
  const isQuiet = getAppSettings().isQuietProcessing
  const speakerCount = findMeeting({ meetingId })?.speakerCount
  const timer = createStageTimer()
  const startedAt = Date.now()
  const reportTimed = ({ stage, percent }: { stage: PipelineStage; percent: number }) => {
    timer.mark({ stage, percent })
    report({ meetingId, stage, percent })
  }

  updateMeetingStatus({ meetingId, status: 'processing' })
  notifyMeetingsChanged()
  const utterances = await runPipeline({
    audioPath,
    speakerCount,
    isQuiet,
    onProgress: reportTimed
  })

  reportTimed({ stage: 'save', percent: 0 })
  saveTranscript({ meetingId, utterances })
  updateMeetingStatus({ meetingId, status: 'done' })
  reportTimed({ stage: 'done', percent: DONE_PERCENT })
  notifyMeetingsChanged()
  info(`회의 ${meetingId} 처리 완료 (발화 ${utterances.length}개)`)

  trackPipelineCompleted({
    meetingId,
    startedAt,
    durations: timer.durations(),
    isQuiet,
    isReprocess,
    speakerCount,
    utterances
  })
  trackMeetingSnapshot({ meetingId })

  await applyAudioRetention({ meetingId, audioPath })
  await scheduleAutoRefine({ meetingId })
}

const summarizeMeeting = async (meetingId: string) => {
  const transcript = buildTranscriptText({ meetingId })
  if (!transcript.trim()) throw new Error(t().main.summary.nothingToSummarize)

  const startedAt = Date.now()
  const summary = await runSummary({
    meetingId,
    transcript,
    onProgress: ({ stage, percent }) => reportSummary({ meetingId, stage, percent })
  })

  updateMeetingSummary({ meetingId, summary })
  reportSummary({ meetingId, stage: 'done', percent: DONE_PERCENT, summary })
  info(`회의 ${meetingId} 요약 완료 (${summary.length}자)`)
  track({
    name: 'summary_completed',
    props: {
      meetingId,
      provider: getLlmProvider(),
      elapsedMs: Date.now() - startedAt,
      summaryChars: summary.length
    }
  })
  trackMeetingSnapshot({ meetingId })
}

const globalGlossary = () => normalizeGlossaryTerms(getGlossarySettings().terms)

interface RefineRunParams {
  client: LlmClient
  meetingId: string
  sources: RefineSource[]
  glossary: string[]
}

/** 로컬의 용어 교정. 코드 후보 + O/X 판정으로 쌍을 얻고, 본문에 실제로 들어간 쌍만 남긴다 */
const runTermRefine = async ({ client, meetingId, sources, glossary }: RefineRunParams) => {
  if (!glossary.length) throw new Error(t().main.refine.glossaryEmpty)

  const pairs = await runRefine({
    client,
    meetingId,
    sources,
    glossary,
    onProgress: ({ stage, percent }) => reportRefine({ meetingId, stage, percent })
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
const refineMeeting = async (meetingId: string) => {
  const sources = listUtterances({ meetingId }).map(({ id, text }) => ({ id, text }))
  if (!sources.length) throw new Error(t().main.refine.nothingToRefine)

  const startedAt = Date.now()
  const client = await createLlmClient()
  const params = { client, meetingId, sources, glossary: globalGlossary() }
  const { texts, pairs } =
    client.provider === 'local'
      ? await runTermRefine(params)
      : await runSentenceRefine({
          ...params,
          onProgress: ({ stage, percent }) => reportRefine({ meetingId, stage, percent })
        })

  applyRefineResult({ meetingId, texts, appliedPairs: pairs, refinedAt: Date.now() })
  reportRefine({ meetingId, stage: 'done', percent: DONE_PERCENT })
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
const autoRefineSkipReason = async () => {
  const status = await getLlmStatus()
  if (!isLlmReady(status)) return 'LLM이 준비되지 않음'
  if (status.provider === 'local')
    return globalGlossary().length ? null : '전역 용어 사전이 비어 있음'

  // 외부 공급자는 회의록이 그 회사 서버로 전송되므로 사용자가 켰을 때만 자동으로 돈다
  return getAppSettings().isAutoRefineExternal ? null : '외부 공급자 자동 교정이 꺼져 있음'
}

/**
 * 파이프라인 뒤의 자동 교정. 조건이 아니면 오류 대신 로그만 남기고 건너뛴다 —
 * 회의마다 실패를 띄우지 않기 위해서다 (references/architecture.md "회의록 교정").
 */
const scheduleAutoRefine = async ({ meetingId }: { meetingId: string }) => {
  // 회의록은 이미 done으로 저장됐다. 여기서 실패해도 잡을 실패로 만들지 않는다 (applyAudioRetention과 같은 규칙)
  try {
    const reason = await autoRefineSkipReason()
    if (reason) {
      info(`회의 ${meetingId} 자동 교정 건너뜀: ${reason}`)
      return
    }
  } catch (caught) {
    warn(`회의 ${meetingId} 자동 교정 건너뜀: LLM 상태 확인 실패 (${messageOf(caught)})`)
    return
  }

  enqueueRefineJob({ meetingId })
}

/**
 * 요약·교정 실패는 회의 상태를 건드리지 않는다 — 회의록은 멀쩡하고 결과만 없는 상태다
 * (references/architecture.md).
 */
const failJob = ({ kind, meetingId }: MeetingJob, message: string) => {
  track({
    name: 'job_failed',
    props: { meetingId, job: kind, stage: lastStages.get(meetingId) ?? 'unknown', message }
  })

  if (kind === 'summary') {
    logError(`회의 ${meetingId} 요약 실패: ${message}`)
    reportSummary({ meetingId, stage: 'error', percent: 0, errorMessage: message })
    return
  }
  if (kind === 'refine') {
    logError(`회의 ${meetingId} 교정 실패: ${message}`)
    reportRefine({ meetingId, stage: 'error', percent: 0, errorMessage: message })
    return
  }

  logError(`회의 ${meetingId} 처리 실패: ${message}`)
  updateMeetingStatus({ meetingId, status: 'error', errorMessage: message })
  report({ meetingId, stage: 'error', percent: 0 })
  notifyMeetingsChanged()
  trackMeetingSnapshot({ meetingId })
  // 실패한 녹음도 원인 분석용으로 올린다. 원본은 재시도용으로 어차피 남는다
  const audioPath = findAudioPath({ meetingId })
  if (audioPath) void registerRecordingUpload({ meetingId, audioPath })
}

const runMeetingJob = ({ kind, meetingId }: MeetingJob) => {
  if (kind === 'summary') return summarizeMeeting(meetingId)
  if (kind === 'refine') return refineMeeting(meetingId)

  return processMeeting(meetingId)
}

const drain = async () => {
  if (isRunning) return
  isRunning = true

  while (pending.length) {
    const [job, ...rest] = pending
    pending = rest

    if (job.kind === 'glossary') {
      await job.run()
      continue
    }

    try {
      await runMeetingJob(job)
      lastStages.delete(job.meetingId)
    } catch (caught) {
      failJob(job, messageOf(caught))
      lastStages.delete(job.meetingId)
    }
  }

  isRunning = false
}

const enqueue = (job: Job) => {
  pending = [...pending, job]
  void drain()
}

/** 동시성 1. 여러 회의를 동시에 돌리지 않는다 (references/pitfalls.md) */
export const enqueuePipelineJob = ({ meetingId }: { meetingId: string }) =>
  enqueue({ kind: 'pipeline', meetingId })

/** 같은 회의의 요약이 이미 줄 서 있으면 두 번 돌리지 않는다 */
export const enqueueSummaryJob = ({ meetingId }: { meetingId: string }) => {
  if (pending.some((job) => job.kind === 'summary' && job.meetingId === meetingId)) return

  enqueue({ kind: 'summary', meetingId })
}

/** 같은 회의의 교정이 이미 줄 서 있으면 두 번 돌리지 않는다 */
export const enqueueRefineJob = ({ meetingId }: { meetingId: string }) => {
  if (pending.some((job) => job.kind === 'refine' && job.meetingId === meetingId)) return

  enqueue({ kind: 'refine', meetingId })
}

/** 초안이 끝나면 풀리는 Promise. 앞선 회의 처리가 있으면 그 뒤에 돈다 */
export const enqueueGlossaryDraft = ({ teamDescription }: { teamDescription: string }) =>
  new Promise<string[]>((resolve, reject) => {
    enqueue({
      kind: 'glossary',
      run: () =>
        runGlossaryDraft({ teamDescription }).then(resolve, (caught: unknown) => {
          logError(`용어 초안 실패: ${messageOf(caught)}`)
          reject(caught)
        })
    })
  })
