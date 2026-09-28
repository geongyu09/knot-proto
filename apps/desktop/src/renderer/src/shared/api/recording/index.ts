import type {
  ControlRecordingRequest,
  ReportRecordingErrorRequest,
  SendRecordingChunkRequest,
  SetLiveTranscriptRequest,
  SetRecordingPausedRequest,
  SetSpeakerCountRequest,
  SetSystemAudioRequest,
  StartRecordingRequest,
  StopRecordingRequest
} from '@shared/ipc'

/**
 * @description 마이크 사용 권한을 요청합니다. macOS는 시스템 권한 창을 띄우고, 그 외 플랫폼은 항상 허용으로 응답합니다.
 * @returns 권한 허용 여부
 * @example
 * const isGranted = await requestMicrophonePermissionApi()
 */
export const requestMicrophonePermissionApi = async () => {
  const { isGranted } = await window.api.recording.requestPermission()

  return isGranted
}

/**
 * @description 녹음을 시작합니다. main이 회의 행과 WAV 파일을 만들고 회의 ID를 돌려줍니다.
 * @param sampleRate - renderer의 AudioContext가 실제로 쓰는 샘플레이트
 * @returns 새로 만들어진 회의 ID
 * @example
 * const meetingId = await startRecordingApi({ sampleRate: context.sampleRate })
 */
export const startRecordingApi = async ({ sampleRate }: StartRecordingRequest) => {
  const { meetingId } = await window.api.recording.start({ sampleRate })

  return meetingId
}

/**
 * @description 녹음 중인 회의에 PCM 청크를 보냅니다. main이 즉시 파일에 append하므로 renderer는 누적하지 않습니다.
 * @param meetingId - 회의 ID
 * @param pcm - AudioWorklet이 넘긴 Float32 PCM 원본 버퍼
 * @returns 없음
 * @example
 * await sendRecordingChunkApi({ meetingId, pcm })
 */
export const sendRecordingChunkApi = async ({ meetingId, pcm }: SendRecordingChunkRequest) => {
  await window.api.recording.chunk({ meetingId, pcm })
}

/**
 * @description 녹음을 정지합니다. main이 WAV 헤더를 확정하고 파이프라인 잡을 큐에 넣습니다.
 * 참석자 수는 main 세션에 보관된 값을 쓰므로 여기서 넘기지 않습니다.
 * @param meetingId - 회의 ID
 * @returns 정지 직후의 회의 정보
 * @example
 * const meeting = await stopRecordingApi({ meetingId })
 */
export const stopRecordingApi = async ({ meetingId }: StopRecordingRequest) =>
  window.api.recording.stop({ meetingId })

/**
 * @description 지금 녹음 중인지 조회합니다. 창이 늦게 열려 상태 이벤트를 놓쳤을 때 씁니다.
 * @returns 진행 중 회의 ID·시작 시각·레벨·참석자 수
 * @example
 * const state = await getRecordingStateApi()
 */
export const getRecordingStateApi = async () => window.api.recording.state()

/**
 * @description 녹음 시작·정지를 요청합니다. main이 오디오 그래프를 가진 녹음 호스트 창에 명령을 넘깁니다.
 * @param kind - 'start' | 'stop' | 'toggle'
 * @returns 없음
 * @example
 * await controlRecordingApi({ kind: 'start' })
 */
export const controlRecordingApi = async ({ kind }: ControlRecordingRequest) => {
  await window.api.recording.control({ kind })
}

/**
 * @description 참석자 수를 main 세션에 저장합니다. 두 창의 입력란이 같은 값을 보게 됩니다.
 * @param speakerCount - 참석자 수. 비우면(undefined) 화자를 자동으로 나눕니다
 * @returns 저장 직후의 녹음 상태
 * @example
 * await setSpeakerCountApi({ speakerCount: 4 })
 */
export const setSpeakerCountApi = async ({ speakerCount }: SetSpeakerCountRequest) =>
  window.api.recording.setSpeakerCount({ speakerCount })

/**
 * @description 녹음 호스트 창에서만 알 수 있는 녹음 실패(마이크 권한 등)를 main에 알립니다. 메인 창도 같은 안내를 봅니다.
 * @param message - 사용자에게 보여줄 한국어 안내
 * @returns 없음
 * @example
 * await reportRecordingErrorApi({ message: '마이크 사용 권한이 없습니다' })
 */
export const reportRecordingErrorApi = async ({ message }: ReportRecordingErrorRequest) => {
  await window.api.recording.reportError({ message })
}

/**
 * @description 녹음 화면을 파형과 라이브 받아쓰기 중 어느 보기로 둘지 main에 알립니다. 켜져 있는 동안만 main이 인식을 돌립니다.
 * @param isEnabled - true면 라이브 받아쓰기, false면 파형
 * @returns 바뀐 직후의 녹음 상태
 * @example
 * await setLiveTranscriptApi({ isEnabled: true })
 */
export const setLiveTranscriptApi = async ({ isEnabled }: SetLiveTranscriptRequest) =>
  window.api.recording.setLiveTranscript({ isEnabled })

/**
 * @description 온라인 회의 소리(스피커 출력)를 마이크와 함께 녹음할지 main에 알립니다. 켜면 main이 캡처 도구를 잠깐 돌려 시스템 권한 창을 띄웁니다.
 * @param isEnabled - true면 다음 녹음부터 상대방 소리를 함께 녹음
 * @returns 바뀐 직후의 녹음 상태. 켜기에 실패하면 `systemAudio.isEnabled`가 false이고 `errorMessage`가 실립니다
 * @example
 * const state = await setSystemAudioApi({ isEnabled: true })
 */
export const setSystemAudioApi = async ({ isEnabled }: SetSystemAudioRequest) =>
  window.api.recording.setSystemAudio({ isEnabled })

/**
 * @description 진행 중인 녹음을 일시정지하거나 재개합니다. 일시정지 동안의 소리는 회의록에 남지 않습니다.
 * @param isPaused - true면 일시정지, false면 재개
 * @returns 바뀐 직후의 녹음 상태
 * @example
 * await setRecordingPausedApi({ isPaused: true })
 */
export const setRecordingPausedApi = async ({ isPaused }: SetRecordingPausedRequest) =>
  window.api.recording.setPaused({ isPaused })
