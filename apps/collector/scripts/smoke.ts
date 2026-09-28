/**
 * 배포(또는 로컬) 수집 서버가 계약대로 받는지 끝까지 확인한다 (telemetry.md "환경").
 * 이벤트 1개, 회의 스냅샷 1개, 녹음 두 조각과 어긋난 조각(409)을 보내고 응답을 검사한다.
 *
 * 저장소 루트에서: COLLECTOR_SMOKE_TOKEN=<팀 토큰> pnpm collector:smoke https://collector.example.com
 */
import { randomBytes, randomUUID } from 'node:crypto'
import {
  collectorAuthValue,
  eventsPath,
  formatContentRange,
  meetingPath,
  recordingPath
} from '@meeting-stt/telemetry/collector'
import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import {
  MEETING_SNAPSHOT_SCHEMA_VERSION,
  type MeetingSnapshot
} from '@meeting-stt/telemetry/snapshot'

/** 스모크 전용 설치 id. 운영 데이터에서 이 id를 걸러 낸다 */
const SMOKE_INSTALL_ID = '00000000-0000-4000-8000-000000000000'
const SMOKE_APP_VERSION = 'smoke'
const RECORDING_BYTES = 64 * 1024
const FIRST_CHUNK_BYTES = 40 * 1024
const OFFSET_MISMATCH_STATUS = 409

const baseUrl = (process.argv[2] ?? '').replace(/\/+$/, '')
const token = process.env.COLLECTOR_SMOKE_TOKEN ?? ''

const write = (line: string) => process.stdout.write(`${line}\n`)

interface Check {
  name: string
  run: () => Promise<string | null>
}

const request = (urlPath: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}${urlPath}`, {
    ...init,
    headers: { Authorization: collectorAuthValue(token), ...init.headers }
  })

const sendJson = (method: string, urlPath: string, body: unknown) =>
  request(urlPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

/** 응답이 기대와 다르면 한 줄 설명을, 맞으면 null을 돌려준다 */
const expectJson = async ({
  response,
  status,
  body
}: {
  response: Response
  status: number
  body: Record<string, unknown>
}) => {
  const text = await response.text()
  if (response.status !== status) return `상태 ${response.status} (기대 ${status}): ${text}`
  const parsed = JSON.parse(text) as Record<string, unknown>
  const mismatch = Object.entries(body).find(([key, value]) => parsed[key] !== value)
  return mismatch
    ? `${mismatch[0]}=${String(parsed[mismatch[0]])} (기대 ${String(mismatch[1])})`
    : null
}

const meetingId = `smoke-${Date.now()}`
const wav = randomBytes(RECORDING_BYTES)
const now = Date.now()

const putChunk = ({ start, end }: { start: number; end: number }) =>
  request(recordingPath({ installId: SMOKE_INSTALL_ID, meetingId }), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': formatContentRange({ start, end, total: RECORDING_BYTES })
    },
    body: wav.subarray(start, end + 1)
  })

const envelope: TelemetryEnvelope = {
  id: randomUUID(),
  name: 'app_started',
  category: 'usage',
  props: { isFirstRun: false },
  occurredAt: now,
  installId: SMOKE_INSTALL_ID,
  sessionId: randomUUID(),
  appVersion: SMOKE_APP_VERSION
}

const snapshot: MeetingSnapshot = {
  schemaVersion: MEETING_SNAPSHOT_SCHEMA_VERSION,
  installId: SMOKE_INSTALL_ID,
  meetingId,
  sentAt: now,
  appVersion: SMOKE_APP_VERSION,
  meeting: {
    title: '스모크 테스트',
    createdAt: now,
    durationSec: 2,
    status: 'done',
    errorMessage: null,
    speakerCount: 1,
    summary: null,
    refinedAt: null,
    hasAudio: true
  },
  utterances: [
    { id: 'u1', speakerLabel: 'S0', startSec: 0, endSec: 2, text: '스모크', originalText: null }
  ],
  speakers: [{ label: 'S0', displayName: null }],
  refinePairs: [],
  glossaryTerms: []
}

const CHECKS: Check[] = [
  {
    name: 'GET /health',
    run: async () =>
      expectJson({ response: await fetch(`${baseUrl}/health`), status: 200, body: { ok: true } })
  },
  {
    name: '토큰 없는 요청은 401',
    run: async () => {
      const response = await fetch(`${baseUrl}${eventsPath()}`, { method: 'POST' })
      return response.status === 401 ? null : `상태 ${response.status} (기대 401)`
    }
  },
  {
    name: 'POST /v1/events',
    run: async () =>
      expectJson({
        response: await sendJson('POST', eventsPath(), { events: [envelope] }),
        status: 200,
        body: { accepted: 1 }
      })
  },
  {
    name: 'PUT /v1/meetings',
    run: async () =>
      expectJson({
        response: await sendJson(
          'PUT',
          meetingPath({ installId: SMOKE_INSTALL_ID, meetingId }),
          snapshot
        ),
        status: 200,
        body: { isApplied: true }
      })
  },
  {
    name: 'PUT /v1/recordings 첫 조각',
    run: async () =>
      expectJson({
        response: await putChunk({ start: 0, end: FIRST_CHUNK_BYTES - 1 }),
        status: 200,
        body: { receivedBytes: FIRST_CHUNK_BYTES }
      })
  },
  {
    name: 'PUT /v1/recordings 어긋난 조각은 409',
    run: async () =>
      expectJson({
        response: await putChunk({ start: FIRST_CHUNK_BYTES + 1, end: RECORDING_BYTES - 1 }),
        status: OFFSET_MISMATCH_STATUS,
        body: { receivedBytes: FIRST_CHUNK_BYTES }
      })
  },
  {
    name: 'PUT /v1/recordings 마지막 조각',
    run: async () =>
      expectJson({
        response: await putChunk({ start: FIRST_CHUNK_BYTES, end: RECORDING_BYTES - 1 }),
        status: 200,
        body: { receivedBytes: RECORDING_BYTES }
      })
  }
]

const main = async () => {
  if (!baseUrl || !token) {
    write('사용법: COLLECTOR_SMOKE_TOKEN=<팀 토큰> pnpm collector:smoke <서버 주소>')
    process.exitCode = 1
    return
  }
  write(`${baseUrl} 확인 (설치 id ${SMOKE_INSTALL_ID}, 회의 ${meetingId})`)
  let failures = 0
  for (const check of CHECKS) {
    const problem = await check.run().catch((caught: unknown) => `요청 실패: ${String(caught)}`)
    failures += problem ? 1 : 0
    write(`${problem ? '✗' : '✓'} ${check.name}${problem ? ` — ${problem}` : ''}`)
  }
  write(failures === 0 ? '전부 통과' : `${failures}개 실패`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
