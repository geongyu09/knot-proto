import { useState } from 'react'
import { extractDecisionsApi } from '@renderer/shared/api/decisions'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseExtractDecisionsParams {
  meetingId: string
}

/**
 * 결정 추출 요청(처음 추출·다시 추출·실패 뒤 다시 시도). 잡은 큐에 들어가고 즉시 돌아오므로
 * 여기서는 요청이 받아들여졌는지만 다루고, 진행은 `useDecisionProgress`가 본다.
 */
const useExtractDecisions = ({ meetingId }: UseExtractDecisionsParams) => {
  const { t } = useLocale()
  const [isRequesting, setIsRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 요청이 받아들여졌으면 true */
  const extract = async () => {
    setIsRequesting(true)
    setError(null)

    try {
      await extractDecisionsApi({ meetingId })

      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.decisions.meetingCard.requestError)

      return false
    } finally {
      setIsRequesting(false)
    }
  }

  return { extract, isRequesting, error }
}

export default useExtractDecisions
