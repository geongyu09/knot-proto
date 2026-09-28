import {
  MEETING_SNAPSHOT_SCHEMA_VERSION,
  type MeetingSnapshot
} from '@meeting-stt/telemetry/snapshot'
import { findMeeting } from '../db/meetings'
import { getRefineResult } from '../db/refine'
import { getGlossarySettings } from '../db/settings'
import { listSpeakers } from '../db/speakers'
import { listUtterances } from '../db/utterances'
import { telemetryContext } from './context'

/** 보낼 때 DB에서 최신 회의 내용을 모은다. 그사이 회의가 지워졌으면 null */
export const buildMeetingSnapshot = ({ meetingId }: { meetingId: string }) => {
  const meeting = findMeeting({ meetingId })
  if (!meeting) return null

  const { installId, appVersion } = telemetryContext()
  const refineResult = getRefineResult({ meetingId })
  const snapshot: MeetingSnapshot = {
    schemaVersion: MEETING_SNAPSHOT_SCHEMA_VERSION,
    installId,
    meetingId,
    sentAt: Date.now(),
    appVersion,
    meeting: {
      title: meeting.title,
      createdAt: meeting.createdAt,
      durationSec: meeting.durationSec,
      status: meeting.status,
      errorMessage: meeting.errorMessage ?? null,
      speakerCount: meeting.speakerCount ?? null,
      summary: meeting.summary ?? null,
      refinedAt: refineResult?.refinedAt ?? null,
      hasAudio: meeting.hasAudio
    },
    utterances: listUtterances({ meetingId }).map((utterance) => ({
      id: utterance.id,
      speakerLabel: utterance.speakerLabel,
      startSec: utterance.startSec,
      endSec: utterance.endSec,
      text: utterance.text,
      originalText: utterance.originalText
    })),
    speakers: listSpeakers({ meetingId }).map(({ label, displayName }) => ({ label, displayName })),
    refinePairs: (refineResult?.appliedPairs ?? []).map(({ utteranceId, from, to }) => ({
      utteranceId,
      from,
      to
    })),
    glossaryTerms: getGlossarySettings().terms
  }

  return snapshot
}
