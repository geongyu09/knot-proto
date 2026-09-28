import type {
  AppSettings,
  Decision,
  DecisionListItem,
  DecisionStage,
  DecisionType,
  GlossarySettings,
  LlmApiVendor,
  LlmProvider,
  LlmStatus,
  OpenaiModelId,
  Meeting,
  MeetingDetail,
  ModelKey,
  PipelineStage,
  RefineStage,
  SummaryStage,
  WhisperModelId
} from './types'
import type { RendererEventName, TelemetryEventMap } from '@meeting-stt/telemetry/events'

/**
 * IPC 채널과 payload 타입의 단일 정의. main·preload·renderer가 모두 이 파일을 import한다.
 * 채널은 그 Phase에서 실제로 쓰는 것만 둔다 (.claude/rules/ipc-api-guide.md).
 */
export const IPC = {
  recording: {
    requestPermission: 'recording:requestPermission',
    start: 'recording:start',
    chunk: 'recording:chunk',
    stop: 'recording:stop',
    state: 'recording:state',
    control: 'recording:control',
    setSpeakerCount: 'recording:setSpeakerCount',
    reportError: 'recording:reportError',
    setLiveTranscript: 'recording:setLiveTranscript',
    setSystemAudio: 'recording:setSystemAudio',
    setPaused: 'recording:setPaused'
  },
  shortcuts: { setSuspended: 'shortcuts:setSuspended' },
  meetings: {
    list: 'meetings:list',
    get: 'meetings:get',
    rename: 'meetings:rename',
    delete: 'meetings:delete',
    search: 'meetings:search',
    reprocess: 'meetings:reprocess',
    exportAudio: 'meetings:exportAudio',
    import: 'meetings:import'
  },
  utterances: {
    updateText: 'utterances:updateText',
    reassign: 'utterances:reassign',
    revertRefine: 'utterances:revertRefine'
  },
  speakers: { rename: 'speakers:rename', merge: 'speakers:merge' },
  settings: { get: 'settings:get', update: 'settings:update' },
  clipboard: { writeText: 'clipboard:writeText' },
  summary: { create: 'summary:create' },
  glossary: { get: 'glossary:get', update: 'glossary:update', draft: 'glossary:draft' },
  refine: { run: 'refine:run' },
  // 결정 문서 (test/usage-analytics 브랜치, references/decisions.md "IPC")
  decisions: {
    list: 'decisions:list',
    get: 'decisions:get',
    ofMeeting: 'decisions:ofMeeting',
    extract: 'decisions:extract',
    search: 'decisions:search'
  },
  decisionTypes: { get: 'decisionTypes:get', update: 'decisionTypes:update' },
  llm: {
    status: 'llm:status',
    setProvider: 'llm:setProvider',
    setApiKey: 'llm:setApiKey',
    setOpenaiModel: 'llm:setOpenaiModel',
    check: 'llm:check'
  },
  models: {
    status: 'models:status',
    download: 'models:download',
    downloadSummary: 'models:downloadSummary'
  },
  update: { check: 'update:check', download: 'update:download', install: 'update:install' },
  // 사용 정보 수집 (test/usage-analytics 브랜치 전용, references/telemetry.md)
  telemetry: { track: 'telemetry:track' },
  events: {
    progress: 'pipeline:progress',
    summary: 'summary:progress',
    refine: 'refine:progress',
    decisions: 'decisions:progress',
    modelDownload: 'models:downloadProgress',
    // 녹음 호스트 창은 앱 시작 때 모델 상태를 읽고 언마운트되지 않는다. 다운로드 뒤 다시 읽게 알린다 (references/distribution.md 3절)
    modelsChanged: 'models:changed',
    updateAvailable: 'update:available',
    // 조회 채널과 이름이 겹칠 수 없어 이벤트 쪽에 Changed를 붙인다 (references/architecture.md IPC 규약)
    recordingState: 'recording:stateChanged',
    meetingsChanged: 'meetings:changed',
    recordingCommand: 'recording:command',
    // 설정 화면이 바꾼 값을 녹음 호스트 창도 알아야 한다 (UI 언어). payload는 저장된 설정 전체다
    settingsChanged: 'settings:changed'
  }
} as const

