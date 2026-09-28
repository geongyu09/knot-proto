import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type CheckLlmResponse,
  type CheckUpdateResponse,
  type DecisionProgressEvent,
  type ExtractDecisionsRequest,
  type GetDecisionRequest,
  type GetDecisionResponse,
  type GetDecisionsResponse,
  type GetDecisionTypesResponse,
  type GetMeetingDecisionsRequest,
  type GetMeetingDecisionsResponse,
  type SearchDecisionsRequest,
  type SearchDecisionsResponse,
  type UpdateDecisionTypesRequest,
  type UpdateDecisionTypesResponse,
  type DeleteMeetingRequest,
  type ExportMeetingAudioRequest,
  type ExportMeetingAudioResponse,
  type ImportMeetingAudioResponse,
  type ReprocessMeetingRequest,
  type GetLlmStatusResponse,
  type SetLlmApiKeyRequest,
  type SetLlmApiKeyResponse,
  type SetLlmProviderRequest,
  type SetLlmProviderResponse,
  type SettingsChangedEvent,
  type SetOpenaiModelRequest,
  type SetOpenaiModelResponse,
  type DownloadModelsRequest,
  type DownloadModelsResponse,
  type DraftGlossaryRequest,
  type DraftGlossaryResponse,
  type GetGlossaryResponse,
  type GetMeetingRequest,
  type GetMeetingResponse,
  type GetMeetingsResponse,
  type GetRecordingStateResponse,
  type GetSettingsResponse,
  type MergeSpeakersRequest,
  type ControlRecordingRequest,
  type ModelDownloadProgressEvent,
  type ModelStatusResponse,
  type MutateMeetingResponse,
  type PipelineProgressEvent,
  type CreateSummaryRequest,
  type ReassignUtteranceRequest,
  type RevertUtteranceRefineRequest,
  type RecordingCommandEvent,
  type RecordingStateEvent,
  type ReportRecordingErrorRequest,
  type RenameMeetingRequest,
  type RenameSpeakerRequest,
  type RequestMicrophonePermissionResponse,
  type SearchMeetingsRequest,
  type SearchMeetingsResponse,
  type SendRecordingChunkRequest,
  type SetLiveTranscriptRequest,
  type SetRecordingPausedRequest,
  type SetSystemAudioRequest,
  type SetSpeakerCountRequest,
  type SetShortcutsSuspendedRequest,
  type StartRecordingRequest,
  type StartRecordingResponse,
  type StopRecordingRequest,
  type StopRecordingResponse,
  type RefineProgressEvent,
  type RunRefineRequest,
  type SummaryProgressEvent,
  type UpdateAvailableEvent,
  type UpdateGlossaryRequest,
  type UpdateGlossaryResponse,
  type UpdateSettingsRequest,
  type UpdateSettingsResponse,
  type UpdateUtteranceTextRequest,
  type TrackTelemetryRequest,
  type WriteClipboardTextRequest
} from '@shared/ipc'

