import type { DecisionEvidence } from '@shared/types'

interface OverlapsRangesParams {
  startSec: number
  endSec: number
  ranges: DecisionEvidence[]
}

/**
 * 발화가 근거 구간 중 하나와 겹치는지. 근거는 발화 id가 아니라 시각으로 저장되므로(다시 인식에도 살아남게)
 * 원문 패널은 겹치는 발화로 다시 찾는다 (references/decisions.md "코드 검증").
 * 끝이 맞닿기만 한 이웃 발화는 겹치지 않는 것으로 본다 — 구간이 발화 경계에서 시작·끝나기 때문이다.
 */
export const overlapsRanges = ({ startSec, endSec, ranges }: OverlapsRangesParams) =>
  ranges.some((range) =>
    startSec === endSec
      ? startSec >= range.startSec && startSec <= range.endSec
      : startSec < range.endSec && endSec > range.startSec
  )
