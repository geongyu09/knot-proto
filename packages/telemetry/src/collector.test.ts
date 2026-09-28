import { describe, expect, it } from 'vitest'
import {
  formatContentRange,
  isRecordingUploadResponse,
  meetingPath,
  parseContentRange
} from './collector'

describe('Content-Range', () => {
  it('만든 헤더를 그대로 다시 읽는다', () => {
    const range = { start: 8, end: 15, total: 20 }

    expect(parseContentRange(formatContentRange(range))).toEqual(range)
  })

  it('뒤집힌 범위와 전체를 넘는 범위는 거절한다', () => {
    expect(parseContentRange('bytes 10-5/20')).toBeNull()
    expect(parseContentRange('bytes 0-20/20')).toBeNull()
    expect(parseContentRange('bytes */20')).toBeNull()
  })
})

describe('meetingPath', () => {
  it('식별자를 경로에 안전하게 넣는다', () => {
    expect(meetingPath({ installId: 'a/b', meetingId: 'm 1' })).toBe('/v1/meetings/a%2Fb/m%201')
  })
})

describe('isRecordingUploadResponse', () => {
  it('0 이상의 정수 receivedBytes만 받는다', () => {
    expect(isRecordingUploadResponse({ receivedBytes: 0 })).toBe(true)
    expect(isRecordingUploadResponse({ receivedBytes: -1 })).toBe(false)
    expect(isRecordingUploadResponse({ receivedBytes: 1.5 })).toBe(false)
    expect(isRecordingUploadResponse({})).toBe(false)
  })
})
