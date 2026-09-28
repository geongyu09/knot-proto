import type { ReactNode } from 'react'

import styles from './index.module.css'

interface CardProps {
  title?: ReactNode
  /** 제목 옆 회색 숫자 */
  count?: number
  /** 헤더 오른쪽 동작 (전체 보기 등) */
  action?: ReactNode
  /** 제목 앞 아이콘 칸 */
  icon?: ReactNode
  className?: string
  children: ReactNode
}

/** knot 카드. 흰 바탕·반경 24·옅은 그림자 (references/architecture.md "공통 컴포넌트") */
export default function Card({ title, count, action, icon, className, children }: CardProps) {
  const hasHeader = title !== undefined || action !== undefined

  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      {hasHeader ? (
        <header className={styles.header}>
          <h2 className={styles.title}>
            {icon ? <span className={styles.icon}>{icon}</span> : null}
            {title}
            {count !== undefined ? <span className={styles.count}>{count}</span> : null}
          </h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}
