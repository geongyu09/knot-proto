import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import { TELEMETRY_CONFIG } from '../config'
import { sendHttp } from '../http'
import { toPosthogBatch } from './posthogBatch'

/** PostHog 어댑터. SDK 없이 `/batch/` 한 곳으로 보낸다 (references/telemetry.md "싱크별 규칙") */
export const sendPosthogEvents = ({ events }: { events: TelemetryEnvelope[] }) => {
  const config = TELEMETRY_CONFIG.posthog
  if (!config) throw new Error('PostHog 설정이 없습니다')

  return sendHttp({
    url: `${config.host}/batch/`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toPosthogBatch({ apiKey: config.apiKey, envelopes: events }))
  })
}
