import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import type { TelemetryProps } from '@meeting-stt/telemetry/events'
import { TELEMETRY_CONFIG } from './config'
import { DROPPED_SENTRY_INTEGRATIONS, shouldKeepBreadcrumb } from './sentryPolicy'

/** 팀 테스트 빌드임을 Sentry 화면에서 구분한다 */
const SENTRY_ENVIRONMENT = 'team-test'

let isSentryEnabled = false

/**
 * main에서만 초기화한다. 앱 ready 전에 불러야 네이티브 크래시 수집이 켜진다.
 * DSN이 빌드에 없으면 아무것도 하지 않는다 (references/telemetry.md "싱크별 규칙").
 */
export const initSentry = () => {
  const dsn = TELEMETRY_CONFIG.sentryDsn
  if (!dsn) return

  Sentry.init({
    dsn,
    release: `meeting-stt@${app.getVersion()}`,
    environment: SENTRY_ENVIRONMENT,
    sendDefaultPii: false,
    integrations: (defaults) =>
      defaults.filter(({ name }) => !DROPPED_SENTRY_INTEGRATIONS.includes(name)),
    beforeBreadcrumb: (breadcrumb) =>
      shouldKeepBreadcrumb(breadcrumb.category) ? breadcrumb : null
  })
  isSentryEnabled = true
}

export const isSentryActive = () => isSentryEnabled

/** 설치 id를 안 뒤에 붙인다. 사람 정보가 아니라 설치 식별자다 */
export const setSentryInstallId = (installId: string) => {
  if (isSentryEnabled) Sentry.setUser({ id: installId })
}

interface CaptureSentryEventParams {
  name: string
  message: string
  props: TelemetryProps
}

/** 오류 분류 이벤트를 Sentry 이슈로 올린다. 이벤트 이름으로 묶이도록 fingerprint를 준다 */
export const captureSentryEvent = ({ name, message, props }: CaptureSentryEventParams) => {
  if (!isSentryEnabled) return

  Sentry.captureMessage(message, {
    level: 'error',
    tags: { event: name },
    extra: props,
    fingerprint: [name, message]
  })
}
