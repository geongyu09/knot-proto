import { commonEn, commonKo } from './locales/common'
import { decisionsEn, decisionsKo } from './locales/decisions'
import { glossaryEn, glossaryKo } from './locales/glossary'
import { llmEn, llmKo } from './locales/llm'
import { mainEn, mainKo } from './locales/main'
import { modelsEn, modelsKo } from './locales/models'
import { pipelineEn, pipelineKo } from './locales/pipeline'
import { recordingEn, recordingKo } from './locales/recording'
import { refineEn, refineKo } from './locales/refine'
import { settingsEn, settingsKo } from './locales/settings'
import { sidebarEn, sidebarKo } from './locales/sidebar'
import { summaryEn, summaryKo } from './locales/summary'
import { transcriptEn, transcriptKo } from './locales/transcript'
import { updateEn, updateKo } from './locales/update'

/**
 * UI 언어. 인식·요약 언어가 아니라 화면·메뉴바·오류 문구의 언어다 (references/architecture.md "UI 언어").
 * 사전은 도메인별 `src/shared/locales/<domain>.ts`에 ko·en을 나란히 두고 여기서 모은다.
 */
export type Locale = 'ko' | 'en'

export const LOCALES: Locale[] = ['ko', 'en']
export const DEFAULT_LOCALE: Locale = 'ko'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as string[]).includes(value)

/** 언어 선택 항목은 각 언어의 자기 이름으로 보여 준다 — 영어 화면에서도 한국어 사용자가 찾을 수 있어야 한다 */
export const LOCALE_NAMES: Record<Locale, string> = {
  ko: '한국어',
  en: 'English'
}

const ko = {
  common: commonKo,
  sidebar: sidebarKo,
  transcript: transcriptKo,
  summary: summaryKo,
  refine: refineKo,
  decisions: decisionsKo,
  pipeline: pipelineKo,
  recording: recordingKo,
  models: modelsKo,
  settings: settingsKo,
  llm: llmKo,
  glossary: glossaryKo,
  update: updateKo,
  main: mainKo
}

/** 한국어 사전이 타입을 정한다. 영어에 키가 빠지면 타입 오류다 */
export type Messages = typeof ko

const en: Messages = {
  common: commonEn,
  sidebar: sidebarEn,
  transcript: transcriptEn,
  summary: summaryEn,
  refine: refineEn,
  decisions: decisionsEn,
  pipeline: pipelineEn,
  recording: recordingEn,
  models: modelsEn,
  settings: settingsEn,
  llm: llmEn,
  glossary: glossaryEn,
  update: updateEn,
  main: mainEn
}

export const MESSAGES: Record<Locale, Messages> = { ko, en }

export const getMessages = (locale: Locale) => MESSAGES[locale]
