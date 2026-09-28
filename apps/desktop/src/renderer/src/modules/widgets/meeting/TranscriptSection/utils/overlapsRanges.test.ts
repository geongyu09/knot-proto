import { describe, expect, it } from 'vitest'

import { overlapsRanges } from './overlapsRanges'

const RANGES = [{ startSec: 10, endSec: 20 }]

describe('overlapsRanges', () => {
  it('구간 안에 걸친 발화는 겹친다', () => {
    expect(overlapsRanges({ startSec: 12, endSec: 15, ranges: RANGES })).toBe(true)
    expect(overlapsRanges({ startSec: 5, endSec: 11, ranges: RANGES })).toBe(true)
    expect(overlapsRanges({ startSec: 19, endSec: 30, ranges: RANGES })).toBe(true)
  })

  it('끝이 맞닿기만 한 이웃 발화는 겹치지 않는다', () => {
    expect(overlapsRanges({ startSec: 0, endSec: 10, ranges: RANGES })).toBe(false)
    expect(overlapsRanges({ startSec: 20, endSec: 25, ranges: RANGES })).toBe(false)
  })

  it('길이 0인 발화는 구간 안에 있으면 겹친다', () => {
    expect(overlapsRanges({ startSec: 10, endSec: 10, ranges: RANGES })).toBe(true)
    expect(overlapsRanges({ startSec: 21, endSec: 21, ranges: RANGES })).toBe(false)
  })

  it('구간이 없으면 겹치지 않는다', () => {
    expect(overlapsRanges({ startSec: 0, endSec: 100, ranges: [] })).toBe(false)
  })
})
