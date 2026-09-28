import { describe, expect, it } from 'vitest'
import { stageDurations } from './stageTimer'

describe('stageDurations', () => {
  it('병렬로 도는 STT·화자 분리는 각자 첫 보고부터 100%까지 잰다', () => {
    const durations = stageDurations({
      marks: [
        { stage: 'stt', percent: 0, at: 0 },
        { stage: 'diarize', percent: 10, at: 100 },
        { stage: 'stt', percent: 50, at: 500 },
        { stage: 'stt', percent: 100, at: 1000 },
        { stage: 'diarize', percent: 100, at: 1500 },
        { stage: 'merge', percent: 0, at: 1600 },
        { stage: 'save', percent: 0, at: 1700 }
      ],
      endAt: 1750
    })

    expect(durations).toEqual({ stt: 1000, diarize: 1400, merge: 100, save: 50 })
  })

  it('보고가 하나뿐이고 뒤가 없으면 끝 시각까지 잰다', () => {
    expect(stageDurations({ marks: [{ stage: 'merge', percent: 0, at: 10 }], endAt: 40 })).toEqual({
      merge: 30
    })
  })
})
