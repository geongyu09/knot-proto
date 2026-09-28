import { existsSync } from 'node:fs'
import { Hono, type Context } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import type { Child } from 'hono/jsx'

import { recordingPathOf } from '../recordingFiles'
import { getRecording } from '../recordingStore'
import type { CollectorDeps } from '../types/collector'
import { isPathSegment } from '../validate'
import {
  getFilterOptions,
  getMeeting,
  getOverview,
  listEvents,
  listInstalls,
  listMeetings,
  type EventFilter
} from './adminQueries'
import { ADMIN_CSS } from './adminStyles'
import EventsPage from './EventsPage'
import InstallsPage from './InstallsPage'
import MeetingDetailPage from './MeetingDetailPage'
import MeetingsPage from './MeetingsPage'
import OverviewPage from './OverviewPage'
import { streamRecording } from './recordingStream'

export const ADMIN_USERNAME = 'admin'
const ADMIN_REALM = 'meeting-stt collector admin'
const MAX_PAGE = 10_000

/** 회의 원문이 캐시·검색 엔진에 남지 않게 하고, 스크립트는 아예 막는다 (telemetry.md "관리자 페이지") */
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; media-src 'self'; frame-ancestors 'none'"
}

/** 빈 문자열·경로 문자가 섞인 값은 필터에서 뺀다 */
const segmentParam = (c: Context, name: string) => {
  const value = c.req.query(name)?.trim()
  return value && isPathSegment(value) ? value : undefined
}

const textParam = (c: Context, name: string) => c.req.query(name)?.trim() || undefined

const pageParam = (c: Context) => {
  const page = Number(c.req.query('page'))
  return Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 0
}

const meetingKeyOf = (c: Context) => {
  const { teamId, installId, meetingId } = c.req.param()
  if (![teamId, installId, meetingId].every(isPathSegment)) return null
  return { teamId, installId, meetingId }
}

/** JSX로는 doctype을 쓸 수 없어 붙여 준다. 빠지면 quirks 모드라 표가 글자 크기를 상속하지 않는다 */
const renderPage = ({ c, page }: { c: Context; page: Child }) =>
  c.html(`<!doctype html>${String(page)}`)

const notFound = (c: Context) => c.text('없는 회의입니다', 404)

type AdminDeps = Pick<CollectorDeps, 'db' | 'recordingsDir' | 'now'> & {
  password: string
  designCss: string
}

/**
 * `/admin/*` 읽기 전용 관리자 페이지. HTTP Basic으로 막고, 서버 렌더링 HTML만 돌려준다.
 * 비밀번호가 설정되지 않으면 이 라우트를 붙이지 않는다 (app.ts).
 */
export const createAdminRoute = ({
  db,
  recordingsDir,
  password,
  designCss,
  now = Date.now
}: AdminDeps) => {
  const admin = new Hono()

  admin.use('*', async (c, next) => {
    await next()
    Object.entries(SECURITY_HEADERS).forEach(([name, value]) => c.header(name, value))
  })
  admin.use('*', basicAuth({ username: ADMIN_USERNAME, password, realm: ADMIN_REALM }))

  admin.get('/assets/base.css', (c) => c.body(designCss, 200, { 'Content-Type': 'text/css' }))
  admin.get('/assets/admin.css', (c) => c.body(ADMIN_CSS, 200, { 'Content-Type': 'text/css' }))

  admin.get('/', (c) =>
    renderPage({ c, page: <OverviewPage overview={getOverview({ db, now: now() })} /> })
  )

  admin.get('/events', (c) => {
    const filter: EventFilter = {
      teamId: segmentParam(c, 'teamId'),
      installId: segmentParam(c, 'installId'),
      name: textParam(c, 'name'),
      category: textParam(c, 'category')
    }
    const page = pageParam(c)
    const options = getFilterOptions(db)
    return renderPage({
      c,
      page: (
        <EventsPage
          result={listEvents({ db, filter, page })}
          filter={filter}
          page={page}
          teamIds={options.teamIds}
          names={options.names}
        />
      )
    })
  })

  admin.get('/installs', (c) =>
    renderPage({ c, page: <InstallsPage installs={listInstalls(db)} /> })
  )

  admin.get('/meetings', (c) => {
    const filter = { teamId: segmentParam(c, 'teamId'), installId: segmentParam(c, 'installId') }
    return renderPage({
      c,
      page: (
        <MeetingsPage
          meetings={listMeetings({ db, filter })}
          filter={filter}
          teamIds={getFilterOptions(db).teamIds}
        />
      )
    })
  })

  admin.get('/meetings/:teamId/:installId/:meetingId', (c) => {
    const key = meetingKeyOf(c)
    const detail = key ? getMeeting({ db, key }) : null
    if (!key || !detail) return notFound(c)
    return renderPage({ c, page: <MeetingDetailPage meetingKey={key} detail={detail} /> })
  })

  admin.get('/meetings/:teamId/:installId/:meetingId/snapshot.json', (c) => {
    const key = meetingKeyOf(c)
    const detail = key ? getMeeting({ db, key }) : null
    if (!key || !detail) return notFound(c)
    return c.body(detail.rawSnapshot, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${key.meetingId}.json"`
    })
  })

  admin.get('/meetings/:teamId/:installId/:meetingId/recording.wav', async (c) => {
    const key = meetingKeyOf(c)
    const recording = key ? getRecording({ db, ...key }) : null
    if (!key || !recording?.isComplete) return c.text('완료된 녹음이 없습니다', 404)
    const filePath = recordingPathOf({ recordingsDir, ...key })
    if (!existsSync(filePath)) return c.text('녹음 파일이 디스크에 없습니다', 404)
    return streamRecording({
      filePath,
      rangeHeader: c.req.header('Range'),
      fileName: `${key.meetingId}.wav`
    })
  })

  return admin
}
