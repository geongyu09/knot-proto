import type {
  DecisionProgressEvent,
  PipelineProgressEvent,
  RefineProgressEvent,
  SummaryProgressEvent
} from '@shared/ipc'
import type { DecisionStage, PipelineStage, RefineStage, SummaryStage } from '@shared/types'
import { discardRecording } from '../audio/recordings'
import {
  failDecisions,
  findAudioPath,
  findMeeting,
  markDecisionsPending,
  updateMeetingStatus,
  updateMeetingSummary
} from '../db/meetings'
import { getAppSettings, getLlmProvider } from '../db/settings'
import { saveTranscript } from '../db/transcript'
import { listUtterances } from '../db/utterances'
import { runDecisions, type DecisionTrigger } from '../decisions/run'
import { runGlossaryDraft } from '../glossary/draft'
import { error as logError, info, messageOf, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { autoRefineSkipReason, refineMeeting } from '../refine/job'
import { runSummary } from '../summary/run'
import { buildTranscriptText } from '../summary/transcript'
import { trackPipelineCompleted } from '../telemetry/pipeline'
import { createStageTimer } from '../telemetry/stageTimer'
import { track, trackMeetingSnapshot } from '../telemetry/track'
import { registerRecordingUpload } from '../telemetry/upload'
import { runPipeline } from './run'
import { t } from '../locale'

const DONE_PERCENT = 100

type MeetingJob =
  | { kind: 'pipeline' | 'summary' | 'refine'; meetingId: string }
  | { kind: 'decisions'; meetingId: string; trigger: DecisionTrigger }

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
let notifyDecisions: (event: DecisionProgressEvent) => void = () => {}
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

export const setDecisionProgressListener = (listener: (event: DecisionProgressEvent) => void) => {
  notifyDecisions = listener
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

interface ReportDecisionsParams extends Omit<DecisionProgressEvent, 'stage'> {
  stage: DecisionStage
}

const reportDecisions = ({ percent, ...rest }: ReportDecisionsParams) => {
  lastStages.set(rest.meetingId, `decisions:${rest.stage}`)
  notifyDecisions({ ...rest, percent: Math.round(percent) })
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
  await scheduleAfterTranscript({ meetingId, trigger: isReprocess ? 'reprocess' : 'auto' })
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

const refineAndReport = async (meetingId: string) => {
  await refineMeeting({
    meetingId,
    onProgress: ({ stage, percent }) => reportRefine({ meetingId, stage, percent })
  })
  reportRefine({ meetingId, stage: 'done', percent: DONE_PERCENT })
}

const extractMeetingDecisions = async ({
  meetingId,
  trigger
}: {
  meetingId: string
  trigger: DecisionTrigger
}) => {
  await runDecisions({
    meetingId,
    trigger,
    onProgress: ({ stage, percent }) => reportDecisions({ meetingId, stage, percent })
  })
  reportDecisions({ meetingId, stage: 'done', percent: DONE_PERCENT })
  notifyMeetingsChanged()
}

/** 자동 교정을 줄 세울지. 조건이 아니면 오류 대신 로그만 남긴다 — 회의마다 실패를 띄우지 않기 위해서다 */
const shouldAutoRefine = async ({ meetingId }: { meetingId: string }) => {
  try {
    const reason = await autoRefineSkipReason()
    if (!reason) return true

    info(`회의 ${meetingId} 자동 교정 건너뜀: ${reason}`)
  } catch (caught) {
    warn(`회의 ${meetingId} 자동 교정 건너뜀: LLM 상태 확인 실패 (${messageOf(caught)})`)
  }

  return false
}

/**
 * 회의록이 만들어진 뒤의 자동 흐름: (조건부) 교정 → 결정 추출 (references/decisions.md "흐름").
 * 조건 확인(await)을 먼저 끝내고 두 잡을 같은 동기 구간에서 연달아 넣는다 — FIFO라 교정이 먼저 끝나고,
 * 교정이 실패하거나 건너뛰어도 추출은 돈다. 회의록은 이미 done이라 여기서 실패해도 잡을 실패로 만들지 않는다.
 */
const scheduleAfterTranscript = async ({
  meetingId,
  trigger
}: {
  meetingId: string
  trigger: DecisionTrigger
}) => {
  const isRefining = await shouldAutoRefine({ meetingId })

  if (isRefining) enqueueRefineJob({ meetingId })
  enqueueDecisionsJob({ meetingId, trigger })
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
  // 추출 실패는 회의 status(파이프라인 소유)를 건드리지 않고 decision_state만 바꾼다 (references/decisions.md "흐름")
  if (kind === 'decisions') {
    logError(`회의 ${meetingId} 결정 추출 실패: ${message}`)
    failDecisions({ meetingId, message })
    reportDecisions({ meetingId, stage: 'error', percent: 0, errorMessage: message })
    notifyMeetingsChanged()
    trackMeetingSnapshot({ meetingId })
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

const runMeetingJob = (job: MeetingJob) => {
  const { kind, meetingId } = job
  if (kind === 'summary') return summarizeMeeting(meetingId)
  if (kind === 'refine') return refineAndReport(meetingId)
  if (job.kind === 'decisions') return extractMeetingDecisions({ meetingId, trigger: job.trigger })

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

/**
 * 결정 추출을 줄 세운다. 같은 회의의 추출이 이미 줄 서 있으면 두 번 넣지 않는다.
 * 줄 세우는 순간 pending으로 바꿔 결정 탭 "처리 중" 묶음에 바로 보이게 한다.
 */
export const enqueueDecisionsJob = ({
  meetingId,
  trigger
}: {
  meetingId: string
  trigger: DecisionTrigger
}) => {
  if (pending.some((job) => job.kind === 'decisions' && job.meetingId === meetingId)) return

  markDecisionsPending({ meetingId })
  reportDecisions({ meetingId, stage: 'queued', percent: 0 })
  notifyMeetingsChanged()
  enqueue({ kind: 'decisions', meetingId, trigger })
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
