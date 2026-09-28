import { randomUUID } from 'node:crypto'
import type { TelemetryEnvelope } from '@meeting-stt/telemetry/envelope'
import {
  EVENT_CATEGORIES,
  type TelemetryEventMap,
  type TelemetryEventName,
  type TelemetryProps
} from '@meeting-stt/telemetry/events'
import { deletePendingMeetingRows, enqueueOutbox, hasPendingMeetingRow } from '../db/telemetry'
import { messageOf, warn } from '../log'
import { TELEMETRY_CONFIG } from './config'
import { telemetryContext } from './context'
import { captureSentryEvent } from './sentry'

/**
 * 이벤트 수집의 유일한 입구. outbox에 넣고 바로 돌아온다 — 네트워크 대기가 녹음·파이프라인을 막지 않는다.
 * 실패해도 throw하지 않는다 (references/telemetry.md "흐름", references/pitfalls.md).
 */

interface TrackParams<Name extends TelemetryEventName> {
  name: Name
  props: TelemetryEventMap[Name]
}

const errorMessageOf = ({ name, props }: { name: string; props: TelemetryProps }) =>
  typeof props.message === 'string' && props.message ? props.message : name

const enqueueEnvelope = (envelope: TelemetryEnvelope) => {
  const now = envelope.occurredAt
  if (TELEMETRY_CONFIG.collector) {
    enqueueOutbox({ sink: 'collector', kind: 'event', payload: envelope, now })
  }
  // 오류는 PostHog가 아니라 Sentry로 간다
  if (envelope.category === 'error') {
    captureSentryEvent({
      name: envelope.name,
      message: errorMessageOf(envelope),
      props: envelope.props
    })
    return
  }
  if (TELEMETRY_CONFIG.posthog) {
    enqueueOutbox({ sink: 'posthog', kind: 'event', payload: envelope, now })
  }
}

export const track = <Name extends TelemetryEventName>({ name, props }: TrackParams<Name>) => {
  try {
    enqueueEnvelope({
      id: randomUUID(),
      name,
      category: EVENT_CATEGORIES[name],
      // 이벤트별 props 타입은 전부 원시값 필드만 갖는다 (@meeting-stt/telemetry/events)
      props: props as unknown as TelemetryProps,
      occurredAt: Date.now(),
      ...telemetryContext()
    })
  } catch (caught) {
    warn(`사용 정보 기록 실패 (${name}): ${messageOf(caught)}`)
  }
}

/**
 * 회의 내용이 바뀌었으니 스냅샷을 다시 보낸다. 본문은 보낼 때 만들므로 대기 중인 행이 있으면 더 넣지 않는다
 * (references/telemetry.md "전송 계약"). 자체 서버에만 보낸다.
 */
export const trackMeetingSnapshot = ({ meetingId }: { meetingId: string }) => {
  if (!TELEMETRY_CONFIG.collector) return

  try {
    const target = { sink: 'collector', kind: 'meeting_snapshot', meetingId } as const
    if (hasPendingMeetingRow(target)) return

    enqueueOutbox({ ...target, payload: { meetingId }, now: Date.now() })
  } catch (caught) {
    warn(`회의 스냅샷 예약 실패 (${meetingId}): ${messageOf(caught)}`)
  }
}

/** 사용자가 앱에서 회의를 지웠다. 대기 중인 스냅샷은 버리고 서버에 삭제를 알린다 */
export const trackMeetingDeleted = ({ meetingId }: { meetingId: string }) => {
  track({ name: 'meeting_deleted', props: { meetingId } })
  if (!TELEMETRY_CONFIG.collector) return

  try {
    deletePendingMeetingRows({ sink: 'collector', kind: 'meeting_snapshot', meetingId })
    enqueueOutbox({
      sink: 'collector',
      kind: 'meeting_deleted',
      payload: { meetingId },
      now: Date.now()
    })
  } catch (caught) {
    warn(`회의 삭제 알림 예약 실패 (${meetingId}): ${messageOf(caught)}`)
  }
}

type MeetingEditEventName =
  | 'meeting_renamed'
  | 'utterance_edited'
  | 'utterance_reassigned'
  | 'refine_reverted'
  | 'speaker_renamed'
  | 'speakers_merged'

/** 회의 내용을 바꾼 편집. 이벤트를 남기고 바뀐 스냅샷을 다시 보낸다 */
export const trackMeetingEdit = ({
  name,
  meetingId
}: {
  name: MeetingEditEventName
  meetingId: string
}) => {
  track({ name, props: { meetingId } })
  trackMeetingSnapshot({ meetingId })
}
