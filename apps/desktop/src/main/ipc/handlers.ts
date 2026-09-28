import { BrowserWindow, clipboard, ipcMain, systemPreferences } from 'electron'
import {
  IPC,
  type CheckLlmResponse,
  type DownloadModelsResponse,
  type ExportMeetingAudioResponse,
  type ImportMeetingAudioResponse,
  type GetLlmStatusResponse,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type DraftGlossaryResponse,
  type GetGlossaryResponse,
  type GetSettingsResponse,
  type GetRecordingStateResponse,
  type ModelDownloadProgressEvent,
  type ModelStatusResponse,
  type MutateMeetingResponse,
  type RecordingCommandEvent,
  type RequestMicrophonePermissionResponse,
  type SearchMeetingsResponse,
  type SetLlmApiKeyResponse,
  type SetLlmProviderResponse,
  type SetOpenaiModelResponse,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingResponse,
  type UpdateGlossaryResponse,
  type UpdateSettingsResponse
} from '@shared/ipc'
import { isAudioInputDevice } from '@shared/audio'
import { readGlossarySettings, readTeamDescription } from '@shared/glossary'
import { isLlmProvider, isOpenaiModelId, readApiKeyPayload } from '@shared/llm'
import { isValidAccelerator } from '@shared/shortcut'
import { isLocale } from '@shared/i18n'
import {
  isValidSpeakerCount,
  MAX_SPEAKER_COUNT,
  MIN_SPEAKER_COUNT
} from '@meeting-stt/core/speakerCount'
import { exportRecording } from '../audio/exportRecording'
import { importRecording } from '../audio/importRecording'
import { deleteMeetingWithRecording } from '../audio/recordings'
import {
  appendRecordingChunk,
  getRecordingState,
  reportRecordingError,
  setRecordingLiveTranscript,
  setRecordingPaused,
  setRecordingSpeakerCount,
  setRecordingSystemAudio,
  startRecording,
  stopRecording
} from '../audio/session'
import { findMeeting, listMeetings, renameMeeting, searchMeetings } from '../db/meetings'
import { getRefineResult, revertUtteranceRefine } from '../db/refine'
import {
  getAppSettings,
  getGlossarySettings,
  getSystemAudioEnabled,
  setLlmProvider,
  setOpenaiModel,
  setWhisperModelId,
  updateAppSettings,
  updateGlossarySettings
} from '../db/settings'
import { clearApiKey, saveApiKey } from '../llm/apiKey'
import { checkLlm } from '../llm/check'
import { getLlmStatus } from '../llm/provider'
import { hasSpeaker, listSpeakers, mergeSpeakers, renameSpeaker } from '../db/speakers'
import { listUtterances, updateUtteranceSpeaker, updateUtteranceText } from '../db/utterances'
import type { ModelDownloadProgress } from '../models/download'
import { isWhisperModelId } from '@meeting-stt/models/desktop'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { setCurrentLocale, t } from '../locale'
import { downloadModels, downloadSummaryModel, modelStatus } from '../models/service'
import { enqueueGlossaryDraft, enqueueRefineJob, enqueueSummaryJob } from '../pipeline/queue'
import { reprocessMeeting } from '../pipeline/reprocess'
import { checkForUpdatesNow, downloadUpdate, installUpdate } from '../updater'
import { showMainWindow } from '../windows/main'
import { replaceGlobalShortcuts, setGlobalShortcutsSuspended } from '../windows/shortcuts'
import { refreshTray } from '../windows/tray'
import { requestRecordingCommand } from '../windows/recorder'
import { trackRendererEvent } from '../telemetry/rendererEvents'
import { registerDecisionHandlers } from './decisionHandlers'
import { changedSettingKeys } from '../telemetry/settingsDiff'
import { track, trackMeetingDeleted, trackMeetingEdit } from '../telemetry/track'

const FULL_PERCENT = 100

