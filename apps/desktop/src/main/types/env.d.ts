/**
 * 빌드 때 electron-vite가 치환하는 사용 정보 수집 설정 (references/telemetry.md "빌드 주입 값").
 * 값이 없으면 그 싱크만 꺼진다.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_COLLECTOR_URL?: string
  readonly MAIN_VITE_COLLECTOR_TEAM_TOKEN?: string
  readonly MAIN_VITE_POSTHOG_KEY?: string
  readonly MAIN_VITE_POSTHOG_HOST?: string
  readonly MAIN_VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