/**
 * renderer가 보내는 사용 정보 이벤트. main이 이름 허용 목록과 props 모양을 다시 거른다
 * (references/telemetry.md "싱크별 규칙").
 */
export type TrackTelemetryRequest = {
  [Name in RendererEventName]: { name: Name; props: TelemetryEventMap[Name] }
}[RendererEventName]

export interface RequestMicrophonePermissionResponse {
  isGranted: boolean
}

export interface StartRecordingRequest {
  /** renderer의 AudioContext가 실제로 쓰는 샘플레이트. 16kHz가 아니면 main이 거절한다 */
  sampleRate: number
}
export interface StartRecordingResponse {
  meetingId: string
}

export interface SendRecordingChunkRequest {
  meetingId: string
  /** AudioWorklet이 넘긴 Float32 PCM 원본. main이 Int16으로 바꿔 파일에 append한다 */
  pcm: ArrayBuffer
}

/**
 * 참석자 수는 싣지 않는다 — main의 녹음 세션이 단일 출처이고 `recording:setSpeakerCount`로만 바뀐다.
 * 두 경로가 생기면 "어느 쪽 값이 이겼는지"를 따져야 한다 (references/architecture.md).
 */
export interface StopRecordingRequest {
  meetingId: string
}
export type StopRecordingResponse = Meeting

/**
 * 진행 중 녹음의 단일 출처. 녹음 호스트 창·메인 창·메뉴바가 같은 값을 본다 (references/architecture.md).
 * 조회는 `recording:state`, push는 `recording:stateChanged`로 같은 모양을 쓴다.
 */
export interface RecordingStateEvent {
  meetingId: string | null
  /**
   * 경과 시간의 기준 시각(epoch ms) = 실제 시작 시각 + 지금까지 일시정지한 시간.
   * 받는 쪽이 `(pausedAt ?? Date.now()) - startedAt`으로 계산한다 — 창마다 값이 어긋나지 않는다
   */
  startedAt: number | null
  /** 일시정지한 시각(epoch ms). 녹음 중이 아니거나 일시정지하지 않았으면 null */
  pausedAt: number | null
  /** 직전 청크의 RMS (0~1). 청크 주기(약 0.5초)로만 갱신된다 */
  level: number
  /** 세션에 보관 중인 참석자 수. 두 창의 입력란을 같은 값으로 맞춘다 */
  speakerCount?: number
  /** 정지가 끝난 순간 한 번만 실린다. 메인 창이 이 회의의 상세로 이동한다 */
  stoppedMeetingId?: string
  /** 시작·정지가 실패한 순간 한 번만 실린다. 녹음 호스트 창에서만 알 수 있는 실패를 메인 창이 보여준다 */
  errorMessage?: string
  /** 녹음 화면의 라이브 받아쓰기 보기. 저장되지 않는 미리보기다 (references/architecture.md "라이브 받아쓰기") */
  liveTranscript: LiveTranscriptState
  /** 온라인 회의 소리(스피커 출력) 함께 녹음 (Phase 5-2, references/architecture.md "시스템 오디오 캡처") */
  systemAudio: SystemAudioState
}

export interface SystemAudioState {
  /** 스피커로 나가는 소리를 마이크와 섞어 녹음할지. 녹음 중에 바꾸면 다음 녹음부터 적용된다 */
  isEnabled: boolean
  /** 켜기(프로브)가 실패했거나 녹음 중 캡처가 끊겼을 때만 실린다. 녹음은 마이크만으로 계속된다 */
  errorMessage?: string
}

/** 온라인 회의 소리 함께 녹음 켜기/끄기. 켜면 main이 도구를 잠깐 돌려 권한 창을 띄운다. 응답은 바뀐 녹음 상태다 */
export interface SetSystemAudioRequest {
  isEnabled: boolean
}
export type GetRecordingStateResponse = RecordingStateEvent

export interface LiveTranscriptLine {
  /** 녹음 안에서 1부터 늘어나는 번호. 리스트 key로 쓴다 (DB 행이 아니다) */
  id: number
  text: string
}

