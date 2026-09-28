import { randomUUID } from 'node:crypto'
import type {
  AppSettings,
  GlossarySettings,
  LlmApiVendor,
  LlmProvider,
  OpenaiModelId,
  WhisperModelId
} from '@shared/types'
import { DEFAULT_WHISPER_MODEL_ID, isWhisperModelId } from '@meeting-stt/models/desktop'
import { isAudioInputDevice } from '@shared/audio'
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OPENAI_MODEL_ID,
  isLlmProvider,
  isOpenaiModelId
} from '@shared/llm'
import { DEFAULT_RECORDING_SHORTCUT, isValidAccelerator } from '@shared/shortcut'
import { DEFAULT_LOCALE, isLocale } from '@shared/i18n'
import { getDb } from './connection'

/** DB 키와 TS 필드명의 변환은 이 파일에서만 한다 (references/data-model.md) */
const AUDIO_KEEP_KEY = 'audio.keep'
const AUDIO_INPUT_DEVICE_KEY = 'audio.inputDevice'
const AUDIO_SYSTEM_CAPTURE_KEY = 'audio.systemCapture'
const UI_LOCALE_KEY = 'ui.locale'
const UPDATE_CHECK_KEY = 'update.check'
const STT_MODEL_KEY = 'stt.model'
const PIPELINE_QUIET_KEY = 'pipeline.quiet'
const RECORDING_SHORTCUT_KEY = 'shortcut.recording'
const GLOSSARY_TEAM_KEY = 'glossary.team'
const GLOSSARY_TERMS_KEY = 'glossary.terms'
const REFINE_AUTO_EXTERNAL_KEY = 'refine.autoExternal'
const LLM_PROVIDER_KEY = 'llm.provider'
const LLM_OPENAI_MODEL_KEY = 'llm.openaiModel'
const TELEMETRY_INSTALL_ID_KEY = 'telemetry.installId'
/** 회사별 암호화 키의 settings 키. Anthropic은 OpenAI 추가 전 이름을 그대로 둬 저장된 키를 잃지 않는다 */
const LLM_API_KEY_KEYS: Record<LlmApiVendor, string> = {
  anthropic: 'llm.claudeApiKey',
  openai: 'llm.openaiApiKey'
}

const DEFAULT_SETTINGS: AppSettings = {
  isAudioKept: false,
  isUpdateCheckEnabled: false,
  isQuietProcessing: false,
  recordingShortcut: DEFAULT_RECORDING_SHORTCUT,
  inputDevice: null,
  locale: DEFAULT_LOCALE,
  isAutoRefineExternal: false
}

/** 값이 없거나 JSON이 깨져도 undefined로 읽는다. 설정 하나 때문에 앱이 멈추면 안 된다 */
const readValue = (key: string): unknown => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  if (!row) return undefined

  try {
    return JSON.parse(row.value)
  } catch {
    return undefined
  }
}

