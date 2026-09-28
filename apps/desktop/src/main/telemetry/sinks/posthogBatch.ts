import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'

/**
 * envelope를 PostHog `/batch/` 본문으로 옮긴다. 사람 프로필을 만들지 않고(`$process_person_profile: false`),
 * 설치 id를 distinct_id로 쓴다. `uuid`로 재전송 중복을 PostHog가 걸러낸다 (references/telemetry.md "싱크별 규칙").
 */
export const toPosthogBatch = ({
  apiKey,
  envelopes
}: {
  apiKey: string
  envelopes: TelemetryEnvelope[]
}) => ({
  api_key: apiKey,
  batch: envelopes.map((envelope) => ({
    uuid: envelope.id,
    event: envelope.name,
    timestamp: new Date(envelope.occurredAt).toISOString(),
    properties: {
      ...envelope.props,
      distinct_id: envelope.installId,
      $session_id: envelope.sessionId,
      $process_person_profile: false,
      category: envelope.category,
      app_version: envelope.appVersion
    }
  }))
})
