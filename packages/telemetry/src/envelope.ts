import type { TelemetryCategory, TelemetryPropValue, TelemetryProps } from './events'

/**
 * 전송 단위. 이벤트 하나에 설치·실행 식별자를 붙인 것이다.
 * 자체 서버는 이 모양 그대로 받고, PostHog 어댑터는 이것을 PostHog 형식으로 옮긴다.
 */
export interface TelemetryEnvelope {
  /** 이벤트 고유 id (UUID). 재전송으로 같은 이벤트가 두 번 가도 서버가 걸러낼 수 있게 한다 */
  id: string
  name: string
  category: TelemetryCategory
  props: TelemetryProps
  /** epoch ms */
  occurredAt: number
  installId: string
  /** 앱 실행 한 번마다 새로 만드는 UUID */
  sessionId: string
  appVersion: string
}

export interface EventBatch {
  events: TelemetryEnvelope[]
}

/** renderer가 보낸 props의 문자열 상한. 긴 문자열 슬롯으로 회의 내용이 새지 않게 한다 (references/telemetry.md) */
export const TELEMETRY_PROP_MAX_LENGTH = 80

/** renderer가 보낸 props에 남길 키 개수 상한 */
export const TELEMETRY_PROP_MAX_KEYS = 20

const isPropValue = (value: unknown): value is TelemetryPropValue =>
  value === null ||
  typeof value === 'boolean' ||
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value))

/**
 * 신뢰할 수 없는 props를 정리한다. 원시값이 아닌 값은 버리고 긴 문자열은 자른다.
 * 키 순서대로 상한까지만 남긴다.
 */
export const sanitizeProps = (value: unknown): TelemetryProps => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const entries = Object.entries(value)
    .filter((entry): entry is [string, TelemetryPropValue] => isPropValue(entry[1]))
    .slice(0, TELEMETRY_PROP_MAX_KEYS)
    .map(([key, prop]) => [
      key.slice(0, TELEMETRY_PROP_MAX_LENGTH),
      typeof prop === 'string' ? prop.slice(0, TELEMETRY_PROP_MAX_LENGTH) : prop
    ])

  return Object.fromEntries(entries)
}
