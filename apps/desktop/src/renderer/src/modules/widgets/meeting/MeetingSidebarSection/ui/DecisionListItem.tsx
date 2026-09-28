import { NavLink } from 'react-router'
import type { DecisionListItem as DecisionListItemData } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'
import { decisionDetailPath } from '@renderer/shared/routes/paths'

import { whenOf } from '../utils/whenOf'
import styles from './DecisionListItem.module.css'

interface DecisionListItemProps {
  decision: DecisionListItemData
  now: number
}

/** 결정 문서 제목 한 줄 + 출처 회의 날짜. 회의록 탭의 행과 같은 모양이다 */
export default function DecisionListItem({ decision, now }: DecisionListItemProps) {
  const { locale } = useLocale()

  return (
    <NavLink
      to={decisionDetailPath({ decisionId: decision.id })}
      className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
    >
      <span className={styles.title}>{decision.title}</span>
      <span className={styles.meta}>
        {whenOf({ epochMs: decision.meetingCreatedAt, now, locale })}
      </span>
    </NavLink>
  )
}
