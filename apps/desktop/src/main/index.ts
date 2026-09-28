import { app, BrowserWindow, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import type {
  PipelineProgressEvent,
  RecordingStateEvent,
  DecisionProgressEvent,
  RefineProgressEvent,
  SummaryProgressEvent,
  UpdateAvailableEvent
} from '@shared/ipc'
import { IPC } from '@shared/ipc'
import {
  finalizeActiveRecording,
  isRecording,
  recordingsDir,
  setRecordingStateListener
} from './audio/session'
import { handleMeetingAudioProtocol, registerMeetingAudioScheme } from './audio/playback'
import { closeDb } from './db/connection'
import { failStaleDecisions, failStaleMeetings } from './db/meetings'
import { getAppSettings, getWhisperModelId } from './db/settings'
import { setCurrentLocale } from './locale'
import { applyLightTheme } from './theme'
import { registerIpcHandlers } from './ipc/handlers'
import { error as logError, info, messageOf, warn } from './log'
import { setMeetingsChangedListener } from './meetingsChanged'
import { setSelectedWhisperModelId } from './models/paths'
import {
  setPipelineProgressListener,
  setDecisionProgressListener,
  setRefineProgressListener,
  setSummaryProgressListener
} from './pipeline/queue'
import { removeStalePipelineArtifacts } from './pipeline/run'
import { initSentry } from './telemetry/sentry'
import { startTelemetry, stopTelemetryWorker } from './telemetry/start'
import { checkForUpdates } from './updater'
import { createMainWindow, showMainWindow } from './windows/main'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './windows/shortcuts'
import { createTray, destroyTray, refreshTray } from './windows/tray'
import { createRecorderWindow } from './windows/recorder'

/**
 * 로컬 앱이라 마이크 외의 권한 요청은 받지 않는다.
 * 확인 핸들러도 같이 두는 이유는 `enumerateDevices`가 장치 라벨을 줄지 이 결과로 정하기 때문이다
 * (references/architecture.md "마이크 입력 장치와 테스트")
 */
const restrictPermissions = () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => permission === 'media'
  )
}

const broadcast = ({ channel, event }: { channel: string; event: unknown }) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, event)
  })
}

const broadcastProgress = (event: PipelineProgressEvent) =>
  broadcast({ channel: IPC.events.progress, event })

const broadcastSummaryProgress = (event: SummaryProgressEvent) =>
  broadcast({ channel: IPC.events.summary, event })

const broadcastRefineProgress = (event: RefineProgressEvent) =>
  broadcast({ channel: IPC.events.refine, event })

const broadcastDecisionProgress = (event: DecisionProgressEvent) =>
  broadcast({ channel: IPC.events.decisions, event })

/** 녹음 상태는 녹음 호스트·메인 창·메뉴바가 같은 값을 봐야 한다 (references/architecture.md) */
const broadcastRecordingState = (event: RecordingStateEvent) => {
  broadcast({ channel: IPC.events.recordingState, event })
  refreshTray()
}

/**
 * 설정에서 켠 사용자만, 창이 뜬 직후 한 번 확인한다. 새 버전이 있으면 알리기만 하고
 * 내려받기는 사용자가 배너에서 요청한다 (references/distribution.md 7절).
 */
const notifyUpdateIfAvailable = async () => {
  const version = await checkForUpdates({ isEnabled: getAppSettings().isUpdateCheckEnabled })
  if (!version) return

  const event: UpdateAvailableEvent = { version }
  broadcast({ channel: IPC.events.updateAvailable, event })
}