export interface LiveTranscriptState {
  /** 파형 대신 라이브 받아쓰기를 보여 주는지. 꺼져 있으면 main이 인식을 돌리지 않는다 */
  isEnabled: boolean
  /** 확정된 문장. 최근 것만 싣는다 */
  lines: LiveTranscriptLine[]
  /** 아직 말하는 중인 구간의 인식 결과. 다음 실행에서 바뀔 수 있다 */
  partial: string
  /** 인식이 실패하는 동안만 실린다. 녹음은 계속된다 */
  errorMessage?: string
}

/** 파형 ↔ 라이브 받아쓰기 보기 전환. 응답은 바뀐 녹음 상태다 */
export interface SetLiveTranscriptRequest {
  isEnabled: boolean
}

/** 녹음 일시정지·재개. 일시정지 동안 들어온 청크는 main이 버린다. 응답은 바뀐 녹음 상태다 */
export interface SetRecordingPausedRequest {
  isPaused: boolean
}

/** 메인 창·Tray·전역 단축키가 보내는 요청. main이 녹음 호스트 창에 `recording:command`로 넘긴다 */
export interface ControlRecordingRequest {
  kind: 'start' | 'stop' | 'toggle'
}
export type RecordingCommandEvent = ControlRecordingRequest

/** 비우면(undefined) 임계값 폴백으로 돌아간다 */
export interface SetSpeakerCountRequest {
  speakerCount?: number
}

/** 마이크 권한 거부처럼 녹음 호스트 창에서만 일어나는 실패를 세션에 모은다 */
export interface ReportRecordingErrorRequest {
  message: string
}

/** 설정 화면에서 새 단축키를 입력받는 동안 전역 단축키를 해제한다 */
export interface SetShortcutsSuspendedRequest {
  isSuspended: boolean
}

export type GetMeetingsResponse = Meeting[]

/** 회의 제목·발화 텍스트 부분 일치 검색 (references/architecture.md "회의록 검색") */
export interface SearchMeetingsRequest {
  query: string
}

export interface MeetingSearchResult {
  meeting: Meeting
  /** 발화로 걸렸을 때 순서가 가장 앞선 발화 하나. 제목으로만 걸리면 null */
  match: { utteranceId: string; text: string; startSec: number } | null
}
/** 최신순, 최대 50개. 공백뿐인 질의는 빈 배열 */
export type SearchMeetingsResponse = MeetingSearchResult[]

export interface GetMeetingRequest {
  meetingId: string
}
export type GetMeetingResponse = MeetingDetail | null

/**
 * 회의 상세를 바꾸는 채널은 모두 갱신된 상세를 그대로 돌려준다 (references/architecture.md).
 * 여러 행이 한꺼번에 바뀌는 화자 병합·재배정도 응답 하나로 renderer 상태를 맞출 수 있다.
 */
export type MutateMeetingResponse = MeetingDetail

export interface RenameMeetingRequest {
  meetingId: string
  title: string
}

export interface DeleteMeetingRequest {
  meetingId: string
}

/**
 * 남아 있는 원본 WAV로 회의록을 처음부터 다시 만든다. 잡을 예약하고 `status='processing'`인 상세를 바로 돌려준다.
 * 성공하면 발화·화자(이름 포함)·교정 결과를 새로 만들고 요약은 남긴다 (references/architecture.md "녹음본 재생·내보내기·다시 인식").
 */
export interface ReprocessMeetingRequest {
  meetingId: string
  /** 화자 분리에 쓸 참석자 수. null이면 임계값 폴백 */
  speakerCount: number | null
}

export interface ExportMeetingAudioRequest {
  meetingId: string
}
/** 저장 위치 대화상자를 사용자가 취소하면 false. 취소는 오류가 아니다 */
export interface ExportMeetingAudioResponse {
  isSaved: boolean
}

/**
 * 앱 밖에서 녹음한 파일을 가져와 회의를 만든다. 요청 payload는 없다 — 파일은 main의 열기 대화상자로 고른다.
 * 사용자가 대화상자를 취소하면 meeting이 null이고 오류가 아니다 (references/architecture.md "녹음 파일 가져오기").
 */
export interface ImportMeetingAudioResponse {
  meeting: Meeting | null
}

