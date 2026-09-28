import { useState } from 'react'
import { formatDecisionMarkdown } from '@shared/decisionFormat'
import type { Decision, Meeting } from '@shared/types'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { trackApi } from '@renderer/shared/api/telemetry'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { formatMeetingDate } from '@renderer/shared/utils/formatMeetingDate'

interface UseDecisionCopyParams {
  decision: Decision
  meeting: Meeting
  typeName: string | null
  speakerNames: Record<string, string>
}

/** 문서 하나를 마크다운으로 복사한다. 사람 필드는 복사하는 순간의 화자 이름으로 푼다 (references/decisions.md "복사") */
const useDecisionCopy = ({ decision, meeting, typeName, speakerNames }: UseDecisionCopyParams) => {
  const { t, locale } = useLocale()
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const copyDecision = async () => {
    const text = formatDecisionMarkdown({
      decision,
      meetingTitle: meeting.title,
      meetingDate: formatMeetingDate({ epochMs: meeting.createdAt, locale }),
      typeName,
      speakerNames,
      labels: t.decisions.copy
    })

    try {
      await writeClipboardTextApi({ text })
      setIsCopied(true)
      setCopyError(null)
      trackApi({ name: 'decision_copied', props: { decisionId: decision.id } })
    } catch (caught) {
      setIsCopied(false)
      setCopyError(caught instanceof Error ? caught.message : t.decisions.document.copyError)
    }
  }

  return { isCopied, copyError, copyDecision }
}

export default useDecisionCopy