const TITLE_MAX_LENGTH = 200
const UTTERANCE_TEXT_MAX_LENGTH = 10_000
const SPEAKER_NAME_MAX_LENGTH = 60
const LABEL_MAX_LENGTH = 100
const CLIPBOARD_MAX_LENGTH = 2_000_000
const ERROR_MESSAGE_MAX_LENGTH = 500
const SEARCH_QUERY_MAX_LENGTH = 200

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

interface ReadTextParams {
  payload: unknown
  key: string
  maxLength: number
  label: string
}

/** renderer가 보낸 payload는 신뢰하지 않는다 (.claude/rules/ipc-api-guide.md) */
const readText = ({ payload, key, maxLength, label }: ReadTextParams) => {
  if (!isRecord(payload) || typeof payload[key] !== 'string') {
    throw new Error(t().main.errors.invalidRequest({ what: label }))
  }

  const text = payload[key]
  if (!text.trim()) throw new Error(t().main.errors.fieldEmpty({ label }))
  if (text.length > maxLength) {
    throw new Error(t().main.errors.fieldTooLong({ label, maxLength }))
  }

  return text.trim()
}

const readMeetingId = (payload: unknown) =>
  readText({
    payload,
    key: 'meetingId',
    maxLength: LABEL_MAX_LENGTH,
    label: t().main.fields.meetingId
  })

const readUtteranceId = (payload: unknown) =>
  readText({
    payload,
    key: 'utteranceId',
    maxLength: LABEL_MAX_LENGTH,
    label: t().main.fields.utteranceId
  })

const readSpeakerLabel = ({ payload, key }: { payload: unknown; key: string }) =>
  readText({ payload, key, maxLength: LABEL_MAX_LENGTH, label: t().main.fields.speakerLabel })

const readSampleRate = (payload: unknown) => {
  if (!isRecord(payload) || typeof payload.sampleRate !== 'number') {
    throw new Error(t().main.errors.invalidRequest({ what: t().main.fields.sampleRate }))
  }

  return (payload as unknown as StartRecordingRequest).sampleRate
}

/** 비어 있으면 임계값 폴백. 값이 있는데 범위를 벗어나면 조용히 버리지 않고 거절한다 */
const readSpeakerCount = (payload: unknown) => {
  if (!isRecord(payload) || payload.speakerCount === undefined || payload.speakerCount === null) {
    return undefined
  }
  if (!isValidSpeakerCount(payload.speakerCount)) {
    throw new Error(
      t().main.errors.speakerCountRange({ min: MIN_SPEAKER_COUNT, max: MAX_SPEAKER_COUNT })
    )
  }

  return payload.speakerCount
}

const readPcm = (payload: unknown) => {
  if (!isRecord(payload) || !(payload.pcm instanceof ArrayBuffer)) {
    throw new Error(t().main.errors.invalidRequest({ what: t().main.fields.pcmChunk }))
  }

  return payload.pcm
}

const readBoolean = ({ payload, key }: { payload: unknown; key: string }) => {
  if (!isRecord(payload) || typeof payload[key] !== 'boolean') {
    throw new Error(t().main.errors.invalidRequest({ what: t().main.fields.settingValue }))
  }

  return payload[key]
}

const readShortcut = ({ payload, key }: { payload: unknown; key: string }) => {
  const value = isRecord(payload) ? payload[key] : undefined
  if (typeof value !== 'string' || !isValidAccelerator(value)) {
    throw new Error(t().main.errors.shortcutInvalid)
  }

  return value
}

/** null은 시스템 기본 마이크. 값이 있는데 모양이 다르면 조용히 버리지 않고 거절한다 */
const readInputDevice = (payload: unknown) => {
  const value = isRecord(payload) ? payload.inputDevice : undefined
  if (value === null) return null
  if (!isAudioInputDevice(value)) throw new Error(t().main.errors.inputDeviceInvalid)

  return { deviceId: value.deviceId, label: value.label }
}

/** 모르는 언어는 조용히 기본값으로 바꾸지 않고 거절한다 — 저장 요청은 설정 화면이 고른 값이어야 한다 */
const readLocale = (payload: unknown) => {
  const value = isRecord(payload) ? payload.locale : undefined
  if (!isLocale(value)) throw new Error(t().main.errors.unknownLocale)

  return value
}

