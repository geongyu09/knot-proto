import type { SetShortcutsSuspendedRequest, UpdateSettingsRequest } from '@shared/ipc'

/**
 * @description 앱 설정을 불러옵니다.
 * @returns 현재 설정
 * @example
 * const settings = await getSettingsApi()
 */
export const getSettingsApi = async () => window.api.settings.get()

/**
 * @description 앱 설정을 저장합니다. 설정 전체를 한 번에 보냅니다.
 * 단축키가 바뀌면 main이 등록을 먼저 시도하고, 실패하면 저장하지 않고 reject합니다.
 * @param isAudioKept - 회의록을 만든 뒤 원본 녹음을 보관할지 여부
 * @param isUpdateCheckEnabled - 앱 시작 시 새 버전을 확인할지 여부 (기본 꺼짐)
 * @param isQuietProcessing - 회의록을 만들 때 속도보다 발열·팬 소음을 줄일지 여부 (기본 꺼짐)
 * @param recordingShortcut - 녹음 토글 전역 단축키 (Electron accelerator)
 * @param inputDevice - 녹음에 쓸 마이크 (`{ deviceId, label }`). null이면 시스템 기본 마이크
 * @param locale - UI 언어 (`'ko'` | `'en'`). 인식·요약 언어는 바뀌지 않습니다
 * @param isAutoRefineExternal - 외부 LLM 공급자일 때 회의록이 만들어지면 자동으로 교정할지 여부 (기본 꺼짐)
 * @returns 저장된 설정
 * @example
 * const settings = await updateSettingsApi({
 *   isAudioKept: true,
 *   isUpdateCheckEnabled: false,
 *   isQuietProcessing: false,
 *   recordingShortcut: 'Alt+Command+R',
 *   inputDevice: null,
 *   locale: 'ko',
 *   isAutoRefineExternal: false
 * })
 */
export const updateSettingsApi = async ({
  isAudioKept,
  isUpdateCheckEnabled,
  isQuietProcessing,
  recordingShortcut,
  inputDevice,
  locale,
  isAutoRefineExternal
}: UpdateSettingsRequest) =>
  window.api.settings.update({
    isAudioKept,
    isUpdateCheckEnabled,
    isQuietProcessing,
    recordingShortcut,
    inputDevice,
    locale,
    isAutoRefineExternal
  })

/**
 * @description 새 단축키를 입력받는 동안 전역 단축키를 해제하거나, 끝난 뒤 다시 등록합니다.
 * 해제하지 않으면 현재 단축키를 누르는 순간 녹음이 시작됩니다.
 * @param isSuspended - true면 해제, false면 저장된 단축키로 다시 등록
 * @returns 없음
 * @example
 * await setShortcutsSuspendedApi({ isSuspended: true })
 */
export const setShortcutsSuspendedApi = async ({ isSuspended }: SetShortcutsSuspendedRequest) => {
  await window.api.shortcuts.setSuspended({ isSuspended })
}