/** 이전 실행이 녹음·처리 중에 죽은 흔적을 정리한다. 실패해도 앱은 뜬다 */
const cleanupPreviousRun = async () => {
  const cleaned = failStaleMeetings()
  if (cleaned) info(`비정상 종료로 남은 회의 ${cleaned}건을 오류로 정리했습니다`)
  // 켜자마자 GPU·외부 API를 쓰지 않도록 다시 돌리지 않고 실패로 보인다 (references/decisions.md "흐름")
  const staleDecisions = failStaleDecisions()
  if (staleDecisions) info(`중단된 결정 추출 ${staleDecisions}건을 오류로 정리했습니다`)

  try {
    const removed = await removeStalePipelineArtifacts({ dir: recordingsDir() })
    if (removed) info(`남은 파이프라인 임시 파일 ${removed}개를 지웠습니다`)
  } catch (caught) {
    warn(`파이프라인 임시 파일 정리 실패: ${messageOf(caught)}`)
  }
}

// 네이티브 크래시 수집은 ready 전에 켜야 한다 (references/telemetry.md "싱크별 규칙")
initSentry()

// 커스텀 스킴 권한은 ready 전에만 줄 수 있다
registerMeetingAudioScheme()

// 두 인스턴스가 같은 DB를 열면 나중에 뜬 쪽의 시작 정리가 처리 중 회의를 오류로 덮어쓴다 (references/distribution.md 9절)
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

// 녹음 호스트 창이 먼저 잡힐 수 있어 창 목록의 0번을 쓰지 않는다 (references/pitfalls.md)
app.on('second-instance', () => showMainWindow())

app.whenReady().then(async () => {
  // quit()은 비동기라 ready가 먼저 올 수 있다. 두 번째 인스턴스는 DB를 열지 않는다
  if (!isPrimaryInstance) return

  // 팀 테스트 빌드는 공개 빌드와 appId를 가른다 (references/telemetry.md "빌드 분리")
  electronApp.setAppUserModelId('com.meetingstt.team')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  restrictPermissions()
  handleMeetingAudioProtocol()
  registerIpcHandlers()
  setPipelineProgressListener(broadcastProgress)
  setSummaryProgressListener(broadcastSummaryProgress)
  setRefineProgressListener(broadcastRefineProgress)
  setDecisionProgressListener(broadcastDecisionProgress)
  setRecordingStateListener(broadcastRecordingState)
  setMeetingsChangedListener(() => broadcast({ channel: IPC.events.meetingsChanged, event: null }))
  // 온보딩에서 고른 모델을 런타임 선택값으로 넣는다. 이후 파일명은 models/paths.ts만 정한다
  setSelectedWhisperModelId(getWhisperModelId())
  // main의 문구 언어. 이후에는 settings:update 핸들러가 바꾼다 (references/architecture.md "UI 언어")
  setCurrentLocale(getAppSettings().locale)
  // 창을 만들기 전에 넣어야 첫 화면부터 라이트로 뜬다. 다크 모드는 없다 (references/architecture.md "다크 모드 없음")
  applyLightTheme()
  await cleanupPreviousRun()
  await startTelemetry()

  const mainWindow = createMainWindow()
  createRecorderWindow()
  createTray()
  registerGlobalShortcuts()

  mainWindow.once('ready-to-show', () => {
    void notifyUpdateIfAvailable()
  })

  app.on('activate', () => showMainWindow())
})

// 녹음 호스트 창이 남아 있어 이 이벤트는 오지 않는다. macOS 전용이라 종료는 메뉴바·⌘Q가 담당한다
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * 화면 이동으로 녹음이 정지되지 않게 되면서(Phase 5-3) 헤더 확정의 마지막 기회가 종료 시점이다.
 * 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
 */
let isFinalizingOnQuit = false

app.on('before-quit', (event) => {
  if (isFinalizingOnQuit || !isRecording()) return

  event.preventDefault()
  isFinalizingOnQuit = true
  finalizeActiveRecording()
    .then(() => info('종료 전에 진행 중이던 녹음을 저장했습니다'))
    .catch((caught) => logError(`종료 중 녹음 마무리 실패: ${messageOf(caught)}`))
    .finally(() => app.quit())
})

app.on('will-quit', () => {
  stopTelemetryWorker()
  unregisterGlobalShortcuts()
  destroyTray()
  closeDb()
})
