/**
 * 사용 정보 이벤트 카탈로그. 보내는 쪽(데스크탑)과 받는 쪽(수집 서버)이 같은 이름·모양을 쓴다
 * (.claude/skills/meeting-stt-dev/references/telemetry.md "수집 항목").
 *
 * props에는 이벤트 이름·수치·열거형 값만 싣는다. 발화·요약·화자 이름 같은 회의 내용은
 * 이벤트가 아니라 회의 스냅샷(`snapshot.ts`)으로 자체 서버에만 보낸다.
 */

export type TelemetryPropValue = string | number | boolean | null

export type TelemetryProps = Record<string, TelemetryPropValue>

/** 분류가 전송처를 정한다. error는 Sentry, 나머지는 PostHog로도 간다 (자체 서버는 전부) */
export type TelemetryCategory = 'usage' | 'performance' | 'error' | 'environment'

/** 설정·환경. 허용 목록으로만 만든다 — API 키·팀 토큰 같은 비밀값은 여기 들어올 자리가 없다 */
export interface EnvironmentProps {
  appVersion: string
  osVersion: string
  arch: string
  cpuModel: string
  cpuCount: number
  performanceCoreCount: number
  totalMemoryGb: number
  whisperModelId: string
  llmProvider: string
  locale: string
  theme: string
  isAudioKept: boolean
  isQuietProcessing: boolean
  isWidgetEnabled: boolean
  isAutoRefineExternal: boolean
  isSystemAudioCapture: boolean
  glossaryTermCount: number
}

export interface PipelineCompletedProps {
  meetingId: string
  audioSec: number
  totalMs: number
  /** 정규화·STT가 한 단계로 보고되고, 병렬이면 화자 분리 구간과 겹친다 */
  sttMs: number
  diarizeMs: number
  mergeMs: number
  saveMs: number
  whisperModelId: string
  isQuiet: boolean
  isReprocess: boolean
  speakerCountInput: number | null
  speakerCountResult: number
  utteranceCount: number
}

export interface TelemetryEventMap {
  app_started: { isFirstRun: boolean }
  environment: EnvironmentProps
  screen_viewed: { screen: string }
  recording_started: { isSystemAudio: boolean }
  recording_stopped: { meetingId: string; durationSec: number; speakerCount: number | null }
  recording_imported: { meetingId: string; durationSec: number }
  live_transcript_toggled: { isEnabled: boolean }
  system_audio_toggled: { isEnabled: boolean }
  pipeline_completed: PipelineCompletedProps
  summary_completed: {
    meetingId: string
    provider: string
    elapsedMs: number
    summaryChars: number
  }
  refine_completed: {
    meetingId: string
    provider: string
    mode: 'term' | 'sentence'
    elapsedMs: number
    changedCount: number
    pairCount: number
  }
  refine_reverted: { meetingId: string }
  decisions_completed: {
    meetingId: string
    provider: string
    elapsedMs: number
    chunkCount: number
    count: number
    droppedCount: number
    trigger: 'auto' | 'manual' | 'reprocess'
  }
  decision_opened: { decisionId: string; meetingId: string }
  decision_copied: { decisionId: string }
  decision_types_updated: { count: number }
  transcript_copied: { format: string; scope: 'all' | 'utterance' }
  summary_copied: Record<string, never>
  meeting_renamed: { meetingId: string }
  meeting_deleted: { meetingId: string }
  meeting_reprocessed: { meetingId: string; speakerCount: number | null }
  meeting_audio_exported: { meetingId: string }
  utterance_edited: { meetingId: string }
  utterance_reassigned: { meetingId: string }
  speaker_renamed: { meetingId: string }
  speakers_merged: { meetingId: string }
  setting_changed: { key: string }
  llm_provider_changed: { provider: string }
  glossary_updated: { termCount: number }
  recording_uploaded: { meetingId: string; bytes: number; elapsedMs: number }
  job_failed: { meetingId: string | null; job: string; stage: string; message: string }
  renderer_error: { message: string; source: string }
  render_process_gone: { reason: string; exitCode: number }
}

export type TelemetryEventName = keyof TelemetryEventMap

export const EVENT_CATEGORIES: Record<TelemetryEventName, TelemetryCategory> = {
  app_started: 'usage',
  environment: 'environment',
  screen_viewed: 'usage',
  recording_started: 'usage',
  recording_stopped: 'usage',
  recording_imported: 'usage',
  live_transcript_toggled: 'usage',
  system_audio_toggled: 'usage',
  pipeline_completed: 'performance',
  summary_completed: 'performance',
  refine_completed: 'performance',
  refine_reverted: 'usage',
  decisions_completed: 'performance',
  decision_opened: 'usage',
  decision_copied: 'usage',
  decision_types_updated: 'usage',
  transcript_copied: 'usage',
  summary_copied: 'usage',
  meeting_renamed: 'usage',
  meeting_deleted: 'usage',
  meeting_reprocessed: 'usage',
  meeting_audio_exported: 'usage',
  utterance_edited: 'usage',
  utterance_reassigned: 'usage',
  speaker_renamed: 'usage',
  speakers_merged: 'usage',
  setting_changed: 'usage',
  llm_provider_changed: 'usage',
  glossary_updated: 'usage',
  recording_uploaded: 'performance',
  job_failed: 'error',
  renderer_error: 'error',
  render_process_gone: 'error'
}

/**
 * renderer가 `telemetry:track`으로 보낼 수 있는 이벤트. 나머지는 main이 직접 만든다 —
 * 같은 동작을 두 프로세스가 따로 세지 않기 위해서다.
 */
export const RENDERER_EVENT_NAMES = [
  'screen_viewed',
  'transcript_copied',
  'summary_copied',
  'decision_opened',
  'decision_copied',
  'renderer_error'
] as const satisfies readonly TelemetryEventName[]

export type RendererEventName = (typeof RENDERER_EVENT_NAMES)[number]

export const isTelemetryEventName = (value: unknown): value is TelemetryEventName =>
  typeof value === 'string' && Object.hasOwn(EVENT_CATEGORIES, value)

export const isRendererEventName = (value: unknown): value is RendererEventName =>
  typeof value === 'string' && (RENDERER_EVENT_NAMES as readonly string[]).includes(value)
