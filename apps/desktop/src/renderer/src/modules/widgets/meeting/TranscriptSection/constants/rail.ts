import type { RailLimits } from '../types/rail'

export const RAIL_DEFAULT_PX = 300
export const RAIL_MIN_PX = 240
export const RAIL_MAX_PX = 560
/** CSS의 `min(var(--rail-width), 50%)`와 같은 상한. 회의록이 레일에 밀려 사라지지 않게 한다 */
export const RAIL_MAX_RATIO = 0.5
export const RAIL_KEYBOARD_STEP_PX = 16
export const RAIL_WIDTH_STORAGE_KEY = 'meetingDetail.railWidthPx'

export const RAIL_LIMITS: RailLimits = {
  defaultPx: RAIL_DEFAULT_PX,
  minPx: RAIL_MIN_PX,
  maxPx: RAIL_MAX_PX,
  storageKey: RAIL_WIDTH_STORAGE_KEY
}

/** 결정 문서 화면의 원문 패널 (references/decisions.md "결정 문서 화면") */
export const PANEL_DEFAULT_PX = 400
export const PANEL_MIN_PX = 320
export const PANEL_MAX_PX = 640
export const PANEL_WIDTH_STORAGE_KEY = 'decisionDetail.panelWidthPx'

export const PANEL_LIMITS: RailLimits = {
  defaultPx: PANEL_DEFAULT_PX,
  minPx: PANEL_MIN_PX,
  maxPx: PANEL_MAX_PX,
  storageKey: PANEL_WIDTH_STORAGE_KEY
}
