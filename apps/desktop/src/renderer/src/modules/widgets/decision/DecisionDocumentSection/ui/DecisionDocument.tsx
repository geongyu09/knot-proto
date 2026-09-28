import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Decision, DecisionEvidence, Meeting } from '@shared/types'
import { trackApi } from '@renderer/shared/api/telemetry'
import Badge from '@renderer/shared/components/primitives/ui/Badge'
import useDecisionTypes from '@renderer/shared/hooks/domain/decision/useDecisionTypes'
import useExtractDecisions from '@renderer/shared/hooks/domain/decision/useExtractDecisions'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { meetingDetailPath } from '@renderer/shared/routes/paths'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

import useDecisionCopy from '../model/useDecisionCopy'
import type { DecisionLayoutParams, EvidenceScrollRequest } from '../types/document'
import { namesOf, speakerNamesOf } from '../utils/speakerNamesOf'
import DecisionBody from './DecisionBody'
import DocumentActions from './DocumentActions'
import styles from './DecisionDocument.module.css'

interface DecisionDocumentProps {
  decision: Decision
  meeting: Meeting
  renderLayout: (params: DecisionLayoutParams) => ReactNode
  /** 문서를 다시 읽는다. 화자 병합은 main이 문서의 화자 라벨을 바꾸므로 그 뒤에 부른다 */
  onRefresh: () => void
}

/**
 * 읽기 전용 결정 문서. 화자 이름은 원문 패널과 같은 회의 상세(`useMeeting`)에서 풀어, 패널에서 이름을 바꾸면
 * 제안자·담당·참여 화자가 바로 바뀐다 (references/decisions.md "원문 패널").
 */
export default function DecisionDocument({
  decision,
  meeting,
  renderLayout,
  onRefresh
}: DecisionDocumentProps) {
  const { t, locale } = useLocale()
  const labels = t.decisions.document
  const navigate = useNavigate()
  const { speakers, utterances } = useMeeting({ meetingId: meeting.id })
  const { types } = useDecisionTypes()
  const {
    extract,
    isRequesting,
    error: reextractError
  } = useExtractDecisions({
    meetingId: meeting.id
  })
  const [scrollRequest, setScrollRequest] = useState<EvidenceScrollRequest | null>(null)

  const speakerNames = speakerNamesOf({
    speakers,
    utterances,
    defaultNames: {
      numbered: (index) => t.transcript.defaultSpeakerNames.numbered({ index }),
      unknown: t.transcript.defaultSpeakerNames.unknown
    }
  })
  const typeName = types.find(({ id }) => id === decision.typeId)?.name ?? null
  const proposers = namesOf({ labels: decision.proposerLabels, speakerNames })
  const { isCopied, copyError, copyDecision } = useDecisionCopy({
    decision,
    meeting,
    typeName,
    speakerNames
  })

  // 문서를 연 횟수는 사용 정보로 남긴다. 결정 내용은 싣지 않는다 (references/decisions.md "사용 정보 수집")
  useEffect(() => {
    trackApi({ name: 'decision_opened', props: { decisionId: decision.id, meetingId: meeting.id } })
  }, [decision.id, meeting.id])

  // 원문 패널에서 화자를 합치면 라벨 목록이 바뀌고, main이 문서 쪽 라벨도 바꿔 두었으니 다시 읽는다
  const speakerLabelsKey = speakers.map(({ label }) => label).join('\n')
  useEffect(() => {
    if (speakerLabelsKey) onRefresh()
  }, [speakerLabelsKey, onRefresh])

  const handleJumpToEvidence = (range: DecisionEvidence) =>
    setScrollRequest({ ...range, requestId: (scrollRequest?.requestId ?? 0) + 1 })

  // 성공하면 이 문서 id가 사라지므로 회의 상세로 옮겨 결정 카드에서 진행을 보게 한다
  const handleReextract = async () => {
    if (await extract()) navigate(meetingDetailPath({ meetingId: meeting.id }))
  }

  const actionError = copyError ?? reextractError

  const document = (
    <article className={styles.document} aria-label={labels.sectionLabel}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Badge tone={typeName ? 'accent' : 'neutral'}>
            {typeName ?? t.decisions.sidebar.unclassified}
          </Badge>
          <DocumentActions
            isCopied={isCopied}
            isReextracting={isRequesting}
            decisionCount={meeting.decisionCount}
            onCopy={copyDecision}
            onReextract={handleReextract}
          />
        </div>
        <h1 className={styles.title}>{decision.title}</h1>
        <p className={styles.meta} aria-label={labels.meta}>
          <Link
            className={styles.meetingLink}
            to={meetingDetailPath({ meetingId: meeting.id })}
            title={labels.sourceMeeting}
          >
            {meeting.title}
          </Link>
          <span>{formatMeetingDate({ epochMs: meeting.createdAt, locale })}</span>
          {proposers.length ? (
            <span>{labels.proposers({ names: proposers.join(', ') })}</span>
          ) : null}
        </p>
        {actionError ? (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        ) : null}
      </header>
      <DecisionBody
        decision={decision}
        speakerNames={speakerNames}
        onJumpToEvidence={handleJumpToEvidence}
      />
    </article>
  )

  return renderLayout({
    meetingId: meeting.id,
    document,
    highlightRanges: decision.evidence,
    scrollRequest
  })
}