const readSettings = (payload: unknown) => ({
  isAudioKept: readBoolean({ payload, key: 'isAudioKept' }),
  isUpdateCheckEnabled: readBoolean({ payload, key: 'isUpdateCheckEnabled' }),
  isQuietProcessing: readBoolean({ payload, key: 'isQuietProcessing' }),
  recordingShortcut: readShortcut({ payload, key: 'recordingShortcut' }),
  inputDevice: readInputDevice(payload),
  locale: readLocale(payload),
  isAutoRefineExternal: readBoolean({ payload, key: 'isAutoRefineExternal' })
})

const RECORDING_COMMAND_KINDS: RecordingCommandEvent['kind'][] = ['start', 'stop', 'toggle']

const readRecordingCommandKind = (payload: unknown) => {
  const kind = isRecord(payload) ? payload.kind : undefined
  if (!RECORDING_COMMAND_KINDS.includes(kind as RecordingCommandEvent['kind'])) {
    throw new Error(t().main.errors.unknownRecordingCommand)
  }

  return kind as RecordingCommandEvent['kind']
}

const readLlmProvider = (payload: unknown) => {
  if (!isRecord(payload) || !isLlmProvider(payload.provider)) {
    throw new Error(t().main.errors.unknownLlmProvider)
  }

  return payload.provider
}

/** 키는 저장·삭제만 하고 renderer로 되돌려주지 않는다 (references/data-model.md) */
const handleSetLlmApiKey = (payload: unknown): Promise<SetLlmApiKeyResponse> => {
  const { vendor, apiKey } = readApiKeyPayload(payload, t().llm.errors)
  if (apiKey === null) clearApiKey({ vendor })
  else saveApiKey({ vendor, apiKey })

  return getLlmStatus()
}

const readOpenaiModel = (payload: unknown) => {
  if (!isRecord(payload) || !isOpenaiModelId(payload.model)) {
    throw new Error(t().main.errors.unknownOpenaiModel)
  }

  return payload.model
}

const readWhisperModelId = (payload: unknown) => {
  if (!isRecord(payload) || !isWhisperModelId(payload.whisperModelId)) {
    throw new Error(t().main.errors.unknownWhisperModel)
  }

  return payload.whisperModelId
}

/** macOS만 명시적 요청이 필요하다. 그 외 플랫폼은 getUserMedia 실패로 처리한다 */
const requestMicrophonePermission = async (): Promise<RequestMicrophonePermissionResponse> => {
  if (process.platform !== 'darwin') return { isGranted: true }

  return { isGranted: await systemPreferences.askForMediaAccess('microphone') }
}

const getMeetingDetail = ({ meetingId }: GetMeetingRequest): GetMeetingResponse => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) return null

  return {
    meeting,
    utterances: listUtterances({ meetingId }),
    speakers: listSpeakers({ meetingId }),
    refineResult: getRefineResult({ meetingId })
  }
}

/** 편집 채널은 갱신된 상세를 그대로 돌려준다 (references/architecture.md) */
const requireMeetingDetail = ({ meetingId }: GetMeetingRequest): MutateMeetingResponse => {
  const detail = getMeetingDetail({ meetingId })
  if (!detail) throw new Error(t().main.errors.meetingNotFound)

  return detail
}

const requireSpeaker = ({ meetingId, label }: { meetingId: string; label: string }) => {
  if (!hasSpeaker({ meetingId, label })) throw new Error(t().main.errors.speakerNotInMeeting)
}

const handleRenameMeeting = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const title = readText({
    payload,
    key: 'title',
    maxLength: TITLE_MAX_LENGTH,
    label: t().main.fields.meetingTitle
  })

  if (!renameMeeting({ meetingId, title })) throw new Error(t().main.errors.meetingNotFound)
  notifyMeetingsChanged()
  trackMeetingEdit({ name: 'meeting_renamed', meetingId })

  return requireMeetingDetail({ meetingId })
}

