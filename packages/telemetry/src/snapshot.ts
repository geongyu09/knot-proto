/**
 * 회의 내용 스냅샷. 자체 수집 서버에만 보낸다 — 외부 분석 서비스로는 보내지 않는다
 * (references/telemetry.md "수집 항목"). 서버는 (installId, meetingId)마다 최신본으로 덮어쓴다.
 */

export const MEETING_SNAPSHOT_SCHEMA_VERSION = 1

export interface SnapshotMeeting {
  title: string
  /** epoch ms */
  createdAt: number
  durationSec: number
  status: string
  errorMessage: string | null
  speakerCount: number | null
  summary: string | null
  /** 마지막 자동 교정 시각 (epoch ms). 교정하지 않았으면 null */
  refinedAt: number | null
  hasAudio: boolean
  /** 결정 문서 추출 상태 (references/decisions.md). 이 필드가 없던 옛 스냅샷은 서버가 'none'으로 읽는다 */
  decisionState?: string
  decisionError?: string | null
}

export interface SnapshotUtterance {
  id: string
  speakerLabel: string
  startSec: number
  endSec: number
  text: string
  /** 교정이 처음 바꾸기 전 원문. 바뀐 적 없으면 null */
  originalText: string | null
}

export interface SnapshotSpeaker {
  label: string
  displayName: string | null
}

export interface SnapshotRefinePair {
  utteranceId: string
  from: string
  to: string
}

/** 결정 문서 하나. 사람 필드는 화자 라벨이고, 표시 이름은 같은 스냅샷의 speakers로 푼다 */
export interface SnapshotDecision {
  id: string
  ord: number
  typeId: string | null
  title: string
  decision: string
  background: string
  alternatives: { option: string; reason: string }[]
  actionItems: { task: string; ownerLabel: string | null; ownerText: string; due: string }[]
  proposerLabels: string[]
  participantLabels: string[]
  evidence: { startSec: number; endSec: number }[]
  createdAt: number
}

export interface SnapshotDecisionType {
  id: string
  name: string
  description: string
}

export interface MeetingSnapshot {
  schemaVersion: typeof MEETING_SNAPSHOT_SCHEMA_VERSION
  installId: string
  meetingId: string
  /** 보낸 시각 (epoch ms). 서버가 늦게 도착한 옛 스냅샷으로 새 것을 덮지 않게 비교한다 */
  sentAt: number
  appVersion: string
  meeting: SnapshotMeeting
  utterances: SnapshotUtterance[]
  speakers: SnapshotSpeaker[]
  refinePairs: SnapshotRefinePair[]
  /** 보낸 시점의 전역 용어 사전 */
  glossaryTerms: string[]
  /** 저장된 결정 문서 전체 (2026-09-28). 옛 데스크탑 빌드는 보내지 않는다 */
  decisions?: SnapshotDecision[]
  /** 보낸 시점의 결정 타입 목록 */
  decisionTypes?: SnapshotDecisionType[]
}
