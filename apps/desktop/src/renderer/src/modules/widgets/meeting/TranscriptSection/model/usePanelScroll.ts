import { useEffect, useRef } from 'react'
import type { DecisionEvidence, Utterance } from '@shared/types'

import type { TranscriptScrollRequest } from '../types/transcript'
import { overlapsRanges } from '../utils/overlapsRanges'

/** 스크롤한 행이 패널 맨 위에 붙지 않게 남기는 여백 */
const SCROLL_MARGIN_PX = 24

interface UsePanelScrollParams {
  utterances: Utterance[]
  highlightRanges: DecisionEvidence[]
  scrollRequest: TranscriptScrollRequest | null
  isEnabled: boolean
}

/**
 * 원문 패널을 근거 구간의 첫 발화로 스크롤한다. 들어올 때는 첫 근거 구간으로, 근거 칩을 누르면 그 구간으로.
 * scrollIntoView는 바깥 문서 칸까지 움직이므로 패널 자신의 scrollTop만 바꾼다.
 */
const usePanelScroll = ({
  utterances,
  highlightRanges,
  scrollRequest,
  isEnabled
}: UsePanelScrollParams) => {
  const panelRef = useRef<HTMLElement>(null)
  const target = scrollRequest ?? highlightRanges[0] ?? null
  const targetId = target
    ? (utterances.find((utterance) =>
        overlapsRanges({ startSec: utterance.startSec, endSec: utterance.endSec, ranges: [target] })
      )?.id ?? null)
    : null
  const requestId = scrollRequest?.requestId ?? 0

  useEffect(() => {
    const panel = panelRef.current
    if (!isEnabled || !targetId || !panel) return

    const row = [...panel.querySelectorAll<HTMLElement>('[data-utterance-id]')].find(
      (element) => element.dataset.utteranceId === targetId
    )
    if (!row) return

    panel.scrollTo({
      top: row.offsetTop - SCROLL_MARGIN_PX,
      // 처음 들어올 때는 바로, 칩을 눌렀을 때는 움직임이 보이게
      behavior: requestId ? 'smooth' : 'auto'
    })
  }, [isEnabled, targetId, requestId])

  return { panelRef }
}

export default usePanelScroll