const handleDeleteMeeting = async (payload: unknown) => {
  const meetingId = readMeetingId(payload)

  if (!(await deleteMeetingWithRecording({ meetingId }))) {
    throw new Error(t().main.errors.meetingNotFound)
  }
  notifyMeetingsChanged()
  trackMeetingDeleted({ meetingId })
}

/** 참석자 수를 비우면(null) 임계값 폴백으로 다시 인식한다 */
const handleReprocessMeeting = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const speakerCount = readSpeakerCount(payload) ?? null
  reprocessMeeting({ meetingId, speakerCount })
  track({ name: 'meeting_reprocessed', props: { meetingId, speakerCount } })

  return requireMeetingDetail({ meetingId })
}

/** 빈 질의는 오류가 아니라 빈 결과다. 사용자가 입력을 지우는 중에도 부른다 */
const handleSearchMeetings = (payload: unknown): SearchMeetingsResponse => {
  if (!isRecord(payload) || typeof payload.query !== 'string') {
    throw new Error(t().main.errors.invalidRequest({ what: t().main.fields.searchQuery }))
  }
  if (payload.query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new Error(t().main.errors.searchQueryTooLong({ maxLength: SEARCH_QUERY_MAX_LENGTH }))
  }

  return searchMeetings({ query: payload.query })
}

const handleUpdateUtteranceText = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const changed = updateUtteranceText({
    meetingId,
    utteranceId: readUtteranceId(payload),
    text: readText({
      payload,
      key: 'text',
      maxLength: UTTERANCE_TEXT_MAX_LENGTH,
      label: t().main.fields.utteranceText
    })
  })
  if (!changed) throw new Error(t().main.errors.utteranceNotFound)
  trackMeetingEdit({ name: 'utterance_edited', meetingId })

  return requireMeetingDetail({ meetingId })
}

const handleReassignUtterance = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const speakerLabel = readSpeakerLabel({ payload, key: 'speakerLabel' })
  requireSpeaker({ meetingId, label: speakerLabel })

  const changed = updateUtteranceSpeaker({
    meetingId,
    utteranceId: readUtteranceId(payload),
    speakerLabel
  })
  if (!changed) throw new Error(t().main.errors.utteranceNotFound)
  trackMeetingEdit({ name: 'utterance_reassigned', meetingId })

  return requireMeetingDetail({ meetingId })
}

/** 원문이 보관되지 않은 발화(교정된 적 없음)는 되돌릴 것이 없으므로 발화를 못 찾은 것과 같게 다룬다 */
const handleRevertUtteranceRefine = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const changed = revertUtteranceRefine({ meetingId, utteranceId: readUtteranceId(payload) })
  if (!changed) throw new Error(t().main.errors.utteranceNotFound)
  trackMeetingEdit({ name: 'refine_reverted', meetingId })

  return requireMeetingDetail({ meetingId })
}

const handleRenameSpeaker = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const changed = renameSpeaker({
    meetingId,
    label: readSpeakerLabel({ payload, key: 'label' }),
    displayName: readText({
      payload,
      key: 'displayName',
      maxLength: SPEAKER_NAME_MAX_LENGTH,
      label: t().main.fields.speakerName
    })
  })
  if (!changed) throw new Error(t().main.errors.speakerNotInMeeting)
  trackMeetingEdit({ name: 'speaker_renamed', meetingId })

  return requireMeetingDetail({ meetingId })
}

const handleMergeSpeakers = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  const fromLabel = readSpeakerLabel({ payload, key: 'fromLabel' })
  const intoLabel = readSpeakerLabel({ payload, key: 'intoLabel' })

  if (fromLabel === intoLabel) throw new Error(t().main.errors.sameSpeakerMerge)
  requireSpeaker({ meetingId, label: fromLabel })
  requireSpeaker({ meetingId, label: intoLabel })
  mergeSpeakers({ meetingId, fromLabel, intoLabel })
  trackMeetingEdit({ name: 'speakers_merged', meetingId })

  return requireMeetingDetail({ meetingId })
}

