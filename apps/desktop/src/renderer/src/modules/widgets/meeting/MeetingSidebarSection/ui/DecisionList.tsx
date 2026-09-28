import type { DecisionListItem as DecisionListItemData, DecisionType, Meeting } from '@shared/types'
import Button from '@renderer/shared/components/primitives/ui/Button'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import useNow from '@renderer/shared/hooks/common/useNow'
import useStoredValue from '@renderer/shared/hooks/common/useStoredValue'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { COLLAPSED_GROUPS_STORAGE_KEY, NOW_REFRESH_MS } from '../constants/sidebar'
import { groupDecisions } from '../utils/groupDecisions'
import { processingKindOf } from '../utils/processingKindOf'
import DecisionListItem from './DecisionListItem'
import ProcessingItem from './ProcessingItem'
import styles from './DecisionList.module.css'

const CHEVRON_SIZE = 12

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

interface DecisionListProps {
  meetings: Meeting[]
  decisions: DecisionListItemData[]
  types: DecisionType[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}

/** 결정 탭 본문: "처리 중" 묶음 → 타입 묶음(접기) → 미분류 (references/decisions.md "사이드 패널") */
export default function DecisionList({
  meetings,
  decisions,
  types,
  isLoading,
  error,
  onRetry
}: DecisionListProps) {
  const { t } = useLocale()
  const labels = t.decisions.sidebar
  const { now } = useNow({ intervalMs: NOW_REFRESH_MS })
  const { value: collapsedIds, set: setCollapsedIds } = useStoredValue<string[]>({
    storageKey: COLLAPSED_GROUPS_STORAGE_KEY,
    initialValue: [],
    isValid: isStringList
  })

  const processing = meetings.flatMap((meeting) => {
    const kind = processingKindOf(meeting)
    return kind ? [{ meeting, kind }] : []
  })

  const handleToggle = (groupId: string) =>
    setCollapsedIds(
      collapsedIds.includes(groupId)
        ? collapsedIds.filter((id) => id !== groupId)
        : [...collapsedIds, groupId]
    )

  const renderProcessing = () =>
    processing.length ? (
      <section className={styles.group} aria-label={labels.processingGroup}>
        <h2 className={styles.heading}>{labels.processingGroup}</h2>
        <ul className={styles.list}>
          {processing.map(({ meeting, kind }) => (
            <li key={meeting.id}>
              <ProcessingItem meeting={meeting} kind={kind} />
            </li>
          ))}
        </ul>
      </section>
    ) : null

  const renderGroups = () => {
    if (isLoading && !decisions.length) return <p className={styles.message}>{t.common.loading}</p>
    if (error) {
      return (
        <div className={styles.errorContainer}>
          <p className={styles.errorMessage}>{error.message}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t.common.retry}
          </Button>
        </div>
      )
    }
    if (!decisions.length) return <p className={styles.message}>{labels.empty}</p>

    return groupDecisions({ decisions, types, unclassifiedName: labels.unclassified }).map(
      ({ id, name, decisions: grouped }) => {
        const isExpanded = !collapsedIds.includes(id)

        return (
          <section key={id} className={styles.group} aria-label={name}>
            <h2 className={styles.heading}>
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={isExpanded}
                aria-label={labels.groupToggle({ name })}
                onClick={() => handleToggle(id)}
              >
                <span className={styles.chevron}>
                  <Icon name="chevronDown" size={CHEVRON_SIZE} />
                </span>
                <span className={styles.name}>{name}</span>
                <span className={styles.count}>{grouped.length}</span>
              </button>
            </h2>
            {isExpanded ? (
              <ul className={styles.list}>
                {grouped.map((decision) => (
                  <li key={decision.id}>
                    <DecisionListItem decision={decision} now={now} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )
      }
    )
  }

  return (
    <>
      {renderProcessing()}
      {renderGroups()}
    </>
  )
}
