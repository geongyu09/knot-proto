import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

import { createApp } from './app'
import { openDatabase } from './db'

const TEAM_TOKEN = 'a'.repeat(32)
const INSTALL_ID = '11111111-2222-4333-8444-555555555555'
const MEETING_ID = 'meeting-1'
const NOW_MS = 1_790_000_000_000

let db: DatabaseSync
let recordingsDir: string
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  db = openDatabase(':memory:')
  recordingsDir = await mkdtemp(path.join(tmpdir(), 'collector-test-'))
  app = createApp({
    db,
    recordingsDir,
    teamTokens: [{ teamId: 'team-a', token: TEAM_TOKEN }],
    now: () => NOW_MS
  })
})

afterEach(async () => {
  db.close()
  await rm(recordingsDir, { recursive: true, force: true })
})

const authHeaders = { Authorization: collectorAuthValue(TEAM_TOKEN) }

const sendJson = (method: string, url: string, body: unknown) =>
  app.request(url, {
    method,
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

const envelopeOf = (overrides: Partial<TelemetryEnvelope> = {}): TelemetryEnvelope => ({
  id: crypto.randomUUID(),
  name: 'screen_viewed',
  category: 'usage',
  props: { screen: 'home' },
  occurredAt: NOW_MS,
  installId: INSTALL_ID,
  sessionId: crypto.randomUUID(),
  appVersion: '0.2.5',
  ...overrides
})

const snapshotOf = (overrides: Partial<MeetingSnapshot> = {}): MeetingSnapshot => ({
  schemaVersion: MEETING_SNAPSHOT_SCHEMA_VERSION,
  installId: INSTALL_ID,
  meetingId: MEETING_ID,
  sentAt: NOW_MS,
  appVersion: '0.2.5',
  meeting: {
    title: '주간 회의',
    createdAt: NOW_MS,
    durationSec: 60,
    status: 'done',
    errorMessage: null,
    speakerCount: 2,
    summary: null,
    refinedAt: null,
    hasAudio: true
  },
  utterances: [
    { id: 'u1', speakerLabel: 'S0', startSec: 0, endSec: 2, text: '안녕하세요', originalText: null }
  ],
  speakers: [{ label: 'S0', displayName: '건규' }],
  refinePairs: [],
  glossaryTerms: ['화자 분리'],
  ...overrides
})

describe('인증', () => {
  it('health는 토큰 없이 응답한다', async () => {
    const response = await app.request('/health')
    expect(response.status).toBe(200)
  })

  it('토큰이 없거나 틀리면 401', async () => {
    const missing = await app.request(eventsPath(), { method: 'POST' })
    const wrong = await app.request(eventsPath(), {
      method: 'POST',
      headers: { Authorization: collectorAuthValue('b'.repeat(32)) }
    })
    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
  })
})

describe('POST /v1/events', () => {
  it('저장하고, 같은 id를 다시 보내면 중복으로 센다', async () => {
    const events = [envelopeOf(), envelopeOf()]
    const first = await sendJson('POST', eventsPath(), { events })
    const retry = await sendJson('POST', eventsPath(), { events })

    expect(await first.json()).toEqual({ accepted: 2, duplicated: 0 })
    expect(await retry.json()).toEqual({ accepted: 0, duplicated: 2 })
    const row = db.prepare('SELECT team_id, name FROM events LIMIT 1').get()
    expect(row).toEqual({ team_id: 'team-a', name: 'screen_viewed' })
  })

  it('긴 문자열 props는 거절하지 않고 잘라 저장한다', async () => {
    const event = envelopeOf({
      name: 'job_failed',
      category: 'error',
      props: { message: 'x'.repeat(5000) }
    })
    const response = await sendJson('POST', eventsPath(), { events: [event] })
    expect(response.status).toBe(200)

    const row = db.prepare('SELECT props FROM events WHERE id = ?').get(event.id)
    const props = JSON.parse(String(row?.props)) as { message: string }
    expect(props.message).toHaveLength(2000)
  })

  it('category가 틀리거나 props에 객체가 있으면 400', async () => {
    const badCategory = envelopeOf({ category: 'content' as never })
    const nestedProps = { ...envelopeOf(), props: { utterances: ['회의 내용'] } }

    expect((await sendJson('POST', eventsPath(), { events: [badCategory] })).status).toBe(400)
    expect((await sendJson('POST', eventsPath(), { events: [nestedProps] })).status).toBe(400)
    expect((await sendJson('POST', eventsPath(), { events: [] })).status).toBe(400)
  })
})

describe('PUT·DELETE /v1/meetings', () => {
  const url = meetingPath({ installId: INSTALL_ID, meetingId: MEETING_ID })

  it('최신본으로 덮어쓰고 늦게 도착한 옛 스냅샷은 무시한다', async () => {
    const first = await sendJson('PUT', url, snapshotOf())
    const newer = await sendJson('PUT', url, snapshotOf({ sentAt: NOW_MS + 10 }))
    const stale = await sendJson('PUT', url, snapshotOf({ sentAt: NOW_MS + 5 }))

    expect(await first.json()).toEqual({ meetingId: MEETING_ID, isApplied: true, revision: 1 })
    expect(await newer.json()).toEqual({ meetingId: MEETING_ID, isApplied: true, revision: 2 })
    expect(await stale.json()).toEqual({ meetingId: MEETING_ID, isApplied: false, revision: 2 })
  })

  it('경로와 본문의 회의 id가 다르면 400', async () => {
    const response = await sendJson('PUT', url, snapshotOf({ meetingId: 'other' }))
    expect(response.status).toBe(400)
  })

  it('DELETE는 행을 지우지 않고 삭제 시각만 남긴다', async () => {
    await sendJson('PUT', url, snapshotOf())
    const response = await app.request(url, { method: 'DELETE', headers: authHeaders })

    expect(await response.json()).toEqual({ meetingId: MEETING_ID, isMarked: true })
    const row = db.prepare('SELECT deleted_at FROM meeting_snapshots').get()
    expect(row).toEqual({ deleted_at: NOW_MS })
  })
})

describe('PUT /v1/recordings', () => {
  const url = recordingPath({ installId: INSTALL_ID, meetingId: MEETING_ID })
  const wav = new Uint8Array(Array.from({ length: 10 }, (_, index) => index))

  const putChunk = (start: number, end: number) =>
    app.request(url, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Range': formatContentRange({ start, end, total: wav.length })
      },
      body: wav.slice(start, end + 1)
    })

  const finalPath = () => path.join(recordingsDir, 'team-a', INSTALL_ID, `${MEETING_ID}.wav`)

  it('조각을 이어 받아 완성본을 만든다', async () => {
    const first = await putChunk(0, 3)
    const second = await putChunk(4, 9)

    expect(await first.json()).toEqual({ receivedBytes: 4 })
    expect(await second.json()).toEqual({ receivedBytes: 10 })
    expect(new Uint8Array(await readFile(finalPath()))).toEqual(wav)
  })

  it('시작 위치가 서버와 다르면 409와 받은 바이트 수를 준다', async () => {
    await putChunk(0, 3)
    const skipped = await putChunk(6, 9)

    expect(skipped.status).toBe(409)
    expect(await skipped.json()).toEqual({ receivedBytes: 4 })
  })

  it('완성된 녹음을 다시 보내면 전체 크기로 성공 응답한다', async () => {
    await putChunk(0, 9)
    const again = await putChunk(0, 9)

    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ receivedBytes: 10 })
  })

  it('Content-Range가 없거나 본문 길이와 다르면 400', async () => {
    const missing = await app.request(url, { method: 'PUT', headers: authHeaders, body: wav })
    const mismatched = await app.request(url, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Range': formatContentRange({ start: 0, end: 3, total: 10 })
      },
      body: wav
    })
    expect(missing.status).toBe(400)
    expect(mismatched.status).toBe(400)
  })
})
