import { describe, expect, it } from 'vitest'
import { changedSettingKeys } from './settingsDiff'

describe('changedSettingKeys', () => {
  it('값이 바뀐 키만 돌려준다', () => {
    expect(
      changedSettingKeys({
        previous: { isAudioKept: false, inputDevice: { deviceId: 'a' } },
        next: { isAudioKept: true, inputDevice: { deviceId: 'a' } }
      })
    ).toEqual(['isAudioKept'])
  })

  it('객체 값은 내용으로 비교한다', () => {
    expect(
      changedSettingKeys({
        previous: { inputDevice: { deviceId: 'a' } },
        next: { inputDevice: { deviceId: 'b' } }
      })
    ).toEqual(['inputDevice'])
  })
})