/** 회의가 없으면 예약하지 않는다. 결과는 refine:progress 이벤트로 온다 */
const handleRunRefine = (payload: unknown) => {
  const meetingId = readMeetingId(payload)
  if (!findMeeting({ meetingId })) throw new Error(t().main.errors.meetingNotFound)

  enqueueRefineJob({ meetingId })
}

const handleWriteClipboardText = (payload: unknown) => {
  clipboard.writeText(
    readText({
      payload,
      key: 'text',
      maxLength: CLIPBOARD_MAX_LENGTH,
      label: t().main.fields.clipboardText
    })
  )
}

/** 다운로드 진행률은 요청한 창이 아니라 모든 창에 보낸다 — 창이 하나뿐이고, 요청 창이 닫혀도 진행은 계속된다 */
const broadcastModelDownloadProgress = ({
  key,
  receivedBytes,
  totalBytes
}: ModelDownloadProgress) => {
  const event: ModelDownloadProgressEvent = {
    key,
    receivedBytes,
    totalBytes,
    percent: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * FULL_PERCENT) : 0
  }

  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC.events.modelDownload, event)
  })
}

/** 요청한 창은 응답으로 새 상태를 받지만, 녹음 호스트 창은 이 알림이 없으면 앱 시작 때 읽은 상태에 머문다 */
const broadcastModelsChanged = (status: DownloadModelsResponse) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IPC.events.modelsChanged)
  })

  return status
}

/** 고른 모델은 다운로드 성공과 무관하게 먼저 저장한다 — 창을 닫았다 다시 들어와도 같은 선택으로 이어받는다 */
const handleDownloadModels = async (payload: unknown): Promise<DownloadModelsResponse> => {
  const whisperModelId = readWhisperModelId(payload)
  setWhisperModelId({ whisperModelId })

  return broadcastModelsChanged(
    await downloadModels({ whisperModelId, onProgress: broadcastModelDownloadProgress })
  )
}

