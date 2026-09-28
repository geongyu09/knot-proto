import { formatTimestamp } from '@meeting-stt/core/format'
import type { Decision } from './types'
import { decisionsKo } from './locales/decisions'

export type DecisionCopyLabels = typeof decisionsKo.copy

interface FormatDecisionMarkdownParams {
  decision: Decision
  meetingTitle: string
  /** 회의 날짜 문자열. 날짜 표기는 UI 언어를 따르므로 부르는 쪽이 만든다 */
  meetingDate: string
  /** 타입 이름. 미분류면 null */
  typeName: string | null
  /** 화자 라벨 → 표시 이름. 복사 시점의 이름으로 푼다 */
  speakerNames: Record<string, string>
  labels?: DecisionCopyLabels
}

const nameOf = ({ label, speakerNames }: { label: string; speakerNames: Record<string, string> }) =>
  speakerNames[label] ?? label

/**
 * @description 결정 문서 하나를 마크다운으로 조립합니다 (references/decisions.md "복사"). 빈 절은 넣지 않습니다.
 * @param decision - 결정 문서
 * @param meetingTitle - 출처 회의 제목
 * @param meetingDate - 회의 날짜 표기
 * @param typeName - 타입 이름. 미분류면 null
 * @param speakerNames - 화자 라벨 → 표시 이름
 * @param labels - 절 제목 사전. 생략하면 한국어
 * @returns 마크다운 문자열
 * @example
 * const text = formatDecisionMarkdown({ decision, meetingTitle, meetingDate, typeName, speakerNames })
 */
export const formatDecisionMarkdown = ({
  decision,
  meetingTitle,
  meetingDate,
  typeName,
  speakerNames,
  labels = decisionsKo.copy
}: FormatDecisionMarkdownParams) => {
  const proposers = decision.proposerLabels.map((label) => nameOf({ label, speakerNames }))
  const meta = [typeName ?? labels.unclassified, meetingTitle, meetingDate]
  if (proposers.length) meta.push(`${labels.proposers}: ${proposers.join(', ')}`)

  const sections = [
    `## ${decision.title}`,
    meta.join(' · '),
    `### ${labels.decision}\n${decision.decision}`
  ]

  if (decision.background) sections.push(`### ${labels.background}\n${decision.background}`)
  if (decision.alternatives.length) {
    const lines = decision.alternatives.map(({ option, reason }) =>
      reason ? `- ${option}: ${reason}` : `- ${option}`
    )
    sections.push(`### ${labels.alternatives}\n${lines.join('\n')}`)
  }
  if (decision.actionItems.length) {
    const lines = decision.actionItems.map(({ task, ownerLabel, ownerText, due }) => {
      const owner = ownerLabel ? nameOf({ label: ownerLabel, speakerNames }) : ownerText
      const extras = [owner, due].filter(Boolean)

      return extras.length ? `- [ ] ${task} (${extras.join(', ')})` : `- [ ] ${task}`
    })
    sections.push(`### ${labels.actionItems}\n${lines.join('\n')}`)
  }
  if (decision.evidence.length) {
    const ranges = decision.evidence.map(
      ({ startSec, endSec }) =>
        `${formatTimestamp({ sec: startSec })}–${formatTimestamp({ sec: endSec })}`
    )
    sections.push(`### ${labels.evidence}\n${ranges.join(', ')}`)
  }

  return `${sections.join('\n\n')}\n`
}