/** 재생용 원본 WAV 주소. main의 커스텀 프로토콜이 회의 ID로 파일을 찾아 Range 요청에 응답한다 */
export const MEETING_AUDIO_SCHEME = 'meeting-audio'
export const MEETING_AUDIO_HOST = 'recording'

/** `<audio src>`에 넣을 회의 하나의 재생 주소 */
export const meetingAudioUrl = (meetingId: string) =>
  `${MEETING_AUDIO_SCHEME}://${MEETING_AUDIO_HOST}/${encodeURIComponent(meetingId)}`

export interface UpdateUtteranceTextRequest {
  meetingId: string
  utteranceId: string
  text: string
}

export interface ReassignUtteranceRequest {
  meetingId: string
  utteranceId: string
  /** 같은 회의의 speakers에 있는 라벨이어야 한다 */
  speakerLabel: string
}

/** 교정된 발화를 교정 전 원문으로 되돌린다. 원문이 없는 발화면 거절한다 */
export interface RevertUtteranceRefineRequest {
  meetingId: string
  utteranceId: string
}

export interface RenameSpeakerRequest {
  meetingId: string
  label: string
  displayName: string
}

export interface MergeSpeakersRequest {
  meetingId: string
  /** 사라지는 화자 */
  fromLabel: string
  /** 발화를 넘겨받는 화자 */
  intoLabel: string
}

export type GetSettingsResponse = AppSettings
export type UpdateSettingsRequest = AppSettings
export type UpdateSettingsResponse = AppSettings
/** `settings:update`가 저장을 마친 뒤 모든 창에 push한다 (references/architecture.md "UI 언어") */
export type SettingsChangedEvent = AppSettings

export type GetGlossaryResponse = GlossarySettings
export type UpdateGlossaryRequest = GlossarySettings
/** 공백·빈 줄·중복 용어를 정리해 저장한 값 */
export type UpdateGlossaryResponse = GlossarySettings

/**
 * 초안은 10~20초로 짧아 invoke로 결과를 기다린다. 요약과 같은 큐에서 돌아 회의 처리 중이면 그 뒤에 풀린다.
 * 저장하지 않는다 — 사용자가 고친 뒤 `glossary:update`로 저장한다 (references/architecture.md "용어 사전").
 */
export interface DraftGlossaryRequest {
  teamDescription: string
}
export interface DraftGlossaryResponse {
  terms: string[]
}

export type GetLlmStatusResponse = LlmStatus

/** 공급자 저장. 갱신된 상태를 돌려준다 (references/architecture.md "LLM 공급자") */
export interface SetLlmProviderRequest {
  provider: LlmProvider
}
export type SetLlmProviderResponse = LlmStatus

/** 회사별 키 저장. `null`이면 저장된 키를 지운다. 키는 main이 암호화해 저장하고 renderer로 되돌려주지 않는다 */
export interface SetLlmApiKeyRequest {
  vendor: LlmApiVendor
  apiKey: string | null
}
export type SetLlmApiKeyResponse = LlmStatus

/** `openai-api`가 부를 GPT 모델 저장. 갱신된 상태를 돌려준다 */
export interface SetOpenaiModelRequest {
  model: OpenaiModelId
}
export type SetOpenaiModelResponse = LlmStatus

/** 현재 공급자로 짧은 프롬프트 한 번. 실패는 reject(한국어 메시지)로 알린다 */
export interface CheckLlmResponse {
  message: string
}

export interface WriteClipboardTextRequest {
  text: string
}

export interface PipelineProgressEvent {
  meetingId: string
  stage: PipelineStage
  /** 그 단계 안에서의 퍼센트. 전체 진행률 합산은 renderer가 @shared/progress로 한다 */
  percent: number
}

/**
 * 요약은 수 분이 걸려 invoke를 매달아 둘 수 없다. 이 채널은 값을 바꾸는 게 아니라
 * 잡을 예약하고 즉시 반환하며, 결과는 `summary:progress`로 온다 (references/architecture.md).
 */
export interface CreateSummaryRequest {
  meetingId: string
}

export interface SummaryProgressEvent {
  meetingId: string
  stage: SummaryStage
  percent: number
  /** stage가 'done'일 때만. renderer가 다시 조회하지 않도록 결과를 함께 보낸다 */
  summary?: string
  /** stage가 'error'일 때만. 사용자에게 보여줄 한국어 안내 */
  errorMessage?: string
}

