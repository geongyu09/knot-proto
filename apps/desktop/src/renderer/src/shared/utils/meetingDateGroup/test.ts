import { describe, expect, it } from 'vitest'
import type { Meeting } from '@shared/types'
import { groupMeetingsByDate, meetingDateGroupOf } from './index'

const NOW = new Date(2026, 8, 24, 15, 0).getTime()

const meetingAt = (id: string, date: Date): Meeting => ({
  id,
  title: id,
  createdAt: date.getTime(),
  durationSec: 60,
  status: 'done',
  hasAudio: false,
  decisionState: 'none',
  decisionCount: 0
})

describe('meetingDateGroupOf', () => {
  it('같은 날 자정 직후는 오늘이다', () => {
    expect(meetingDateGroupOf({ epochMs: new Date(2026, 8, 24, 0, 0).getTime(), now: NOW })).toBe(
      'today'
    )
  })

  it('어제 자정 직전은 이번 주다', () => {
    expect(meetingDateGroupOf({ epochMs: new Date(2026, 8, 23, 23, 59).getTime(), now: NOW })).toBe(
      'week'
    )
  })

  it('6일 전까지는 이번 주, 7일 전부터는 이전이다', () => {
    expect(meetingDateGroupOf({ epochMs: new Date(2026, 8, 18, 9, 0).getTime(), now: NOW })).toBe(
      'week'
    )
    expect(meetingDateGroupOf({ epochMs: new Date(2026, 8, 17, 23, 0).getTime(), now: NOW })).toBe(
      'earlier'
    )
  })

  it('미래 시각은 오늘로 본다', () => {
    expect(meetingDateGroupOf({ epochMs: NOW + 60_000, now: NOW })).toBe('today')
  })
})

describe('groupMeetingsByDate', () => {
  it('최신순을 유지한 채 오늘·이번 주·이전으로 묶는다', () => {
    const groups = groupMeetingsByDate({
      meetings: [
        meetingAt('a', new Date(2026, 8, 24, 14, 0)),
        meetingAt('b', new Date(2026, 8, 24, 9, 0)),
        meetingAt('c', new Date(2026, 8, 22, 10, 0)),
        meetingAt('d', new Date(2026, 7, 1, 10, 0))
      ],
      now: NOW,
      locale: 'ko'
    })

    expect(groups.map(({ label, meetings }) => [label, meetings.map(({ id }) => id)])).toEqual([
      ['오늘', ['a', 'b']],
      ['이번 주', ['c']],
      ['이전', ['d']]
    ])
  })

  it('영어 화면에서는 영어 묶음 라벨을 쓴다', () => {
    const groups = groupMeetingsByDate({
      meetings: [
        meetingAt('a', new Date(2026, 8, 24, 14, 0)),
        meetingAt('c', new Date(2026, 8, 22, 10, 0)),
        meetingAt('d', new Date(2026, 7, 1, 10, 0))
      ],
      now: NOW,
      locale: 'en'
    })

    expect(groups.map(({ label }) => label)).toEqual(['Today', 'This week', 'Earlier'])
  })

  it('회의가 없는 묶음은 뺀다', () => {
    const groups = groupMeetingsByDate({
      meetings: [meetingAt('d', new Date(2026, 7, 1, 10, 0))],
      now: NOW,
      locale: 'ko'
    })

    expect(groups.map(({ group }) => group)).toEqual(['earlier'])
  })

  it('회의가 없으면 빈 배열이다', () => {
    expect(groupMeetingsByDate({ meetings: [], now: NOW, locale: 'ko' })).toEqual([])
  })
})
