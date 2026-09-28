/**
 * 수집 서버 HTTP 계약 (references/telemetry.md "전송 계약"). 서버가 아직 없어 데스크탑이 따르는 규칙을 먼저 둔다.
 */

export const COLLECTOR_AUTH_HEADER = 'Authorization'

/** 녹음 업로드 조각 크기. 100분 회의(약 190MB)가 24조각이 된다 */
export const RECORDING_CHUNK_BYTES = 8 * 1024 * 1024

/** 서버가 가진 바이트 수와 조각 시작 위치가 다를 때의 상태 코드 */
export const RECORDING_OFFSET_MISMATCH_STATUS = 409

export const collectorAuthValue = (teamToken: string) => `Bearer ${teamToken}`

export const eventsPath = () => '/v1/events'

interface MeetingPathParams {
  installId: string
  meetingId: string
}

export const meetingPath = ({ installId, meetingId }: MeetingPathParams) =>
  `/v1/meetings/${encodeURIComponent(installId)}/${encodeURIComponent(meetingId)}`

export const recordingPath = ({ installId, meetingId }: MeetingPathParams) =>
  `/v1/recordings/${encodeURIComponent(installId)}/${encodeURIComponent(meetingId)}`

interface ContentRangeParams {
  start: number
  /** 이 조각의 마지막 바이트 위치(포함) */
  end: number
  total: number
}

export const formatContentRange = ({ start, end, total }: ContentRangeParams) =>
  `bytes ${start}-${end}/${total}`

const CONTENT_RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+)$/

/** 서버가 요청 헤더를 읽을 때 쓴다. 모양이 틀리거나 범위가 뒤집혔으면 null */
export const parseContentRange = (header: string): ContentRangeParams | null => {
  const match = CONTENT_RANGE_PATTERN.exec(header.trim())
  if (!match) return null

  const [start, end, total] = match.slice(1).map(Number)
  if (start > end || end >= total) return null

  return { start, end, total }
}

/** 녹음 업로드 응답 본문 */
export interface RecordingUploadResponse {
  receivedBytes: number
}

export const isRecordingUploadResponse = (value: unknown): value is RecordingUploadResponse =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).receivedBytes === 'number' &&
  Number.isInteger((value as Record<string, unknown>).receivedBytes) &&
  ((value as Record<string, unknown>).receivedBytes as number) >= 0