/**
 * 교정은 파이프라인이 끝나면 자동으로 돌지만, 용어 사전을 고친 뒤 다시 돌릴 때는 이 채널로 예약한다.
 * 요약처럼 큐에 넣고 즉시 반환한다 (references/architecture.md "회의록 교정").
 */
export interface RunRefineRequest {
  meetingId: string
}

export interface RefineProgressEvent {
  meetingId: string
  stage: RefineStage
  percent: number
  /** stage가 'error'일 때만. 사용자에게 보여줄 한국어 안내 */
  errorMessage?: string
}

/** 온보딩·설정 화면이 그리는 모델 하나의 설치 상태 (references/distribution.md 3절) */
export interface ModelStatusItem {
  key: ModelKey
  label: string
  isInstalled: boolean
  sizeBytes: number
  /** false면 요약 모델. 온보딩 준비 여부(isReady)에 들어가지 않는다 */
  isRequired: boolean
}

/** 사용자가 고를 수 있는 음성 인식 모델 하나. 레지스트리는 main에만 있으므로 renderer는 이 응답으로만 안다 */
export interface WhisperModelChoice {
  id: WhisperModelId
  label: string
  description: string
  sizeBytes: number
}

export interface ModelStatusResponse {
  /** 필수 모델이 전부 있어 온보딩을 건너뛰어도 되는지 */
  isReady: boolean
  isSummaryReady: boolean
  selectedWhisperModelId: WhisperModelId
  recommendedWhisperModelId: WhisperModelId
  whisperOptions: WhisperModelChoice[]
  items: ModelStatusItem[]
}

export interface DownloadModelsRequest {
  whisperModelId: WhisperModelId
}
/** 다운로드가 끝난 뒤의 상태. 진행 중 퍼센트는 `models:downloadProgress`로 온다 */
export type DownloadModelsResponse = ModelStatusResponse

export interface ModelDownloadProgressEvent {
  key: ModelKey
  receivedBytes: number
  totalBytes: number
  percent: number
}

/** 설정에서 직접 누른 업데이트 확인 결과. 새 버전이 없으면 `availableVersion`은 null */
export interface CheckUpdateResponse {
  currentVersion: string
  availableVersion: string | null
}

/** 새 버전을 발견했을 때 한 번 보낸다. 내려받기는 사용자가 `update:download`로 요청한다 */
export interface UpdateAvailableEvent {
  version: string
}

/** 사이드 패널 결정 탭용. 회의 최신순 → 회의 안 순서 (references/decisions.md "사이드 패널") */
export type GetDecisionsResponse = DecisionListItem[]

export interface GetDecisionRequest {
  decisionId: string
}
/** 문서 하나와 출처 회의. 원문 패널은 `meetings:get`으로 따로 읽는다. 없으면 null */
export type GetDecisionResponse = { decision: Decision; meeting: Meeting } | null

export interface GetMeetingDecisionsRequest {
  meetingId: string
}
export type GetMeetingDecisionsResponse = DecisionListItem[]

/**
 * 그 회의의 결정 문서를 전부 새로 만든다. 요약처럼 큐에 넣고 즉시 반환하며, 진행은 `decisions:progress`,
 * 목록 갱신은 `meetings:changed`로 온다 (references/decisions.md "IPC").
 */
export interface ExtractDecisionsRequest {
  meetingId: string
}

/** 결정 문서 제목·결정 내용·배경 부분 일치 검색. 공백뿐인 질의는 빈 배열 */
export interface SearchDecisionsRequest {
  query: string
}
export type SearchDecisionsResponse = DecisionListItem[]

export type GetDecisionTypesResponse = DecisionType[]
/** 새 타입은 id를 빈 문자열로 보내면 main이 uuid를 붙인다 */
export interface UpdateDecisionTypesRequest {
  types: DecisionType[]
}
export type UpdateDecisionTypesResponse = DecisionType[]

export interface DecisionProgressEvent {
  meetingId: string
  stage: DecisionStage
  percent: number
  /** stage가 'error'일 때만. 사용자에게 보여줄 한국어 안내 */
  errorMessage?: string
}
