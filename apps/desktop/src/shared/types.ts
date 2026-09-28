/**
 * 이 앱의 제품 타입. 파이프라인 중간 산출물 타입은 두 앱이 공유하므로
 * `@meeting-stt/core/types`에 있고, 모델 종류는 `@meeting-stt/models/desktop`에 있다.
 * 기존 import 경로(`@shared/types`)를 유지하려고 여기서 함께 재노출한다.
 */

import type { MergedUtterance } from '@meeting-stt/core/types'
import type { Locale } from './i18n'

export type { Locale }
export type {
  MergedUtterance,
  SpeakerPiece,
  SpeakerSegment,
  SttSegment,
  SttWord
} from '@meeting-stt/core/types'
export type { ModelKey, WhisperModelId } from '@meeting-stt/models/desktop'

export type MeetingStatus = 'recording' | 'processing' | 'done' | 'error'

export interface Meeting {
  id: string
  title: string
  createdAt: number
  durationSec: number
  status: MeetingStatus
  errorMessage?: string
  summary?: string
  /** 녹음 정지 시 입력한 참석자 수. 없으면 임계값 폴백으로 화자를 나눈 회의다 (references/data-model.md) */
  speakerCount?: number
  /** 원본 WAV가 남아 있는지. 재생·내보내기·다시 인식은 이 값이 true일 때만 할 수 있다 (references/architecture.md) */
  hasAudio: boolean
}

export interface Utterance extends MergedUtterance {
  id: string
  meetingId: string
  /** 자동 교정이 처음 바꾸기 전 원문. null이면 교정으로 바뀐 적 없음 (references/data-model.md) */
  originalText: string | null
}

export interface Speaker {
  meetingId: string
  label: string
  displayName: string | null
}

/**
 * 녹음에 쓸 마이크 (references/architecture.md "마이크 입력 장치와 테스트").
 * `deviceId`는 Chromium의 origin별 해시라 사람이 읽을 수 없어, 장치를 뺀 뒤에도 보여줄 `label`을 함께 둔다.
 */
export interface AudioInputDevice {
  deviceId: string
  label: string
}

/** 사용자 설정. main의 settings 테이블에 키별 JSON으로 저장한다 (references/data-model.md) */
export interface AppSettings {
  /** 파이프라인이 성공한 뒤 원본 WAV를 남길지. 기본은 삭제(false) */
  isAudioKept: boolean
  /** 앱 시작 시 새 버전을 확인할지. 기본은 꺼짐 — 네트워크는 모델 다운로드 한 번뿐이라는 약속 때문이다 */
  isUpdateCheckEnabled: boolean
  /** 조용히 처리. 켜면 화자 분리 스레드를 줄이고 STT와 순차로 돌려 느린 대신 발열·팬 소음을 줄인다. 기본은 꺼짐 */
  isQuietProcessing: boolean
  /** 녹음 토글 전역 단축키 (Electron accelerator, `src/shared/shortcut.ts`) */
  recordingShortcut: string
  /** 녹음에 쓸 마이크. null이면 시스템 기본 마이크. 장치가 빠져 있으면 녹음은 기본 마이크로 폴백한다 */
  inputDevice: AudioInputDevice | null
  /** UI 언어 (기본 'ko'). 인식·요약 언어가 아니라 화면·메뉴바·오류 문구의 언어다 (`src/shared/i18n.ts`) */
  locale: Locale
  /**
   * 외부 LLM 공급자일 때 회의록이 만들어지면 자동으로 문장 교정할지. 기본은 꺼짐 —
   * 켜면 회의가 끝날 때마다 회의록이 그 회사 서버로 전송된다 (references/architecture.md "회의록 교정")
   */
  isAutoRefineExternal: boolean
}

/**
 * 전역 용어 사전 (Phase 5-4). `AppSettings`와 따로 `glossary:get`/`glossary:update`로 오간다 (references/data-model.md).
 * 용어 한 줄은 `용어` 또는 `영어 표기 = 읽기1, 읽기2` 형식이다.
 */
export interface GlossarySettings {
  /** 초안 생성의 입력이 되는 팀 소개 */
  teamDescription: string
  terms: string[]
}

/**
 * 요약·용어 초안이 쓰는 LLM 공급자 (references/architecture.md "LLM 공급자").
 * 'local'은 llama.cpp, 나머지는 사용자의 Claude API 키·Claude Code CLI(구독)·OpenAI API 키다.
 */
export type LlmProvider = 'local' | 'claude-api' | 'claude-cli' | 'openai-api'

