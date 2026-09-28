import { mkdtemp, rm } from 'node:fs/promises'
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
import { MEETING_SNAPSHOT_SCHEMA_VERSION } from '@meeting-stt/telemetry/snapshot'

import { createApp } from '../app'
import { openDatabase } from '../db'
import { parseRangeHeader } from './recordingStream'

const TEAM_TOKEN = 'a'.repeat(32)
const ADMIN_PASSWORD = 'admin-password-1234'
const INSTALL_ID = '11111111-2222-4333-8444-555555555555'
const MEETING_ID = 'meeting-1'
const NOW_MS = 1_790_000_000_000
const MEETING_PAGE = `/admin/meetings/team-a/${INSTALL_ID}/${MEETING_ID}`

let db: DatabaseSync
let recordingsDir: string

const appWith = (isAdminEnabled: boolean) =>
  createApp({
    db,
    recordingsDir,
    teamTokens: [{ teamId: 'team-a', token: TEAM_TOKEN }],
    admin: isAdminEnabled ? { password: ADMIN_PASSWORD, designCss: ':root{}' } : undefined,
    now: () => NOW_MS
  })

beforeEach(async () => {
  db = openDatabase(':memory:')
  recordingsDir = await mkdtemp(path.join(tmpdir(), 'collector-admin-test-'))
})

afterEach(async () => {
  db.close()
  await rm(recordingsDir, { recursive: true, force: true })
})

const adminHeaders = {
  Authorization: `Basic ${Buffer.from(`admin:${ADMIN_PASSWORD}`).toString('base64')}`
}
const teamHeaders = { Authorization: collectorAuthValue(TEAM_TOKEN) }

const seed = async (app: ReturnType<typeof createApp>) => {
  await app.request(eventsPath(), {
    method: 'POST',
    headers: { ...teamHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          id: crypto.randomUUID(),
          name: 'job_failed',
          category: 'error',
          props: { meetingId: MEETING_ID, job: 'pipeline', stage: 'stt', message: 'spawn 실패' },
          occurredAt: NOW_MS,
          installId: INSTALL_ID,
          sessionId: crypto.randomUUID(),
          appVersion: '0.2.5'
        }
      ]
    })
  })
  await app.request(meetingPath({ installId: INSTALL_ID, meetingId: MEETING_ID }), {
    method: 'PUT',
    headers: { ...teamHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: MEETING_SNAPSHOT_SCHEMA_VERSION,
      installId: INSTALL_ID,
      meetingId: MEETING_ID,
      sentAt: NOW_MS,
      appVersion: '0.2.5',
      meeting: {
        title: '주간 <회의>',
        createdAt: NOW_MS,
        durationSec: 75,
        status: 'done',
        errorMessage: null,
        speakerCount: 2,
        summary: '요약 본문',
        refinedAt: null,
        hasAudio: true
      },
      utterances: [
        {
          id: 'u1',
          speakerLabel: 'S0',
          startSec: 0,
          endSec: 2,
          text: '<b>안녕</b>',
          originalText: '안령'
        }
      ],
      speakers: [{ label: 'S0', displayName: '건규' }],
      refinePairs: [],
      glossaryTerms: []
    })
  })
  const wav = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
  await app.request(recordingPath({ installId: INSTALL_ID, meetingId: MEETING_ID }), {
    method: 'PUT',
    headers: {
      ...teamHeaders,
      'Content-Range': formatContentRange({ start: 0, end: wav.length - 1, total: wav.length })
    },
    body: wav
  })
}

describe('관리자 페이지 켜기·인증', () => {
  it('비밀번호가 없으면 /admin이 없다', async () => {
    const response = await appWith(false).request('/admin', { headers: adminHeaders })
    expect(response.status).toBe(404)
  })

  it('Basic 인증이 없거나 틀리면 401, 팀 토큰으로는 들어올 수 없다', async () => {
    const app = appWith(true)
    const missing = await app.request('/admin')
    const teamToken = await app.request('/admin', { headers: teamHeaders })
    expect(missing.status).toBe(401)
    expect(teamToken.status).toBe(401)
  })

  it('응답은 캐시하지 않고 스크립트를 막는다', async () => {
    const response = await appWith(true).request('/admin', { headers: adminHeaders })
    expect(response.status).toBe(200)
    expect(await response.text()).toMatch(/^<!doctype html>/)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'none'")
  })
})

describe('관리자 화면', () => {
  it('개요·목록 화면이 받은 데이터를 보여 준다', async () => {
    const app = appWith(true)
    await seed(app)
    const pages = ['/admin', '/admin/events?category=error', '/admin/installs', '/admin/meetings']
    const bodies = await Promise.all(
      pages.map(async (page) => {
        const response = await app.request(page, { headers: adminHeaders })
        expect(response.status).toBe(200)
        return response.text()
      })
    )
    expect(bodies[0]).toContain('job_failed')
    expect(bodies[1]).toContain('spawn 실패')
    expect(bodies[2]).toContain(INSTALL_ID.slice(0, 8))
    expect(bodies[3]).toContain(MEETING_PAGE)
  })

  it('회의 상세는 화자 이름을 붙이고 발화 HTML을 이스케이프한다', async () => {
    const app = appWith(true)
    await seed(app)
    const html = await (await app.request(MEETING_PAGE, { headers: adminHeaders })).text()
    expect(html).toContain('건규')
    expect(html).toContain('&lt;b&gt;안녕&lt;/b&gt;')
    expect(html).not.toContain('<b>안녕</b>')
    expect(html).toContain('안령')
    expect(html).toContain('요약 본문')
    expect(html).toContain('recording.wav')
  })

  it('없는 회의나 경로 문자가 섞인 id는 404', async () => {
    const app = appWith(true)
    const missing = await app.request('/admin/meetings/team-a/x/y', { headers: adminHeaders })
    const traversal = await app.request('/admin/meetings/team-a/..%2F/y', { headers: adminHeaders })
    expect(missing.status).toBe(404)
    expect(traversal.status).toBe(404)
  })

  it('녹음은 Range 요청에 206으로 일부만 준다', async () => {
    const app = appWith(true)
    await seed(app)
    const full = await app.request(`${MEETING_PAGE}/recording.wav`, { headers: adminHeaders })
    expect(full.status).toBe(200)
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    )

    const partial = await app.request(`${MEETING_PAGE}/recording.wav`, {
      headers: { ...adminHeaders, Range: 'bytes=2-4' }
    })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('Content-Range')).toBe('bytes 2-4/8')
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(new Uint8Array([3, 4, 5]))
  })

  it('스냅샷 JSON을 원본 그대로 내려준다', async () => {
    const app = appWith(true)
    await seed(app)
    const response = await app.request(`${MEETING_PAGE}/snapshot.json`, { headers: adminHeaders })
    const body: unknown = await response.json()
    expect(body).toMatchObject({ meetingId: MEETING_ID, meeting: { title: '주간 <회의>' } })
  })
})

describe('parseRangeHeader', () => {
  it('열린 범위·끝에서 세는 범위·범위 밖을 구분한다', () => {
    expect(parseRangeHeader({ header: 'bytes=5-', size: 10 })).toEqual({ start: 5, end: 9 })
    expect(parseRangeHeader({ header: 'bytes=-3', size: 10 })).toEqual({ start: 7, end: 9 })
    expect(parseRangeHeader({ header: 'bytes=20-30', size: 10 })).toBe('unsatisfiable')
    expect(parseRangeHeader({ header: undefined, size: 10 })).toBe(null)
  })
})
