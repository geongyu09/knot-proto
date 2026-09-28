import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import styles from './DocumentActions.module.css'

const COPY_ICON_SIZE = 14

interface DocumentActionsProps {
  isCopied: boolean
  isReextracting: boolean
  /** 확인 문구의 "문서 N개" */
  decisionCount: number
  onCopy: () => void
  onReextract: () => void
}

type MenuStage = 'closed' | 'open' | 'confirming'

/**
 * 문서 헤더 오른쪽: 복사(마크다운) + 더보기("이 회의 다시 추출"). 다시 추출은 그 회의의 문서를 모두 지우고 새로 만들므로
 * 더보기 안에서 2단계 인라인 확인을 거친다 (회의 삭제와 같은 모양).
 */
export default function DocumentActions({
  isCopied,
  isReextracting,
  decisionCount,
  onCopy,
  onReextract
}: DocumentActionsProps) {
  const { t } = useLocale()
  const labels = t.decisions.document
  const [menuStage, setMenuStage] = useState<MenuStage>('closed')

  // 메뉴 밖으로 포커스가 나가면 닫는다. 메뉴 안의 버튼 사이 이동은 유지한다
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setMenuStage('closed')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setMenuStage('closed')
  }

  return (
    <div className={styles.actions}>
      <Button variant="secondary" size="sm" onClick={onCopy}>
        <Icon name={isCopied ? 'check' : 'copy'} size={COPY_ICON_SIZE} />
        {isCopied ? labels.copied : labels.copy}
      </Button>
      <div className={styles.menuContainer} onBlur={handleBlur} onKeyDown={handleKeyDown}>
        <button
          type="button"
          className={styles.moreButton}
          aria-label={labels.more}
          aria-expanded={menuStage !== 'closed'}
          onClick={() => setMenuStage(menuStage === 'closed' ? 'open' : 'closed')}
        >
          <Icon name="more" />
        </button>
        {menuStage === 'open' ? (
          <div className={styles.menu}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => setMenuStage('confirming')}
            >
              {labels.reextract}
            </button>
          </div>
        ) : null}
        {menuStage === 'confirming' ? (
          <div className={styles.confirm} role="alert">
            <span>{labels.reextractConfirm({ count: decisionCount })}</span>
            <span className={styles.confirmActions}>
              <Button variant="secondary" size="sm" onClick={() => setMenuStage('closed')}>
                {labels.cancel}
              </Button>
              <Button size="sm" disabled={isReextracting} onClick={onReextract}>
                {labels.confirmReextract}
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
