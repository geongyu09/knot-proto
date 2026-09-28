import { useState } from 'react'
import {
  DECISION_TYPE_DESCRIPTION_MAX_CHARS,
  DECISION_TYPE_NAME_MAX_CHARS
} from '@shared/decisions'
import type { DecisionType } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './TypeRow.module.css'

const ICON_SIZE = 14

interface TypeRowProps {
  position: number
  name: string
  description: string
  isFirst: boolean
  isLast: boolean
  isAutoFocus: boolean
  isDisabled: boolean
  onChange: (patch: Partial<DecisionType>) => void
  onMove: (offset: number) => void
  onRemove: () => void
}

/** 타입 한 행: 이름 · 설명 · 위/아래 · 삭제. 삭제는 그 타입 문서가 미분류로 가므로 행 안에서 한 번 더 묻는다 */
export default function TypeRow({
  position,
  name,
  description,
  isFirst,
  isLast,
  isAutoFocus,
  isDisabled,
  onChange,
  onMove,
  onRemove
}: TypeRowProps) {
  const { t } = useLocale()
  const labels = t.decisions.settings
  const [isConfirming, setIsConfirming] = useState(false)

  return (
    <li className={styles.item}>
      <div className={styles.row}>
        <input
          className={styles.input}
          aria-label={labels.nameLabel({ position })}
          placeholder={labels.namePlaceholder}
          value={name}
          maxLength={DECISION_TYPE_NAME_MAX_CHARS}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={isDisabled}
          autoFocus={isAutoFocus}
          spellCheck={false}
        />
        <input
          className={styles.input}
          aria-label={labels.descriptionLabel({ position })}
          placeholder={labels.descriptionPlaceholder}
          value={description}
          maxLength={DECISION_TYPE_DESCRIPTION_MAX_CHARS}
          onChange={(event) => onChange({ description: event.target.value })}
          disabled={isDisabled}
          spellCheck={false}
        />
        <span className={styles.buttons}>
          <button
            type="button"
            className={[styles.iconButton, styles.up].join(' ')}
            aria-label={labels.moveUp({ position })}
            onClick={() => onMove(-1)}
            disabled={isDisabled || isFirst}
          >
            <Icon name="chevronDown" size={ICON_SIZE} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={labels.moveDown({ position })}
            onClick={() => onMove(1)}
            disabled={isDisabled || isLast}
          >
            <Icon name="chevronDown" size={ICON_SIZE} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={labels.remove({ position })}
            aria-expanded={isConfirming}
            onClick={() => setIsConfirming(!isConfirming)}
            disabled={isDisabled}
          >
            <Icon name="close" size={ICON_SIZE} />
          </button>
        </span>
      </div>
      {isConfirming ? (
        <div className={styles.confirm} role="alert">
          <span>{labels.removeConfirm}</span>
          <span className={styles.confirmActions}>
            <Button variant="secondary" size="sm" onClick={() => setIsConfirming(false)}>
              {labels.cancel}
            </Button>
            <Button variant="danger" size="sm" onClick={onRemove}>
              {labels.confirmRemove}
            </Button>
          </span>
        </div>
      ) : null}
    </li>
  )
}
