import { useState } from 'react'
import { writeClipboardTextApi } from '@renderer/shared/api/clipboard'
import { trackApi } from '@renderer/shared/api/telemetry'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

const useSummaryCopy = ({ summary }: { summary: string }) => {
  const { t } = useLocale()
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const copySummary = async () => {
    try {
      await writeClipboardTextApi({ text: summary })
      setIsCopied(true)
      setCopyError(null)
      trackApi({ name: 'summary_copied', props: {} })
    } catch (caught) {
      setIsCopied(false)
      setCopyError(caught instanceof Error ? caught.message : t.summary.errors.copy)
    }
  }

  return { isCopied, copyError, copySummary }
}

export default useSummaryCopy
