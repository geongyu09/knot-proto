import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import { deleteOutboxRows, listDueOutbox, postponeOutboxRows } from '../db/telemetry'
import { messageOf, warn } from '../log'
import type { OutboxRow, OutboxSink } from '../types/telemetry'
import { retryDelayMs } from './backoff'
import { TELEMETRY_CONFIG } from './config'
import { telemetryContext } from './context'
import type { SendOutcome } from './outcome'
import { buildMeetingSnapshot } from './snapshot'
import {
  deleteCollectorMeeting,
  putCollectorSnapshot,
  sendCollectorEvents
} from './sinks/collector'
import { sendPosthogEvents } from './sinks/posthog'
import { uploadDueRecordings } from './upload'

/** outbox를 비우는 간격. 이벤트는 실시간일 필요가 없다 */
const FLUSH_INTERVAL_MS = 15_000
/** 한 번에 보내는 이벤트 수 */
const EVENT_BATCH_SIZE = 100

/** 전송 결과를 outbox 행에 반영한다 (references/telemetry.md "전송 계약") */
const settleRows = ({ ids, outcome }: { ids: number[]; outcome: SendOutcome }) => {
  if (!ids.length) return
  if (outcome === 'sent') {
    deleteOutboxRows({ ids })
    return
  }
  if (outcome === 'drop') {
    warn(`사용 정보 ${ids.length}건을 버렸습니다: 서버가 재시도해도 받지 않는 요청`)
    deleteOutboxRows({ ids })
    return
  }

  const now = Date.now()
  postponeOutboxRows({
    ids,
    nextAttemptAt: (attempts) => now + retryDelayMs({ attempts, isAuthFailure: outcome === 'auth' })
  })
}

const parsePayload = (row: OutboxRow): unknown => {
  try {
    return JSON.parse(row.payload)
  } catch {
    return null
  }
}

const meetingIdOf = (row: OutboxRow) => {
  const payload = parsePayload(row)
  if (typeof payload !== 'object' || payload === null) return null

  const { meetingId } = payload as Record<string, unknown>

  return typeof meetingId === 'string' ? meetingId : null
}

const sendEventRows = async ({ sink, rows }: { sink: OutboxSink; rows: OutboxRow[] }) => {
  if (!rows.length) return

  // outbox에는 이 앱이 만든 envelope만 들어간다. 깨진 행은 보낼 수 없으니 버린다
  const parsed = rows.map((row) => ({ id: row.id, envelope: parsePayload(row) }))
  const broken = parsed.filter(({ envelope }) => envelope === null).map(({ id }) => id)
  settleRows({ ids: broken, outcome: 'drop' })

  const valid = parsed.filter(({ envelope }) => envelope !== null)
  if (!valid.length) return

  const events = valid.map(({ envelope }) => envelope as TelemetryEnvelope)
  const { outcome } =
    sink === 'collector'
      ? await sendCollectorEvents({ events })
      : await sendPosthogEvents({ events })
  settleRows({ ids: valid.map(({ id }) => id), outcome })
}

/** 스냅샷·삭제 알림은 회의마다 요청 하나다 */
const sendMeetingRow = async (row: OutboxRow) => {
  const meetingId = meetingIdOf(row)
  if (!meetingId) {
    settleRows({ ids: [row.id], outcome: 'drop' })
    return
  }

  if (row.kind === 'meeting_deleted') {
    const { outcome } = await deleteCollectorMeeting({ ...telemetryContext(), meetingId })
    settleRows({ ids: [row.id], outcome })
    return
  }

  const snapshot = buildMeetingSnapshot({ meetingId })
  // 그사이 지워진 회의는 삭제 알림이 따로 간다
  if (!snapshot) {
    deleteOutboxRows({ ids: [row.id] })
    return
  }

  const { outcome } = await putCollectorSnapshot({ snapshot })
  settleRows({ ids: [row.id], outcome })
}

const flushSink = async (sink: OutboxSink) => {
  const rows = listDueOutbox({ sink, now: Date.now(), limit: EVENT_BATCH_SIZE })

  await sendEventRows({ sink, rows: rows.filter(({ kind }) => kind === 'event') })
  for (const row of rows.filter(({ kind }) => kind !== 'event')) {
    await sendMeetingRow(row)
  }
}

const enabledSinks = () =>
  (['collector', 'posthog'] as const).filter((sink) => TELEMETRY_CONFIG[sink] !== null)

let isFlushing = false

/** 켜진 싱크의 outbox를 한 번 비운다. 겹쳐 돌지 않는다 */
const flushOutbox = async () => {
  if (isFlushing) return
  isFlushing = true

  try {
    for (const sink of enabledSinks()) {
      await flushSink(sink)
    }
  } catch (caught) {
    warn(`사용 정보 전송 중 오류: ${messageOf(caught)}`)
  } finally {
    isFlushing = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null

const tick = () => {
  void flushOutbox()
  // 녹음 업로드는 수백 MB라 이벤트 전송과 따로 돈다
  void uploadDueRecordings()
}

export const startTelemetryWorker = () => {
  if (timer || !enabledSinks().length) return

  tick()
  timer = setInterval(tick, FLUSH_INTERVAL_MS)
}

export const stopTelemetryWorker = () => {
  if (timer) clearInterval(timer)
  timer = null
}