const writeValue = ({ key, value }: { key: string; value: unknown }) => {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = @value`
    )
    .run({ key, value: JSON.stringify(value) })
}

const deleteValue = ({ key }: { key: string }) => {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

const readBoolean = ({ key, fallback }: { key: string; fallback: boolean }) => {
  const value = readValue(key)

  return typeof value === 'boolean' ? value : fallback
}

const readShortcut = ({ key, fallback }: { key: string; fallback: string }) => {
  const value = readValue(key)

  return typeof value === 'string' && isValidAccelerator(value) ? value : fallback
}

/** 모르는 언어 값은 기본 언어로 읽는다 */
const readLocale = ({ key }: { key: string }) => {
  const value = readValue(key)

  return isLocale(value) ? value : DEFAULT_SETTINGS.locale
}

/** 모양이 깨진 값은 시스템 기본 마이크(null)로 읽는다 */
const readInputDevice = ({ key }: { key: string }) => {
  const value = readValue(key)

  return isAudioInputDevice(value) ? value : null
}

export const getAppSettings = (): AppSettings => ({
  isAudioKept: readBoolean({ key: AUDIO_KEEP_KEY, fallback: DEFAULT_SETTINGS.isAudioKept }),
  isUpdateCheckEnabled: readBoolean({
    key: UPDATE_CHECK_KEY,
    fallback: DEFAULT_SETTINGS.isUpdateCheckEnabled
  }),
  isQuietProcessing: readBoolean({
    key: PIPELINE_QUIET_KEY,
    fallback: DEFAULT_SETTINGS.isQuietProcessing
  }),
  recordingShortcut: readShortcut({
    key: RECORDING_SHORTCUT_KEY,
    fallback: DEFAULT_SETTINGS.recordingShortcut
  }),
  inputDevice: readInputDevice({ key: AUDIO_INPUT_DEVICE_KEY }),
  locale: readLocale({ key: UI_LOCALE_KEY }),
  isAutoRefineExternal: readBoolean({
    key: REFINE_AUTO_EXTERNAL_KEY,
    fallback: DEFAULT_SETTINGS.isAutoRefineExternal
  })
})

export const updateAppSettings = ({
  isAudioKept,
  isUpdateCheckEnabled,
  isQuietProcessing,
  recordingShortcut,
  inputDevice,
  locale,
  isAutoRefineExternal
}: AppSettings) => {
  writeValue({ key: AUDIO_KEEP_KEY, value: isAudioKept })
  writeValue({ key: UPDATE_CHECK_KEY, value: isUpdateCheckEnabled })
  writeValue({ key: PIPELINE_QUIET_KEY, value: isQuietProcessing })
  writeValue({ key: RECORDING_SHORTCUT_KEY, value: recordingShortcut })
  writeValue({ key: AUDIO_INPUT_DEVICE_KEY, value: inputDevice })
  writeValue({ key: UI_LOCALE_KEY, value: locale })
  writeValue({ key: REFINE_AUTO_EXTERNAL_KEY, value: isAutoRefineExternal })

  return getAppSettings()
}

/**
 * 온라인 회의 소리(스피커 출력) 함께 녹음 (Phase 5-2). `AppSettings`에 넣지 않는다 — 켜는 행위가 값 저장이 아니라
 * 도구 프로브(시스템 권한 창)를 동반하므로 `recording:setSystemAudio`만 쓴다 (references/data-model.md). 기본 꺼짐
 */
export const getSystemAudioEnabled = () =>
  readBoolean({ key: AUDIO_SYSTEM_CAPTURE_KEY, fallback: false })

export const setSystemAudioEnabled = ({ isEnabled }: { isEnabled: boolean }) =>
  writeValue({ key: AUDIO_SYSTEM_CAPTURE_KEY, value: isEnabled })

/**
 * 온보딩·설정에서 고른 음성 인식 모델. `AppSettings`에 넣지 않는다 — 바꾸는 행위가 다운로드를 동반하므로
 * `models:download` 핸들러만 쓴다 (references/data-model.md). 모르는 값은 기본 모델로 읽는다.
 */
export const getWhisperModelId = (): WhisperModelId => {
  const value = readValue(STT_MODEL_KEY)

  return isWhisperModelId(value) ? value : DEFAULT_WHISPER_MODEL_ID
}

export const setWhisperModelId = ({ whisperModelId }: { whisperModelId: WhisperModelId }) =>
  writeValue({ key: STT_MODEL_KEY, value: whisperModelId })

/**
 * 전역 용어 사전. `AppSettings`에 넣지 않는다 — 설정 화면의 별도 카테고리가 자기 채널로 읽고 쓴다
 * (references/data-model.md). 형식이 깨진 값은 빈 값으로 읽는다.
 */
export const getGlossarySettings = (): GlossarySettings => {
  const teamDescription = readValue(GLOSSARY_TEAM_KEY)
  const terms = readValue(GLOSSARY_TERMS_KEY)

  return {
    teamDescription: typeof teamDescription === 'string' ? teamDescription : '',
    terms: Array.isArray(terms)
      ? terms.filter((term): term is string => typeof term === 'string')
      : []
  }
}

/** 검증·정리는 호출하는 쪽(`readGlossarySettings`)이 끝낸 값이어야 한다 */
export const updateGlossarySettings = ({ teamDescription, terms }: GlossarySettings) => {
  writeValue({ key: GLOSSARY_TEAM_KEY, value: teamDescription })
  writeValue({ key: GLOSSARY_TERMS_KEY, value: terms })

  return getGlossarySettings()
}

/**
 * 요약·용어 초안이 쓰는 LLM 공급자. `AppSettings`에 넣지 않는다 — 키 저장·CLI 탐색이 붙은
 * 별도 카테고리가 자기 채널로 읽고 쓴다 (references/data-model.md). 모르는 값은 로컬로 읽는다.
 */
export const getLlmProvider = (): LlmProvider => {
  const value = readValue(LLM_PROVIDER_KEY)

  return isLlmProvider(value) ? value : DEFAULT_LLM_PROVIDER
}

export const setLlmProvider = ({ provider }: { provider: LlmProvider }) =>
  writeValue({ key: LLM_PROVIDER_KEY, value: provider })

/** `openai-api`가 부르는 GPT 모델. 모르는 값(사라진 모델 id)은 기본값으로 읽는다 */
export const getOpenaiModel = (): OpenaiModelId => {
  const value = readValue(LLM_OPENAI_MODEL_KEY)

  return isOpenaiModelId(value) ? value : DEFAULT_OPENAI_MODEL_ID
}

export const setOpenaiModel = ({ model }: { model: OpenaiModelId }) =>
  writeValue({ key: LLM_OPENAI_MODEL_KEY, value: model })

/**
 * safeStorage로 암호화한 회사별 API 키(base64). 평문은 여기까지 오지 않는다 —
 * 암호화·복호화는 `src/main/llm/apiKey.ts`가 한다.
 */
export const getEncryptedApiKey = ({ vendor }: { vendor: LlmApiVendor }) => {
  const value = readValue(LLM_API_KEY_KEYS[vendor])

  return typeof value === 'string' && value ? value : null
}

interface SetEncryptedApiKeyParams {
  vendor: LlmApiVendor
  encrypted: string | null
}

export const setEncryptedApiKey = ({ vendor, encrypted }: SetEncryptedApiKeyParams) => {
  if (encrypted === null) {
    deleteValue({ key: LLM_API_KEY_KEYS[vendor] })
    return
  }

  writeValue({ key: LLM_API_KEY_KEYS[vendor], value: encrypted })
}

/**
 * 설치 식별자 (references/telemetry.md "식별자"). 첫 호출에 UUID를 만들어 저장한다.
 * 기기·계정 정보에서 파생하지 않는다. 새로 만들었으면 `isFirstRun`이 true다.
 */
export const ensureTelemetryInstallId = () => {
  const saved = readValue(TELEMETRY_INSTALL_ID_KEY)
  if (typeof saved === 'string' && saved) return { installId: saved, isFirstRun: false }

  const installId = randomUUID()
  writeValue({ key: TELEMETRY_INSTALL_ID_KEY, value: installId })

  return { installId, isFirstRun: true }
}
