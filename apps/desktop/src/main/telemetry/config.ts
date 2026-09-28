const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

const read = (value: string | undefined) => value?.trim() || null

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '')

const collectorUrl = read(import.meta.env.MAIN_VITE_COLLECTOR_URL)
const collectorToken = read(import.meta.env.MAIN_VITE_COLLECTOR_TEAM_TOKEN)
const posthogKey = read(import.meta.env.MAIN_VITE_POSTHOG_KEY)

/**
 * 빌드에 주입된 싱크 설정. 값이 빠진 싱크는 null이고, 그 싱크의 outbox 행은 만들지 않는다
 * (references/telemetry.md "빌드 주입 값").
 */
export const TELEMETRY_CONFIG = {
  collector:
    collectorUrl && collectorToken
      ? { baseUrl: trimTrailingSlash(collectorUrl), teamToken: collectorToken }
      : null,
  posthog: posthogKey
    ? {
        apiKey: posthogKey,
        host: trimTrailingSlash(
          read(import.meta.env.MAIN_VITE_POSTHOG_HOST) ?? DEFAULT_POSTHOG_HOST
        )
      }
    : null,
  sentryDsn: read(import.meta.env.MAIN_VITE_SENTRY_DSN)
}

/** 녹음 업로드는 자체 서버가 있을 때만 한다. 없으면 원본 삭제는 기존 규칙(`audio.keep`)대로다 */
export const isRecordingUploadEnabled = () => TELEMETRY_CONFIG.collector !== null
