import { DECISION_TYPE_MAX_COUNT } from '@shared/decisions'
import SettingGroup from '@renderer/shared/components/primitives/layout/SettingGroup'
import Button from '@renderer/shared/components/primitives/ui/Button'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useDecisionTypeEditor from './model/useDecisionTypeEditor'
import TypeRow from './ui/TypeRow'
import styles from './index.module.css'

/** 설정 "결정 타입" 카테고리. 배열 순서가 사이드 패널 묶음 순서다 (references/decisions.md "결정 타입") */
export default function DecisionTypesSection() {
  const { t } = useLocale()
  const labels = t.decisions.settings
  const {
    rows,
    focusKey,
    isLoading,
    loadError,
    isDirty,
    isSaving,
    actionError,
    notice,
    addRow,
    updateRow,
    moveRow,
    removeRow,
    saveTypes
  } = useDecisionTypeEditor()

  const renderBody = () => {
    if (isLoading) return <p className={styles.hint}>{labels.loading}</p>
    if (loadError) {
      return (
        <p className={styles.error} role="alert">
          {loadError}
        </p>
      )
    }

    return (
      <>
        <span className={styles.label}>
          {labels.count({ count: rows.length, max: DECISION_TYPE_MAX_COUNT })}
        </span>
        <div className={styles.columns} aria-hidden="true">
          <span>{labels.nameColumn}</span>
          <span>{labels.descriptionColumn}</span>
        </div>
        <ol className={styles.list} aria-label={labels.listLabel}>
          {rows.map((row, index) => (
            <TypeRow
              key={row.key}
              position={index + 1}
              name={row.name}
              description={row.description}
              isFirst={index === 0}
              isLast={index === rows.length - 1}
              isAutoFocus={row.key === focusKey}
              isDisabled={isSaving}
              onChange={(patch) => updateRow({ key: row.key, patch })}
              onMove={(offset) => moveRow({ key: row.key, offset })}
              onRemove={() => removeRow(row.key)}
            />
          ))}
        </ol>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={addRow}
            disabled={isSaving || rows.length >= DECISION_TYPE_MAX_COUNT}
          >
            {labels.add}
          </Button>
        </div>
        <div className={styles.actions}>
          <Button size="sm" onClick={saveTypes} disabled={isSaving || !isDirty}>
            {isSaving ? labels.saving : labels.save}
          </Button>
          {isDirty && !isSaving ? <span className={styles.hint}>{labels.unsaved}</span> : null}
        </div>
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        {actionError ? (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <SettingGroup title={labels.title}>
      <div className={styles.body}>
        <p className={styles.hint}>{labels.intro}</p>
        <p className={styles.hint}>{labels.note}</p>
        {renderBody()}
      </div>
    </SettingGroup>
  )
}
