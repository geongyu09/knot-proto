import {
  MEETING_SNAPSHOT_SCHEMA_VERSION,
  type MeetingSnapshot
} from '@meeting-stt/telemetry/snapshot'
import { listMeetingDecisionDocuments } from '../db/decisions'
import { findMeeting } from '../db/meetings'
import { getRefineResult } from '../db/refine'
import { getDecisionTypes, getGlossarySettings } from '../db/settings'
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
      hasAudio: meeting.hasAudio,
      decisionState: meeting.decisionState,
      decisionError: meeting.decisionError ?? null
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
    glossaryTerms: getGlossarySettings().terms,
    // 결정 문서도 회의 내용이라 자체 서버로만 보낸다 (references/decisions.md "사용 정보 수집")
    decisions: listMeetingDecisionDocuments({ meetingId }).map((decision) => ({
      id: decision.id,
      ord: decision.ord,
      typeId: decision.typeId,
      title: decision.title,
      decision: decision.decision,
      background: decision.background,
      alternatives: decision.alternatives,
      actionItems: decision.actionItems,
      proposerLabels: decision.proposerLabels,
      participantLabels: decision.participantLabels,
      evidence: decision.evidence,
      createdAt: decision.createdAt
    })),
    decisionTypes: getDecisionTypes()
  }

  return snapshot
}
