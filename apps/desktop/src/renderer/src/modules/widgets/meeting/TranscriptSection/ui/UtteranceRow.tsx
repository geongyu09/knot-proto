import { formatTimestamp } from '@meeting-stt/core/format'
import type { Utterance } from '@shared/types'
import InlineEditableText from '@renderer/shared/components/composites/InlineEditableText'
import Icon from '@renderer/shared/components/primitives/ui/Icon'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import type { SpeakerOption } from '../types/transcript'
import { speakerToneOf } from '../utils/speakerTone'
import RefinedOriginal from './RefinedOriginal'
import styles from './UtteranceRow.module.css'

interface UtteranceRowProps {
  utterance: Utterance
  speakerOptions: SpeakerOption[]
  isCopied: boolean
  onChangeSpeaker: (params: { utteranceId: string; speakerLabel: string }) => void
  onCommitText: (params: { utteranceId: string; text: string }) => void
  /** 교정된 발화(`originalText`가 있는 발화)를 원문으로 되돌린다 */
  onRevertRefine: (params: { utteranceId: string }) => void
  onCopy: (params: { utterance: Utterance }) => void
  /** 원본 녹음이 있을 때만 넘긴다. 있으면 시각이 재생 위치 이동 버튼이 된다 */
  onSeek?: (sec: number) => void
  /** 결정 문서 원문 패널의 좁은 행 (글자 한 단계 작게) */
  isCompact?: boolean
  /** 결정 문서의 근거 구간과 겹치는 발화 */
  isHighlighted?: boolean
}

/** 시각 · (화자 + 본문) · 복사. 복사 버튼은 행에 마우스를 올리거나 포커스가 들어올 때만 보인다 */
export default function UtteranceRow({
  utterance,
  speakerOptions,
  isCopied,
  onChangeSpeaker,
  onCommitText,
  onRevertRefine,
  onCopy,
  onSeek,
  isCompact = false,
  isHighlighted = false
}: UtteranceRowProps) {
  const { t } = useLocale()
  const { utterance: labels } = t.transcript
  const tone = speakerToneOf({ speakerOptions, label: utterance.speakerLabel })
  const timestamp = formatTimestamp({ sec: utterance.startSec })

  return (
    <li
      className={[
        styles.row,
        isCompact ? styles.compact : '',
        isHighlighted ? styles.highlighted : ''
      ].join(' ')}
      // 원문 패널이 근거 구간으로 스크롤할 때 이 값으로 행을 찾는다
      data-utterance-id={utterance.id}
      data-highlighted={isHighlighted}
    >
      {onSeek ? (
        <button
          type="button"
          className={[styles.time, styles.seek].join(' ')}
          aria-label={labels.seekFrom({ timestamp })}
          title={labels.seekFrom({ timestamp })}
          onClick={() => onSeek(utterance.startSec)}
        >
          {timestamp}
        </button>
      ) : (
        <span className={styles.time}>{timestamp}</span>
      )}
      <div className={styles.body}>
        <span className={[styles.speaker, styles[`tone${tone}`]].join(' ')}>
          <span className={styles.dot} aria-hidden="true" />
          <select
            className={styles.speakerSelect}
            aria-label={labels.changeSpeaker}
            value={utterance.speakerLabel}
            onChange={(event) =>
              onChangeSpeaker({ utteranceId: utterance.id, speakerLabel: event.target.value })
            }
          >
            {speakerOptions.map(({ label, name }) => (
              <option key={label} value={label}>
                {name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={12} />
        </span>
        <InlineEditableText
          isMultiline
          className={styles.text}
          value={utterance.text}
          ariaLabel={labels.textLabel}
          onCommit={(text) => onCommitText({ utteranceId: utterance.id, text })}
        />
        {utterance.originalText !== null && (
          <RefinedOriginal
            originalText={utterance.originalText}
            onRevert={() => onRevertRefine({ utteranceId: utterance.id })}
          />
        )}
      </div>
      <button
        type="button"
        className={[styles.copy, isCopied ? styles.copied : ''].join(' ')}
        aria-label={isCopied ? labels.copied : labels.copyThis}
        title={isCopied ? labels.copied : labels.copyThis}
        onClick={() => onCopy({ utterance })}
      >
        <Icon name={isCopied ? 'check' : 'copy'} size={14} />
      </button>
    </li>
  )
}
