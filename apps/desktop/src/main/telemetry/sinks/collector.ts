import type { EventBatch, TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import type { MeetingSnapshot } from '@meeting-stt/telemetry/snapshot'
import {
  COLLECTOR_AUTH_HEADER,
  collectorAuthValue,
  eventsPath,
  formatContentRange,
  meetingPath,
  recordingPath
} from '@meeting-stt/telemetry/collector'
import { TELEMETRY_CONFIG } from '../config'
import { sendHttp } from '../http'

/** 자체 수집 서버 어댑터. 계약은 `@meeting-stt/telemetry/collector` (references/telemetry.md "전송 계약") */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const requireConfig = () => {
  const config = TELEMETRY_CONFIG.collector
  if (!config) throw new Error('수집 서버 설정이 없습니다')

  return config
}

const authHeaders = () => ({
  [COLLECTOR_AUTH_HEADER]: collectorAuthValue(requireConfig().teamToken)
})

const urlOf = (path: string) => `${requireConfig().baseUrl}${path}`

export const sendCollectorEvents = ({ events }: { events: TelemetryEnvelope[] }) => {
  const batch: EventBatch = { events }

  return sendHttp({
    url: urlOf(eventsPath()),
    method: 'POST',
    headers: { ...authHeaders(), ...JSON_HEADERS },
    body: JSON.stringify(batch)
  })
}

export const putCollectorSnapshot = ({ snapshot }: { snapshot: MeetingSnapshot }) =>
  sendHttp({
    url: urlOf(meetingPath(snapshot)),
    method: 'PUT',
    headers: { ...authHeaders(), ...JSON_HEADERS },
    body: JSON.stringify(snapshot)
  })

interface MeetingTargetParams {
  installId: string
  meetingId: string
}

export const deleteCollectorMeeting = (target: MeetingTargetParams) =>
  sendHttp({ url: urlOf(meetingPath(target)), method: 'DELETE', headers: authHeaders() })

interface PutRecordingChunkParams extends MeetingTargetParams {
  bytes: Uint8Array<ArrayBuffer>
  start: number
  total: number
}

export const putCollectorRecordingChunk = ({
  installId,
  meetingId,
  bytes,
  start,
  total
}: PutRecordingChunkParams) =>
  sendHttp({
    url: urlOf(recordingPath({ installId, meetingId })),
    method: 'PUT',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/octet-stream',
      'Content-Range': formatContentRange({ start, end: start + bytes.byteLength - 1, total })
    },
    body: bytes
  })
