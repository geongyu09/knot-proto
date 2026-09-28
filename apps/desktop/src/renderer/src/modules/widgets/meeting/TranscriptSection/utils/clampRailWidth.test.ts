import { describe, expect, it } from 'vitest'

import { PANEL_LIMITS, RAIL_MAX_PX, RAIL_MIN_PX } from '../constants/rail'
import { clampRailWidth, railMaxWidthOf } from './clampRailWidth'

describe('railMaxWidthOf', () => {
  it('측정 전(폭 0)이면 고정 상한을 쓴다', () => {
    expect(railMaxWidthOf({ contentWidth: 0 })).toBe(RAIL_MAX_PX)
  })

  it('본문이 좁으면 절반까지만 허용한다', () => {
    expect(railMaxWidthOf({ contentWidth: 700 })).toBe(350)
  })

  it('본문이 넓어도 고정 상한을 넘지 않는다', () => {
    expect(railMaxWidthOf({ contentWidth: 2000 })).toBe(RAIL_MAX_PX)
  })

  it('본문이 아주 좁아도 최소 폭 아래로 내려가지 않는다', () => {
    expect(railMaxWidthOf({ contentWidth: 300 })).toBe(RAIL_MIN_PX)
  })
})

describe('clampRailWidth', () => {
  it('범위 안의 값은 반올림만 한다', () => {
    expect(clampRailWidth({ width: 320.6, maxWidth: RAIL_MAX_PX })).toBe(321)
  })

  it('최소·최대 폭으로 자른다', () => {
    expect(clampRailWidth({ width: 100, maxWidth: RAIL_MAX_PX })).toBe(RAIL_MIN_PX)
    expect(clampRailWidth({ width: 900, maxWidth: 400 })).toBe(400)
  })
})

describe('원문 패널 폭 규칙', () => {
  it('패널 상한·하한을 따로 쓴다', () => {
    expect(railMaxWidthOf({ contentWidth: 0, limits: PANEL_LIMITS })).toBe(PANEL_LIMITS.maxPx)
    expect(railMaxWidthOf({ contentWidth: 500, limits: PANEL_LIMITS })).toBe(PANEL_LIMITS.minPx)
    expect(clampRailWidth({ width: 100, maxWidth: 640, limits: PANEL_LIMITS })).toBe(
      PANEL_LIMITS.minPx
    )
  })
})
