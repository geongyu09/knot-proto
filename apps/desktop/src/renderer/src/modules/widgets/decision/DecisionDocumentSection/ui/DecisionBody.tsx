import { formatTimestamp } from '@meeting-stt/core/format'
import type { Decision, DecisionEvidence } from '@shared/types'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { namesOf } from '../utils/speakerNamesOf'
import styles from './DecisionBody.module.css'

interface DecisionBodyProps {
  decision: Decision
  speakerNames: Record<string, string>
  onJumpToEvidence: (range: DecisionEvidence) => void
}

/** 담당·기한이 비었을 때 표 칸을 비워 두지 않는 기호 (언어와 무관) */
const EMPTY_CELL = '–'

const rangeLabelOf = ({ startSec, endSec }: DecisionEvidence) =>
  `${formatTimestamp({ sec: startSec })}–${formatTimestamp({ sec: endSec })}`

/**
 * 결정 → 배경 → 검토한 대안 → 후속 조치 → 참여 화자 → 근거 (references/decisions.md "결정 문서 화면").
 * 읽기 전용이라 입력 요소를 두지 않는다. 틀린 문서는 원문을 고친 뒤 다시 추출한다.
 */
export default function DecisionBody({
  decision,
  speakerNames,
  onJumpToEvidence
}: DecisionBodyProps) {
  const { t } = useLocale()
  const labels = t.decisions.document
  const participants = namesOf({ labels: decision.participantLabels, speakerNames })

  return (
    <>
      <section className={styles.section} aria-label={labels.decision}>
        <h2 className={styles.heading}>{labels.decision}</h2>
        <p className={styles.decision}>{decision.decision}</p>
      </section>

      {decision.background ? (
        <section className={styles.section} aria-label={labels.background}>
          <h2 className={styles.heading}>{labels.background}</h2>
          <p className={styles.text}>{decision.background}</p>
        </section>
      ) : null}

      {decision.alternatives.length ? (
        <section className={styles.section} aria-label={labels.alternatives}>
          <h2 className={styles.heading}>{labels.alternatives}</h2>
          <ul className={styles.alternatives}>
            {decision.alternatives.map(({ option, reason }) => (
              // 대안은 id가 없고 문서가 읽기 전용이라 순서가 바뀌지 않는다
              <li key={`${option}-${reason}`} className={styles.alternative}>
                <span className={styles.option}>{option}</span>
                {reason ? <span className={styles.reason}>{reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {decision.actionItems.length ? (
        <section className={styles.section} aria-label={labels.actionItems}>
          <h2 className={styles.heading}>{labels.actionItems}</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{labels.task}</th>
                <th scope="col">{labels.owner}</th>
                <th scope="col">{labels.due}</th>
              </tr>
            </thead>
            <tbody>
              {decision.actionItems.map(({ task, ownerLabel, ownerText, due }) => (
                <tr key={`${task}-${ownerLabel ?? ownerText}-${due}`}>
                  <td>{task}</td>
                  <td>
                    {ownerLabel
                      ? (speakerNames[ownerLabel] ?? ownerLabel)
                      : ownerText || EMPTY_CELL}
                  </td>
                  <td>{due || EMPTY_CELL}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className={styles.section} aria-label={labels.participants}>
        <h2 className={styles.heading}>{labels.participants}</h2>
        <p className={styles.text}>
          {participants.length ? participants.join(', ') : labels.empty}
        </p>
      </section>

      <section className={styles.section} aria-label={labels.evidence}>
        <h2 className={styles.heading}>{labels.evidence}</h2>
        <ul className={styles.chips}>
          {decision.evidence.map((range) => {
            const rangeLabel = rangeLabelOf(range)

            return (
              <li key={rangeLabel}>
                <button
                  type="button"
                  className={styles.chip}
                  aria-label={labels.evidenceJump({ range: rangeLabel })}
                  onClick={() => onJumpToEvidence(range)}
                >
                  {rangeLabel}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
