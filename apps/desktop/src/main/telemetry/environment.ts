import os from 'node:os'
import type { EnvironmentProps } from '@meeting-stt/telemetry/events'
import { app } from 'electron'
import { performanceCoreCount } from '../bin/threads'
import {
  getAppSettings,
  getGlossarySettings,
  getLlmProvider,
  getSystemAudioEnabled,
  getWhisperModelId
} from '../db/settings'

const BYTES_PER_GB = 1024 ** 3

/**
 * 설정·환경 스냅샷. **허용 목록**으로 만든다 — 설정 전체를 펼치면 새 비밀 키가 생길 때 샌다
 * (references/pitfalls.md "사용 정보 수집").
 */
export const collectEnvironment = async (): Promise<EnvironmentProps> => {
  const settings = getAppSettings()
  const cpus = os.cpus()

  return {
    appVersion: app.getVersion(),
    osVersion: process.getSystemVersion(),
    arch: process.arch,
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    performanceCoreCount: await performanceCoreCount(),
    totalMemoryGb: Math.round(os.totalmem() / BYTES_PER_GB),
    whisperModelId: getWhisperModelId(),
    llmProvider: getLlmProvider(),
    locale: settings.locale,
    // 다크 모드를 없앤 뒤에도 수집 계약(packages/telemetry)은 유지한다
    theme: 'light',
    isAudioKept: settings.isAudioKept,
    isQuietProcessing: settings.isQuietProcessing,
    // 위젯 패널을 없앤 뒤에도 수집 계약(packages/telemetry)은 유지한다
    isWidgetEnabled: false,
    isAutoRefineExternal: settings.isAutoRefineExternal,
    isSystemAudioCapture: getSystemAudioEnabled(),
    glossaryTermCount: getGlossarySettings().terms.length
  }
}
