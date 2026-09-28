import { describe, expect, it } from 'vitest'
import {
  EVENT_CATEGORIES,
  isRendererEventName,
  isTelemetryEventName,
  RENDERER_EVENT_NAMES
} from './events'

describe('이벤트 카탈로그', () => {
  it('renderer 허용 이벤트는 모두 카탈로그에 있다', () => {
    RENDERER_EVENT_NAMES.forEach((name) => expect(isTelemetryEventName(name)).toBe(true))
  })

  it('main 전용 이벤트는 renderer가 보낼 수 없다', () => {
    expect(isRendererEventName('pipeline_completed')).toBe(false)
    expect(isRendererEventName('screen_viewed')).toBe(true)
  })

  it('프로토타입 속성 이름을 이벤트로 착각하지 않는다', () => {
    expect(isTelemetryEventName('toString')).toBe(false)
    expect(Object.keys(EVENT_CATEGORIES)).not.toContain('toString')
  })
})
