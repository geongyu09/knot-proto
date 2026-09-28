import type { KeyboardEvent, PointerEvent } from 'react'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { RAIL_LIMITS } from '../constants/rail'
import type { RailLimits } from '../types/rail'
import styles from './RailResizer.module.css'

interface RailResizerProps {
  railWidth: number
  limits?: RailLimits
  /** 스크린 리더 이름·툴팁. 생략하면 회의 상세 레일 문구 */
  label?: string
  title?: string
  isResizing: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerEnd: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onReset: () => void
}

/** 회의록과 레일 사이의 세로 핸들. 끌거나 ←/→로 레일 폭을 바꾸고, 더블클릭하면 기본 폭으로 돌린다 */
export default function RailResizer({
  railWidth,
  limits = RAIL_LIMITS,
  label,
  title,
  isResizing,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onKeyDown,
  onReset
}: RailResizerProps) {
  const { t } = useLocale()

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label ?? t.transcript.railResizer.label}
      aria-valuenow={railWidth}
      aria-valuemin={limits.minPx}
      aria-valuemax={limits.maxPx}
      tabIndex={0}
      title={title ?? t.transcript.railResizer.title}
      className={styles.resizer}
      data-resizing={isResizing}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  )
}
