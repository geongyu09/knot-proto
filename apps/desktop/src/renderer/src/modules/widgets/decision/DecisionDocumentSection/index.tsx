import type { ReactNode } from 'react'
import useDecision from '@renderer/shared/hooks/domain/decision/useDecision'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { DecisionLayoutParams } from './types/document'
import DecisionDocument from './ui/DecisionDocument'
import styles from './index.module.css'

interface DecisionDocumentSectionProps {
  decisionId: string
  /**
   * 문서와 원문 패널을 한 화면에 놓는다. widgets끼리는 서로 import하지 않으므로 페이지가 원문 패널
   * (`TranscriptSection variant="panel"`)을 이 함수로 끼운다 — 회의 id는 문서를 읽어야 알 수 있다.
   */
  renderLayout: (params: DecisionLayoutParams) => ReactNode
}

/** 결정 문서 화면 (`/decisions/:decisionId`, references/decisions.md "결정 문서 화면") */
export default function DecisionDocumentSection({
  decisionId,
  renderLayout
}: DecisionDocumentSectionProps) {
  const { t } = useLocale()
  const labels = t.decisions.document
  const { decision, meeting, isLoading, error, refetch } = useDecision({ decisionId })

  if (isLoading && !decision) return <p className={styles.message}>{labels.loading}</p>
  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error.message}
      </p>
    )
  }
  if (!decision || !meeting) {
    return (
      <section className={styles.empty} aria-label={labels.notFound}>
        <h1 className={styles.emptyTitle}>{labels.notFound}</h1>
        <p className={styles.message}>{labels.notFoundHint}</p>
      </section>
    )
  }

  return (
    <DecisionDocument
      // 다른 문서로 옮기면 복사·스크롤 요청 상태가 남지 않게 새로 그린다
      key={decision.id}
      decision={decision}
      meeting={meeting}
      renderLayout={renderLayout}
      onRefresh={refetch}
    />
  )
}