export const registerIpcHandlers = () => {
  ipcMain.handle(IPC.recording.requestPermission, () => requestMicrophonePermission())

  ipcMain.handle(IPC.recording.start, async (_event, payload): Promise<StartRecordingResponse> => {
    const response = await startRecording({ sampleRate: readSampleRate(payload) })
    track({ name: 'recording_started', props: { isSystemAudio: getSystemAudioEnabled() } })

    return response
  })

  ipcMain.handle(IPC.recording.chunk, (_event, payload) =>
    appendRecordingChunk({ meetingId: readMeetingId(payload), pcm: readPcm(payload) })
  )

  // 녹음을 끝낸 직후에 보고 싶은 것은 결과 화면이다. 메뉴바·단축키로 정지했다면 메인 창이 뒤에 있다
  ipcMain.handle(IPC.recording.stop, async (_event, payload): Promise<StopRecordingResponse> => {
    const meeting = await stopRecording({ meetingId: readMeetingId(payload) })
    showMainWindow()
    track({
      name: 'recording_stopped',
      props: {
        meetingId: meeting.id,
        durationSec: meeting.durationSec,
        speakerCount: meeting.speakerCount ?? null
      }
    })

    return meeting
  })

  ipcMain.handle(IPC.recording.state, (): GetRecordingStateResponse => getRecordingState())

  ipcMain.handle(IPC.recording.control, (_event, payload) =>
    requestRecordingCommand({ kind: readRecordingCommandKind(payload) })
  )

  ipcMain.handle(IPC.recording.setSpeakerCount, (_event, payload): GetRecordingStateResponse =>
    setRecordingSpeakerCount(readSpeakerCount(payload))
  )

  ipcMain.handle(IPC.recording.setLiveTranscript, (_event, payload): GetRecordingStateResponse => {
    const isEnabled = readBoolean({ payload, key: 'isEnabled' })
    const state = setRecordingLiveTranscript(isEnabled)
    track({ name: 'live_transcript_toggled', props: { isEnabled } })

    return state
  })

  ipcMain.handle(IPC.recording.setPaused, (_event, payload): GetRecordingStateResponse =>
    setRecordingPaused(readBoolean({ payload, key: 'isPaused' }))
  )

  ipcMain.handle(
    IPC.recording.setSystemAudio,
    async (_event, payload): Promise<GetRecordingStateResponse> => {
      const isEnabled = readBoolean({ payload, key: 'isEnabled' })
      const state = await setRecordingSystemAudio(isEnabled)
      track({ name: 'system_audio_toggled', props: { isEnabled } })

      return state
    }
  )

  ipcMain.handle(IPC.recording.reportError, (_event, payload) =>
    reportRecordingError({
      message: readText({
        payload,
        key: 'message',
        maxLength: ERROR_MESSAGE_MAX_LENGTH,
        label: t().main.fields.errorMessage
      })
    })
  )

  ipcMain.handle(IPC.meetings.list, (): GetMeetingsResponse => listMeetings())

  ipcMain.handle(IPC.meetings.get, (_event, payload): GetMeetingResponse =>
    getMeetingDetail({ meetingId: readMeetingId(payload) })
  )

  ipcMain.handle(IPC.meetings.rename, (_event, payload): MutateMeetingResponse =>
    handleRenameMeeting(payload)
  )

  ipcMain.handle(IPC.meetings.delete, (_event, payload) => handleDeleteMeeting(payload))

  ipcMain.handle(IPC.meetings.search, (_event, payload): SearchMeetingsResponse =>
    handleSearchMeetings(payload)
  )

  ipcMain.handle(IPC.meetings.reprocess, (_event, payload): MutateMeetingResponse =>
    handleReprocessMeeting(payload)
  )

  // 저장 위치 대화상자가 닫힐 때까지 기다린다. 취소는 isSaved: false로 알린다
  ipcMain.handle(
    IPC.meetings.exportAudio,
    async (_event, payload): Promise<ExportMeetingAudioResponse> => {
      const meetingId = readMeetingId(payload)
      const isSaved = await exportRecording({ meetingId })
      if (isSaved) track({ name: 'meeting_audio_exported', props: { meetingId } })

      return { isSaved }
    }
  )

  // 열기 대화상자와 변환이 끝날 때까지 기다린다. 취소는 meeting: null로 알린다
  ipcMain.handle(IPC.meetings.import, async (): Promise<ImportMeetingAudioResponse> => {
    const meeting = await importRecording()
    if (meeting) {
      track({
        name: 'recording_imported',
        props: { meetingId: meeting.id, durationSec: meeting.durationSec }
      })
    }

    return { meeting }
  })

  ipcMain.handle(IPC.utterances.updateText, (_event, payload): MutateMeetingResponse =>
    handleUpdateUtteranceText(payload)
  )

  ipcMain.handle(IPC.utterances.reassign, (_event, payload): MutateMeetingResponse =>
    handleReassignUtterance(payload)
  )
  ipcMain.handle(IPC.utterances.revertRefine, (_event, payload): MutateMeetingResponse =>
    handleRevertUtteranceRefine(payload)
  )

  ipcMain.handle(IPC.speakers.rename, (_event, payload): MutateMeetingResponse =>
    handleRenameSpeaker(payload)
  )

  ipcMain.handle(IPC.speakers.merge, (_event, payload): MutateMeetingResponse =>
    handleMergeSpeakers(payload)
  )

  ipcMain.handle(IPC.settings.get, (): GetSettingsResponse => getAppSettings())

  // 단축키는 등록을 먼저 시도하고 성공했을 때만 저장한다 — 실패하면 이전 단축키로 되돌아가 있다
  ipcMain.handle(IPC.settings.update, (_event, payload): UpdateSettingsResponse => {
    const previous = getAppSettings()
    const next = readSettings(payload)

    if (next.recordingShortcut !== previous.recordingShortcut) {
      replaceGlobalShortcuts({ next, previous })
    }

    const settings = updateAppSettings(next)
    changedSettingKeys({ previous, next: settings }).forEach((key) =>
      track({ name: 'setting_changed', props: { key } })
    )

    // 메뉴바 문구는 언어를 따르고, 녹음 호스트 창은 push로만 새 설정을 안다 (references/architecture.md "UI 언어")
    if (settings.locale !== previous.locale) {
      setCurrentLocale(settings.locale)
      refreshTray()
    }
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(IPC.events.settingsChanged, settings)
    })

    return settings
  })

  ipcMain.handle(IPC.shortcuts.setSuspended, (_event, payload): void =>
    setGlobalShortcutsSuspended({ isSuspended: readBoolean({ payload, key: 'isSuspended' }) })
  )

  ipcMain.handle(IPC.models.status, (): ModelStatusResponse => modelStatus())

  ipcMain.handle(IPC.models.download, (_event, payload) => handleDownloadModels(payload))

  ipcMain.handle(IPC.models.downloadSummary, async (): Promise<DownloadModelsResponse> =>
    broadcastModelsChanged(
      await downloadSummaryModel({ onProgress: broadcastModelDownloadProgress })
    )
  )

  ipcMain.handle(IPC.update.check, () => checkForUpdatesNow())

  ipcMain.handle(IPC.update.download, () => downloadUpdate())

  ipcMain.handle(IPC.update.install, () => installUpdate())

  ipcMain.handle(IPC.clipboard.writeText, (_event, payload) => handleWriteClipboardText(payload))

  // 요약은 수 분이 걸려 invoke를 매달아 둘 수 없다. 큐에 넣기만 하고 결과는 이벤트로 보낸다
  ipcMain.handle(IPC.summary.create, (_event, payload) =>
    enqueueSummaryJob({ meetingId: readMeetingId(payload) })
  )

  // 교정은 파이프라인 뒤에 자동으로 돌고, 이 채널은 수동 재실행이다. 요약처럼 큐에 넣기만 하고 결과는 이벤트로 보낸다
  ipcMain.handle(IPC.refine.run, (_event, payload) => handleRunRefine(payload))

  ipcMain.handle(IPC.glossary.get, (): GetGlossaryResponse => getGlossarySettings())

  ipcMain.handle(IPC.glossary.update, (_event, payload): UpdateGlossaryResponse => {
    const glossary = updateGlossarySettings(readGlossarySettings(payload, t().glossary.errors))
    track({ name: 'glossary_updated', props: { termCount: glossary.terms.length } })

    return glossary
  })

  ipcMain.handle(IPC.glossary.draft, async (_event, payload): Promise<DraftGlossaryResponse> => ({
    terms: await enqueueGlossaryDraft({
      teamDescription: readTeamDescription(payload, t().glossary.errors)
    })
  }))

  ipcMain.handle(IPC.llm.status, (): Promise<GetLlmStatusResponse> => getLlmStatus())

  ipcMain.handle(IPC.llm.setProvider, (_event, payload): Promise<SetLlmProviderResponse> => {
    const provider = readLlmProvider(payload)
    setLlmProvider({ provider })
    track({ name: 'llm_provider_changed', props: { provider } })

    return getLlmStatus()
  })

  ipcMain.handle(IPC.llm.setApiKey, (_event, payload) => handleSetLlmApiKey(payload))

  ipcMain.handle(IPC.llm.setOpenaiModel, (_event, payload): Promise<SetOpenaiModelResponse> => {
    setOpenaiModel({ model: readOpenaiModel(payload) })

    return getLlmStatus()
  })

  // 짧은 프롬프트 한 번이라 큐를 거치지 않는다 (references/architecture.md "LLM 공급자")
  ipcMain.handle(IPC.llm.check, (): Promise<CheckLlmResponse> => checkLlm())

  // 응답 없음. 걸러서 outbox에 넣기만 한다 (references/telemetry.md "싱크별 규칙")
  ipcMain.handle(IPC.telemetry.track, (_event, payload) => trackRendererEvent(payload))

  registerDecisionHandlers()
}
