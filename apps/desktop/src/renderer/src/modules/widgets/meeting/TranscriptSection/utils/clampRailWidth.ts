import { RAIL_LIMITS, RAIL_MAX_RATIO } from '../constants/rail'
import type { RailLimits } from '../types/rail'

interface RailMaxWidthOfParams {
  /** 본문 그리드의 콘텐츠 폭(패딩 제외). 0이면 아직 측정 전으로 본다 */
  contentWidth: number
  limits?: RailLimits
}

export const railMaxWidthOf = ({ contentWidth, limits = RAIL_LIMITS }: RailMaxWidthOfParams) => {
  if (contentWidth <= 0) return limits.maxPx
  return Math.max(limits.minPx, Math.min(limits.maxPx, Math.floor(contentWidth * RAIL_MAX_RATIO)))
}

interface ClampRailWidthParams {
  width: number
  maxWidth: number
  limits?: RailLimits
}

export const clampRailWidth = ({ width, maxWidth, limits = RAIL_LIMITS }: ClampRailWidthParams) =>
  Math.round(Math.min(maxWidth, Math.max(limits.minPx, width)))
