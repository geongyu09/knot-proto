import { globalShortcut } from 'electron'
import { formatAccelerator } from '@shared/shortcut'
import { getAppSettings } from '../db/settings'
import { warn } from '../log'
import { requestRecordingCommand } from './recorder'
import { t } from '../locale'

interface ShortcutAccelerators {
  recordingShortcut: string
}

const bindings = ({ recordingShortcut }: ShortcutAccelerators) => [
  {
    accelerator: recordingShortcut,
    action: () => requestRecordingCommand({ kind: 'toggle' })
  }
]

/** 등록하지 못한 accelerator 목록. 다른 앱이 선점했거나 Electron이 모르는 키면 실패한다 */
const registerAll = (accelerators: ShortcutAccelerators) => {
  globalShortcut.unregisterAll()

  return bindings(accelerators)
    .filter(({ accelerator, action }) => {
      try {
        return !globalShortcut.register(accelerator, action)
      } catch {
        return true
      }
    })
    .map(({ accelerator }) => accelerator)
}

/**
 * 앱 시작 시 등록. 실패해도 앱을 멈추지 않는다 —
 * 단축키가 없어도 메인 창과 메뉴바로 모든 동작을 할 수 있다 (references/pitfalls.md).
 */
export const registerGlobalShortcuts = () => {
  const failed = registerAll(getAppSettings())

  failed.forEach((accelerator) =>
    warn(`전역 단축키 ${accelerator}를 등록하지 못했습니다 (다른 앱이 쓰는 중일 수 있습니다)`)
  )
}

/**
 * 설정에서 바꾼 단축키를 등록한다. 앱 시작과 달리 실패를 삼키지 않는다 — 방금 고른 키가
 * 동작하지 않는 걸 사용자가 알아야 한다. 실패하면 이전 단축키로 되돌리고 throw한다.
 */
export const replaceGlobalShortcuts = ({
  next,
  previous
}: {
  next: ShortcutAccelerators
  previous: ShortcutAccelerators
}) => {
  const failed = registerAll(next)
  if (failed.length === 0) return

  registerAll(previous)
  throw new Error(
    t().main.errors.shortcutRegisterFailed({
      shortcuts: failed.map(formatAccelerator).join(', ')
    })
  )
}

/**
 * 설정 화면에서 새 단축키를 입력받는 동안 해제한다. 해제하지 않으면 현재 단축키를 누르는 순간
 * 녹음이 시작된다 (references/architecture.md "전역 단축키").
 */
export const setGlobalShortcutsSuspended = ({ isSuspended }: { isSuspended: boolean }) => {
  if (isSuspended) globalShortcut.unregisterAll()
  else registerGlobalShortcuts()
}

export const unregisterGlobalShortcuts = () => {
  globalShortcut.unregisterAll()
}
