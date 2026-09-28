import { app } from 'electron'
import { info, messageOf, warn } from '../log'
import { TELEMETRY_CONFIG } from './config'
import { loadTelemetryContext } from './context'
import { collectEnvironment } from './environment'
import { isSentryActive, setSentryInstallId } from './sentry'
import { track } from './track'
import { startTelemetryWorker, stopTelemetryWorker } from './worker'

const enabledSinkNames = () =>
  [
    TELEMETRY_CONFIG.collector && '자체 서버',
    TELEMETRY_CONFIG.posthog && 'PostHog',
    isSentryActive() && 'Sentry'
  ].filter(Boolean)

/** renderer가 죽은 것은 renderer 안에서 알릴 수 없다 */
const watchRendererCrashes = () => {
  app.on('render-process-gone', (_event, _webContents, { reason, exitCode }) => {
    if (reason === 'clean-exit') return

    track({ name: 'render_process_gone', props: { reason, exitCode } })
  })
}

/**
 * DB가 열린 뒤 한 번 부른다. 설치 id를 준비하고 시작·환경 이벤트를 남긴 뒤 전송 워커를 돌린다.
 * 실패해도 앱 시작을 막지 않는다 (references/telemetry.md "흐름").
 */
export const startTelemetry = async () => {
  try {
    const { installId, isFirstRun } = loadTelemetryContext()
    setSentryInstallId(installId)
    info(`사용 정보 수집: ${enabledSinkNames().join(', ') || '켜진 싱크 없음'}`)

    watchRendererCrashes()
    track({ name: 'app_started', props: { isFirstRun } })
    track({ name: 'environment', props: await collectEnvironment() })
    startTelemetryWorker()
  } catch (caught) {
    warn(`사용 정보 수집 시작 실패: ${messageOf(caught)}`)
  }
}

export { stopTelemetryWorker }