/** API 키를 저장하는 단위. 공급자가 아니라 회사별이라 공급자를 오가도 키를 다시 넣지 않는다 */
export type LlmApiVendor = 'anthropic' | 'openai'

/** `openai-api`가 부르는 GPT 모델. 목록은 `src/shared/llm.ts`의 OPENAI_MODEL_IDS, 라벨은 사전 `llm.openaiModels` */
export type OpenaiModelId = 'gpt-6-astra' | 'gpt-6-sol' | 'gpt-6-luna'

/** 저장된 키의 유무와 마지막 4자. 키 자체는 renderer로 보내지 않는다 */
export interface LlmApiKeyStatus {
  isSaved: boolean
  tail: string | null
}

/**
 * `llm:status` 응답. API 키 자체는 renderer로 보내지 않고 회사별 유무와 마지막 4자만 준다.
 * 공급자는 `AppSettings`와 따로 자기 채널로 오간다 (references/data-model.md).
 */
export interface LlmStatus {
  provider: LlmProvider
  /** llama-cli와 요약 모델이 모두 있는지 */
  isLocalModelReady: boolean
  apiKeys: Record<LlmApiVendor, LlmApiKeyStatus>
  openaiModel: OpenaiModelId
  /** 찾은 `claude` 실행 파일. 없으면 null */
  claudeCliPath: string | null
  claudeCliVersion: string | null
}

/**
 * 디테일 화면이 한 번에 받는 묶음. 마지막 자동 교정 결과도 함께 실린다 —
 * 교정이 본문을 바꾸므로 회의록과 결과가 같은 상태여야 한다 (references/architecture.md "회의록 교정")
 */
export interface MeetingDetail {
  meeting: Meeting
  utterances: Utterance[]
  speakers: Speaker[]
  /** 마지막 자동 교정 결과 (Phase 5-4). 아직 교정하지 않았으면 null */
  refineResult: RefineResult | null
}

/**
 * 파이프라인 단계. VAD는 whisper에 내장돼 별도 단계가 없고,
 * 'done'·'error'는 잡이 끝날 때 한 번만 보내는 종료 상태다.
 */
export type PipelineStage = 'stt' | 'diarize' | 'merge' | 'save' | 'done' | 'error'

/**
 * 요약 단계 (Phase 5). 'summarize'는 회의록 전체 또는 구간별 부분 요약,
 * 'reduce'는 부분 요약을 하나로 합치는 단계다. 'done'·'error'는 마지막에 한 번만 보낸다.
 */
export type SummaryStage = 'summarize' | 'reduce' | 'done' | 'error'

/**
 * 교정 잡의 단계 (Phase 5-4). 'read'는 읽기가 없는 라틴 문자 용어의 한글 읽기를 묻는 단계,
 * 'verify'는 후보를 배치로 판정하는 단계다. 'done'·'error'는 마지막에 한 번만 보낸다.
 */
/** 'read'·'verify'는 로컬의 용어 교정, 'sentence'는 외부 공급자의 문장 교정 단계 */
export type RefineStage = 'read' | 'verify' | 'sentence' | 'done' | 'error'

/** 마지막 자동 교정 결과. `appliedPairs`가 비어 있으면 고칠 곳을 찾지 못한 것이다 */
export interface RefineResult {
  /** epoch ms */
  refinedAt: number
  /** 실제로 본문을 바꾼 쌍 */
  appliedPairs: RefinePair[]
}

/** 같은 쌍(from → to)이 걸린 발화를 묶은 것. 화면은 이 단위로 "몇 곳 고쳤는지"를 보여 준다 */
export interface RefinePairGroup {
  from: string
  to: string
  utteranceIds: string[]
}

/** 교정 대상 발화 하나 (Phase 5-4). 화자 라벨은 넘기지 않는다 — 모델이 고칠 대상이 아니다 */
export interface RefineSource {
  id: string
  text: string
}

/**
 * 치환 후보 한 쌍. 발화의 `from`이 용어 사전의 `to`를 잘못 받아 적은 것일 수 있다는 뜻이다.
 * 코드가 발음 유사도로 만들고, LLM이 문맥을 보고 맞는지 판정한다 (docs/phase5-refine-results.md)
 */
export interface RefinePair {
  utteranceId: string
  from: string
  to: string
  /** `from`과 용어의 한글 발음의 자모 유사도 (0~1) */
  similarity: number
}

/** 발화 하나에 판정을 통과한 쌍을 모두 적용한 결과. 앱은 `after`를 본문에 저장하고, 스크립트는 전후를 비교한다 */
export interface RefineSuggestion {
  id: string
  before: string
  after: string
  pairs: Pick<RefinePair, 'from' | 'to'>[]
}
