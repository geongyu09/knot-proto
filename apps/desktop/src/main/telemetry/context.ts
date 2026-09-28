import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { ensureTelemetryInstallId } from '../db/settings'

/** 앱 실행 한 번마다 새로 만든다 */
const SESSION_ID = randomUUID()

let installIdCache: string | null = null

/** 설치 id를 읽고 없으면 만든다. DB가 열린 뒤에 부른다 */
export const loadTelemetryContext = () => {
  const { installId, isFirstRun } = ensureTelemetryInstallId()
  installIdCache = installId

  return { installId, isFirstRun }
}

export const telemetryContext = () => {
  installIdCache ??= ensureTelemetryInstallId().installId

  return { installId: installIdCache, sessionId: SESSION_ID, appVersion: app.getVersion() }
}