// renderer에 노출할 API. ipcRenderer 객체 자체는 노출하지 않고
// 채널별로 타입이 붙은 함수만 여기에 추가한다 (src/shared/ipc.ts 기준).
const api = {
  recording: {
    requestPermission: (): Promise<RequestMicrophonePermissionResponse> =>
      ipcRenderer.invoke(IPC.recording.requestPermission),
    start: (payload: StartRecordingRequest): Promise<StartRecordingResponse> =>
      ipcRenderer.invoke(IPC.recording.start, payload),
    chunk: (payload: SendRecordingChunkRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.chunk, payload),
    stop: (payload: StopRecordingRequest): Promise<StopRecordingResponse> =>
      ipcRenderer.invoke(IPC.recording.stop, payload),
    state: (): Promise<GetRecordingStateResponse> => ipcRenderer.invoke(IPC.recording.state),
    control: (payload: ControlRecordingRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.control, payload),
    setSpeakerCount: (payload: SetSpeakerCountRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setSpeakerCount, payload),
    reportError: (payload: ReportRecordingErrorRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.recording.reportError, payload),
    setLiveTranscript: (payload: SetLiveTranscriptRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setLiveTranscript, payload),
    setSystemAudio: (payload: SetSystemAudioRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setSystemAudio, payload),
    setPaused: (payload: SetRecordingPausedRequest): Promise<GetRecordingStateResponse> =>
      ipcRenderer.invoke(IPC.recording.setPaused, payload)
  },
  shortcuts: {
    setSuspended: (payload: SetShortcutsSuspendedRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.shortcuts.setSuspended, payload)
  },
  meetings: {
    list: (): Promise<GetMeetingsResponse> => ipcRenderer.invoke(IPC.meetings.list),
    get: (payload: GetMeetingRequest): Promise<GetMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.get, payload),
    rename: (payload: RenameMeetingRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.rename, payload),
    delete: (payload: DeleteMeetingRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.meetings.delete, payload),
    search: (payload: SearchMeetingsRequest): Promise<SearchMeetingsResponse> =>
      ipcRenderer.invoke(IPC.meetings.search, payload),
    reprocess: (payload: ReprocessMeetingRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.meetings.reprocess, payload),
    exportAudio: (payload: ExportMeetingAudioRequest): Promise<ExportMeetingAudioResponse> =>
      ipcRenderer.invoke(IPC.meetings.exportAudio, payload),
    import: (): Promise<ImportMeetingAudioResponse> => ipcRenderer.invoke(IPC.meetings.import)
  },
  utterances: {
    updateText: (payload: UpdateUtteranceTextRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.utterances.updateText, payload),
    reassign: (payload: ReassignUtteranceRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.utterances.reassign, payload),
    revertRefine: (payload: RevertUtteranceRefineRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.utterances.revertRefine, payload)
  },
  speakers: {
    rename: (payload: RenameSpeakerRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.speakers.rename, payload),
    merge: (payload: MergeSpeakersRequest): Promise<MutateMeetingResponse> =>
      ipcRenderer.invoke(IPC.speakers.merge, payload)
  },
  settings: {
    get: (): Promise<GetSettingsResponse> => ipcRenderer.invoke(IPC.settings.get),
    update: (payload: UpdateSettingsRequest): Promise<UpdateSettingsResponse> =>
      ipcRenderer.invoke(IPC.settings.update, payload)
  },
  telemetry: {
    track: (payload: TrackTelemetryRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.telemetry.track, payload)
  },
  clipboard: {
    writeText: (payload: WriteClipboardTextRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.clipboard.writeText, payload)
  },
  summary: {
    create: (payload: CreateSummaryRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.summary.create, payload)
  },
  refine: {
    run: (payload: RunRefineRequest): Promise<void> => ipcRenderer.invoke(IPC.refine.run, payload)
  },
  decisions: {
    list: (): Promise<GetDecisionsResponse> => ipcRenderer.invoke(IPC.decisions.list),
    get: (payload: GetDecisionRequest): Promise<GetDecisionResponse> =>
      ipcRenderer.invoke(IPC.decisions.get, payload),
    ofMeeting: (payload: GetMeetingDecisionsRequest): Promise<GetMeetingDecisionsResponse> =>
      ipcRenderer.invoke(IPC.decisions.ofMeeting, payload),
    extract: (payload: ExtractDecisionsRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.decisions.extract, payload),
    search: (payload: SearchDecisionsRequest): Promise<SearchDecisionsResponse> =>
      ipcRenderer.invoke(IPC.decisions.search, payload)
  },
  decisionTypes: {
    get: (): Promise<GetDecisionTypesResponse> => ipcRenderer.invoke(IPC.decisionTypes.get),
    update: (payload: UpdateDecisionTypesRequest): Promise<UpdateDecisionTypesResponse> =>
      ipcRenderer.invoke(IPC.decisionTypes.update, payload)
  },
  glossary: {
    get: (): Promise<GetGlossaryResponse> => ipcRenderer.invoke(IPC.glossary.get),
    update: (payload: UpdateGlossaryRequest): Promise<UpdateGlossaryResponse> =>
      ipcRenderer.invoke(IPC.glossary.update, payload),
    draft: (payload: DraftGlossaryRequest): Promise<DraftGlossaryResponse> =>
      ipcRenderer.invoke(IPC.glossary.draft, payload)
  },
  llm: {
    status: (): Promise<GetLlmStatusResponse> => ipcRenderer.invoke(IPC.llm.status),
    setProvider: (payload: SetLlmProviderRequest): Promise<SetLlmProviderResponse> =>
      ipcRenderer.invoke(IPC.llm.setProvider, payload),
    setApiKey: (payload: SetLlmApiKeyRequest): Promise<SetLlmApiKeyResponse> =>
      ipcRenderer.invoke(IPC.llm.setApiKey, payload),
    setOpenaiModel: (payload: SetOpenaiModelRequest): Promise<SetOpenaiModelResponse> =>
      ipcRenderer.invoke(IPC.llm.setOpenaiModel, payload),
    check: (): Promise<CheckLlmResponse> => ipcRenderer.invoke(IPC.llm.check)
  },
  models: {
    status: (): Promise<ModelStatusResponse> => ipcRenderer.invoke(IPC.models.status),
    download: (payload: DownloadModelsRequest): Promise<DownloadModelsResponse> =>
      ipcRenderer.invoke(IPC.models.download, payload),
    downloadSummary: (): Promise<DownloadModelsResponse> =>
      ipcRenderer.invoke(IPC.models.downloadSummary)
  },
  update: {
    check: (): Promise<CheckUpdateResponse> => ipcRenderer.invoke(IPC.update.check),
    download: (): Promise<void> => ipcRenderer.invoke(IPC.update.download),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.update.install)
  },
  events: {
    onPipelineProgress: (listener: (event: PipelineProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: PipelineProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.progress, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.progress, handler)
      }
    },
    onSummaryProgress: (listener: (event: SummaryProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: SummaryProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.summary, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.summary, handler)
      }
    },
    onRefineProgress: (listener: (event: RefineProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RefineProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.refine, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.refine, handler)
      }
    },
    onDecisionProgress: (listener: (event: DecisionProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: DecisionProgressEvent) => listener(payload)
      ipcRenderer.on(IPC.events.decisions, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.decisions, handler)
      }
    },
    onModelDownloadProgress: (listener: (event: ModelDownloadProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: ModelDownloadProgressEvent) =>
        listener(payload)
      ipcRenderer.on(IPC.events.modelDownload, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.modelDownload, handler)
      }
    },
    onModelsChanged: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on(IPC.events.modelsChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.modelsChanged, handler)
      }
    },
    onRecordingState: (listener: (event: RecordingStateEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RecordingStateEvent) => listener(payload)
      ipcRenderer.on(IPC.events.recordingState, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.recordingState, handler)
      }
    },
    onRecordingCommand: (listener: (event: RecordingCommandEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: RecordingCommandEvent) => listener(payload)
      ipcRenderer.on(IPC.events.recordingCommand, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.recordingCommand, handler)
      }
    },
    onMeetingsChanged: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on(IPC.events.meetingsChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.meetingsChanged, handler)
      }
    },
    onUpdateAvailable: (listener: (event: UpdateAvailableEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: UpdateAvailableEvent) => listener(payload)
      ipcRenderer.on(IPC.events.updateAvailable, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.updateAvailable, handler)
      }
    },
    onSettingsChanged: (listener: (event: SettingsChangedEvent) => void) => {
      const handler = (_: IpcRendererEvent, payload: SettingsChangedEvent) => listener(payload)
      ipcRenderer.on(IPC.events.settingsChanged, handler)

      return () => {
        ipcRenderer.removeListener(IPC.events.settingsChanged, handler)
      }
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
