import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC, type RecordingCommandEvent } from '@shared/ipc'
import { warn } from '../log'

/** createHashRouter가 읽는 경로. 앞의 '/'가 없으면 '#recorder'가 되어 라우트가 맞지 않는다 */
const RECORDER_ROUTE_HASH = '/recorder'

/**
 * 오디오 그래프의 유일한 소유자. 화면에 보이지 않는다 — 메인 창을 닫아도 메뉴바·전역 단축키로
 * 녹음할 수 있어야 해서 그래프를 메인 창에 두지 않는다 (references/architecture.md "녹음 호스트 창").
 */
let recorderWindow: BrowserWindow | null = null

const getRecorderWindow = () => (recorderWindow?.isDestroyed() ? null : recorderWindow)

export const createRecorderWindow = () => {
  const window = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // 숨은 창은 타이머·메시지 처리가 throttling된다. 그래프 소유자라 꺼야 한다 (references/pitfalls.md)
      backgroundThrottling: false
    }
  })

  window.on('closed', () => {
    recorderWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${RECORDER_ROUTE_HASH}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: RECORDER_ROUTE_HASH })
  }

  recorderWindow = window

  return window
}

/**
 * 전역 단축키·Tray·메인 창의 요청을 그래프 소유자에게 넘긴다.
 * main → renderer → main으로 한 바퀴 돌지만 `getUserMedia`가 renderer 전용이라 피할 수 없다.
 */
export const requestRecordingCommand = (event: RecordingCommandEvent) => {
  const window = getRecorderWindow()
  if (!window) {
    warn('녹음 호스트 창이 없어 녹음 명령을 전달하지 못했습니다')

    return
  }

  window.webContents.send(IPC.events.recordingCommand, event)
}
