import { describe, expect, it } from 'vitest'
import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import { toPosthogBatch } from './posthogBatch'

const envelope: TelemetryEnvelope = {
  id: 'e1',
  name: 'recording_started',
  category: 'usage',
  props: { isSystemAudio: true },
  occurredAt: Date.UTC(2026, 8, 28),
  installId: 'install-1',
  sessionId: 'session-1',
  appVersion: '0.2.5'
}

describe('toPosthogBatch', () => {
  it('설치 id를 distinct_id로, envelope id를 uuid로 쓴다', () => {
    const { api_key, batch } = toPosthogBatch({ apiKey: 'phc_key', envelopes: [envelope] })

    expect(api_key).toBe('phc_key')
    expect(batch[0]).toEqual({
      uuid: 'e1',
      event: 'recording_started',
      timestamp: '2026-09-28T00:00:00.000Z',
      properties: {
        isSystemAudio: true,
        distinct_id: 'install-1',
        $session_id: 'session-1',
        $process_person_profile: false,
        category: 'usage',
        app_version: '0.2.5'
      }
    })
  })

  it('props가 예약 속성을 덮어쓰지 못한다', () => {
    const { batch } = toPosthogBatch({
      apiKey: 'k',
      envelopes: [{ ...envelope, props: { distinct_id: 'spoofed' } }]
    })

    expect(batch[0].properties.distinct_id).toBe('install-1')
  })
})
