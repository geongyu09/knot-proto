import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RECORDING_SHORTCUT,
  acceleratorFromKeyInput,
  formatAccelerator,
  isValidAccelerator
} from './shortcut'

const NO_MODIFIERS = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }

describe('isValidAccelerator', () => {
  it('기본 단축키는 유효하다', () => {
    expect(isValidAccelerator(DEFAULT_RECORDING_SHORTCUT)).toBe(true)
  })

  it('Control·Alt·Command 중 하나가 없으면 거절한다', () => {
    expect(isValidAccelerator('R')).toBe(false)
    expect(isValidAccelerator('Shift+R')).toBe(false)
  })

  it('허용하지 않는 키·수식키·순서를 거절한다', () => {
    expect(isValidAccelerator('Command+Tab')).toBe(false)
    expect(isValidAccelerator('Super+R')).toBe(false)
    expect(isValidAccelerator('Command+Alt+R')).toBe(false)
    expect(isValidAccelerator('Alt+Alt+R')).toBe(false)
    expect(isValidAccelerator('')).toBe(false)
  })

  it('기능키·방향키·스페이스를 허용한다', () => {
    expect(isValidAccelerator('Control+F12')).toBe(true)
    expect(isValidAccelerator('Alt+Shift+Up')).toBe(true)
    expect(isValidAccelerator('Command+Space')).toBe(true)
    expect(isValidAccelerator('Command+F13')).toBe(false)
  })
})

describe('acceleratorFromKeyInput', () => {
  it('code 기준으로 문자 키를 읽는다', () => {
    expect(
      acceleratorFromKeyInput({ ...NO_MODIFIERS, code: 'KeyR', altKey: true, metaKey: true })
    ).toBe('Alt+Command+R')
  })

  it('수식키를 정해진 순서로 적는다', () => {
    expect(
      acceleratorFromKeyInput({
        code: 'Digit1',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        metaKey: true
      })
    ).toBe('Control+Alt+Shift+Command+1')
  })

  it('방향키 이름을 accelerator 이름으로 바꾼다', () => {
    expect(acceleratorFromKeyInput({ ...NO_MODIFIERS, code: 'ArrowLeft', ctrlKey: true })).toBe(
      'Control+Left'
    )
  })

  it('수식키만 누르거나 Shift만 쓰면 undefined', () => {
    expect(acceleratorFromKeyInput({ ...NO_MODIFIERS, code: 'MetaLeft', metaKey: true })).toBe(
      undefined
    )
    expect(acceleratorFromKeyInput({ ...NO_MODIFIERS, code: 'KeyA', shiftKey: true })).toBe(
      undefined
    )
  })
})

describe('formatAccelerator', () => {
  it('macOS 기호로 보여준다', () => {
    expect(formatAccelerator('Alt+Command+R')).toBe('⌥⌘R')
    expect(formatAccelerator('Control+Shift+Up')).toBe('⌃⇧↑')
    expect(formatAccelerator('Command+Space')).toBe('⌘Space')
  })
})
