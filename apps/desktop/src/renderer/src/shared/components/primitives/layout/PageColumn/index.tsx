import type { ReactNode } from 'react'

import styles from './index.module.css'

type PageColumnWidth = 'narrow' | 'medium' | 'wide'

interface PageColumnProps {
  /** narrow 720 · medium 880 · wide 1080 */
  width?: PageColumnWidth
  children: ReactNode
}

/** GNB 아래·독 위를 채우는 가운데 정렬 본문 열. 넘치면 이 영역이 스크롤된다 */
export default function PageColumn({ width = 'wide', children }: PageColumnProps) {
  return (
    <div className={styles.scroller}>
      <div className={[styles.column, styles[width]].join(' ')}>{children}</div>
    </div>
  )
}
