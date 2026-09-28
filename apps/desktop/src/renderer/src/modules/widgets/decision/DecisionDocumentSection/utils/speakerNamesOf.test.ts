import { describe, expect, it } from 'vitest'
import type { Speaker, Utterance } from '@shared/types'

import { namesOf, speakerNamesOf } from './speakerNamesOf'

const DEFAULT_NAMES = {
  numbered: (index: number) => `화자 ${index}`,
  unknown: '알 수 없음'
}

const utteranceOf = (id: string, speakerLabel: string): Utterance => ({
  id,
  meetingId: 'meeting-1',
  ord: 0,
  speakerLabel,
  startSec: 0,
  endSec: 1,
  text: '',
  originalText: null
})

const speakerOf = (label: string, displayName: string | null): Speaker => ({
  meetingId: 'meeting-1',
  label,
  displayName
})

describe('speakerNamesOf', () => {
  it('발화 등장 순서로 번호를 매기고 지정한 이름을 우선한다', () => {
    const names = speakerNamesOf({
      speakers: [speakerOf('SPEAKER_00', null), speakerOf('SPEAKER_01', '김팀장')],
      utterances: [utteranceOf('u1', 'SPEAKER_01'), utteranceOf('u2', 'SPEAKER_00')],
      defaultNames: DEFAULT_NAMES
    })

    expect(names).toEqual({ SPEAKER_01: '김팀장', SPEAKER_00: '화자 2' })
  })

  it('발화가 없어도 화자 행으로 이름을 만든다', () => {
    expect(
      speakerNamesOf({
        speakers: [speakerOf('SPEAKER_00', null)],
        utterances: [],
        defaultNames: DEFAULT_NAMES
      })
    ).toEqual({ SPEAKER_00: '화자 1' })
  })
})

describe('namesOf', () => {
  it('모르는 라벨은 라벨 그대로 둔다', () => {
    expect(namesOf({ labels: ['a', 'b'], speakerNames: { a: '민수' } })).toEqual(['민수', 'b'])
  })
})
