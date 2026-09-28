import { describe, expect, it } from 'vitest'
import { sanitizeProps, TELEMETRY_PROP_MAX_KEYS, TELEMETRY_PROP_MAX_LENGTH } from './envelope'

describe('sanitizeProps', () => {
  it('원시값만 남기고 객체·배열·함수·NaN은 버린다', () => {
    expect(
      sanitizeProps({
        format: 'markdown',
        count: 3,
        isAll: true,
        empty: null,
        nested: { text: '회의 내용' },
        list: ['a'],
        broken: Number.NaN,
        fn: () => 1
      })
    ).toEqual({ format: 'markdown', count: 3, isAll: true, empty: null })
  })

  it('긴 문자열은 상한까지 자른다', () => {
    const long = '가'.repeat(TELEMETRY_PROP_MAX_LENGTH * 3)

    expect(sanitizeProps({ message: long }).message).toHaveLength(TELEMETRY_PROP_MAX_LENGTH)
  })

  it('키 개수를 상한까지만 남긴다', () => {
    const many = Object.fromEntries(
      Array.from({ length: TELEMETRY_PROP_MAX_KEYS + 5 }, (_, index) => [`k${index}`, index])
    )

    expect(Object.keys(sanitizeProps(many))).toHaveLength(TELEMETRY_PROP_MAX_KEYS)
  })

  it('객체가 아니면 빈 props', () => {
    expect(sanitizeProps('text')).toEqual({})
    expect(sanitizeProps(null)).toEqual({})
    expect(sanitizeProps([1, 2])).toEqual({})
  })
})
