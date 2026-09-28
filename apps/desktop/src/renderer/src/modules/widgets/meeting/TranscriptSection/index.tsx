import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { DecisionEvidence } from '@shared/types'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import RefinePanel from '@renderer/modules/features/refine/RefinePanel'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import { PANEL_LIMITS, RAIL_LIMITS } from './constants/rail'
import useAudioSeek from './model/useAudioSeek'
import usePanelScroll from './model/usePanelScroll'
import useRailResize from './model/useRailResize'
import type { TranscriptScrollRequest, TranscriptVariant } from './types/transcript'
import useTranscriptCopy from './model/useTranscriptCopy'
import Placeholder from './ui/Placeholder'
import RailResizer from './ui/RailResizer'
import RecordingBar from './ui/RecordingBar'
import SpeakerPanel from './ui/SpeakerPanel'
import TranscriptActions from './ui/TranscriptActions'
import TranscriptCopyActions from './ui/TranscriptCopyActions'
import TranscriptHeader from './ui/TranscriptHeader'
import UtteranceRow from './ui/UtteranceRow'
import { overlapsRanges } from './utils/overlapsRanges'
import { toSpeakerOptions } from './utils/toSpeakerOptions'
import styles from './index.module.css'

const NO_RANGES: DecisionEvidence[] = []

interface TranscriptSectionProps {
  meetingId: string
  /** 오른쪽 레일 위쪽에 끼울 내용. 상세 화면은 결정 문서 카드·요약을 넣는다 */
  aside?: ReactNode
  /**
   * 'panel'은 결정 문서 화면의 오른쪽 원문 패널이다 — 헤더·요약 레일·녹음 바 없이 화자 편집과 발화 목록만,
   * 글자를 한 단계 작게 그린다 (references/decisions.md "결정 문서 화면").
   */
  variant?: TranscriptVariant
  /** panel: 왼쪽 칸에 그릴 내용(결정 문서). 두 칸이 폭 조절 핸들을 나눠 쓰므로 그리드를 여기서 만든다 */
  main?: ReactNode
  /** panel: 강조할 근거 구간. 겹치는 발화에 강조 배경을 준다 */
  highlightRanges?: DecisionEvidence[]
  /** panel: 근거 칩을 눌렀을 때 스크롤할 구간 */
  scrollRequest?: TranscriptScrollRequest | null
}

/**
 * 회의 상세의 본문 전체(상단 바 + 회의록 + 오른쪽 레일 + 하단 녹음 바). 화자 목록이 회의록과 같은 `useMeeting` 상태를 써야 해서
 * 레일까지 여기서 그린다 (references/architecture.md "화면별 구성").
 */
export default function TranscriptSection({
  meetingId,
  aside,
  variant = 'page',
  main,
  highlightRanges = NO_RANGES,
  scrollRequest = null
}: TranscriptSectionProps) {
  const isPanel = variant === 'panel'
  const navigate = useNavigate()
  const { t } = useLocale()
  const {
    meeting,
    utterances,
    speakers,
    refineResult,
    isLoading,
    error,
    saveError,
    renameMeeting,
    editUtteranceText,
    reassignUtterance,
    revertUtteranceRefine,
    renameSpeaker,
    mergeSpeakers,
    reprocessMeeting,
    removeMeeting
  } = useMeeting({ meetingId })

  const speakerOptions = toSpeakerOptions({
    speakers,
    utterances,
    defaultNames: {
      numbered: (index) => t.transcript.defaultSpeakerNames.numbered({ index }),
      unknown: t.transcript.defaultSpeakerNames.unknown
    }
  })
  const speakerNames = Object.fromEntries(speakerOptions.map(({ label, name }) => [label, name]))
  const { copiedKey, copyError, copyAll, copyUtterance } = useTranscriptCopy({
    utterances,
    speakerNames
  })
  const { audioRef, seekTo } = useAudioSeek()
  const contentRef = useRef<HTMLDivElement>(null)
  const railLimits = isPanel ? PANEL_LIMITS : RAIL_LIMITS
  const { railWidth, isResizing, startResize, moveResize, endResize, resizeByKey, resetWidth } =
    useRailResize({ containerRef: contentRef, limits: railLimits })
  const { panelRef } = usePanelScroll({
    utterances,
    highlightRanges,
    scrollRequest,
    isEnabled: isPanel
  })

  // 끈 폭은 런타임 값이라 CSS 변수 기본값(assets/layout.css)을 인라인으로 덮어쓴다
  const railStyle = { '--rail-width': `${railWidth}px` } as CSSProperties

  const renderResizer = () => (
    <RailResizer
      railWidth={railWidth}
      limits={railLimits}
      label={isPanel ? t.decisions.panel.resizerLabel : undefined}
      title={isPanel ? t.decisions.panel.resizerTitle : undefined}
      isResizing={isResizing}
      onPointerDown={startResize}
      onPointerMove={moveResize}
      onPointerEnd={endResize}
      onKeyDown={resizeByKey}
      onReset={resetWidth}
    />
  )

  const renderPanelLayout = (panelBody: ReactNode) => (
    <div
      ref={contentRef}
      className={[styles.content, styles.panelLayout].join(' ')}
      data-resizing={isResizing}
      style={railStyle}
    >
      <div className={styles.main}>{main}</div>
      {renderResizer()}
      <aside ref={panelRef} className={[styles.rail, styles.panel].join(' ')}>
        <h2 className={styles.panelTitle}>{t.decisions.panel.label}</h2>
        {panelBody}
      </aside>
    </div>
  )

  // 원문 패널은 회의를 못 읽어도 왼쪽 문서는 그대로 보여야 한다
  const renderPlaceholder = ({ message, isError }: { message: string; isError?: boolean }) =>
    isPanel ? (
      renderPanelLayout(<p className={isError ? styles.error : styles.message}>{message}</p>)
    ) : (
      <Placeholder message={message} isError={isError} />
    )

  if (isLoading && !meeting) return renderPlaceholder({ message: t.transcript.loading })
  if (error) return renderPlaceholder({ message: error.message, isError: true })
  if (!meeting) return renderPlaceholder({ message: t.transcript.notFound })

  const actionError = saveError ?? copyError

  const handleDelete = async () => {
    if (await removeMeeting()) navigate(PATHS.home)
  }

  const renderBody = () => {
    if (meeting.status === 'recording') {
      return <p className={styles.message}>{t.transcript.status.recording}</p>
    }

    if (meeting.status === 'processing') {
      return (
        <div className={styles.pending}>
          <p className={styles.message}>{t.transcript.status.processing}</p>
          <PipelineProgress meetingId={meetingId} />
        </div>
      )
    }

    if (meeting.status === 'error') {
      return (
        <div className={styles.failed}>
          <p className={styles.error}>{meeting.errorMessage ?? t.transcript.status.defaultError}</p>
          {meeting.hasAudio ? (
            // 보이는 회의록이 없어 잃을 것이 없으므로 확인 없이 저장된 참석자 수로 다시 돌린다
            <Button
              variant="secondary"
              size="sm"
              className={styles.retry}
              onClick={() => reprocessMeeting({ speakerCount: meeting.speakerCount ?? null })}
            >
              {t.transcript.status.retry}
            </Button>
          ) : null}
        </div>
      )
    }

    if (!utterances.length)
      return <p className={styles.message}>{t.transcript.status.noUtterances}</p>

    return (
      <ol className={styles.list}>
        {utterances.map((utterance) => (
          <UtteranceRow
            key={utterance.id}
            utterance={utterance}
            speakerOptions={speakerOptions}
            isCopied={copiedKey === utterance.id}
            onChangeSpeaker={reassignUtterance}
            onCommitText={editUtteranceText}
            onRevertRefine={revertUtteranceRefine}
            onCopy={copyUtterance}
            // 원문 패널에는 녹음 바(재생기)가 없다
            onSeek={meeting.hasAudio && !isPanel ? seekTo : undefined}
            isCompact={isPanel}
            isHighlighted={
              isPanel &&
              overlapsRanges({
                startSec: utterance.startSec,
                endSec: utterance.endSec,
                ranges: highlightRanges
              })
            }
          />
        ))}
      </ol>
    )
  }

  const renderSpeakerPanel = () =>
    utterances.length ? (
      <SpeakerPanel
        speakerOptions={speakerOptions}
        utterances={utterances}
        onRenameSpeaker={renameSpeaker}
        onMergeSpeakers={mergeSpeakers}
      />
    ) : null

  const renderActionError = () =>
    actionError ? (
      <p className={styles.error} role="alert">
        {actionError.message}
      </p>
    ) : null

  if (isPanel) {
    return renderPanelLayout(
      <>
        {renderSpeakerPanel()}
        <section className={styles.transcript} aria-label={t.transcript.sectionLabel}>
          {renderActionError()}
          {renderBody()}
        </section>
      </>
    )
  }

  return (
    <>
      <div ref={contentRef} className={styles.content} data-resizing={isResizing} style={railStyle}>
        <TranscriptHeader
          className={styles.header}
          meeting={meeting}
          speakerCount={speakerOptions.length}
          onRenameTitle={(title) => renameMeeting({ title })}
          actions={
            <>
              <TranscriptCopyActions
                isCopyEnabled={utterances.length > 0}
                copiedKey={copiedKey}
                onCopy={copyAll}
              />
              <TranscriptActions onDelete={handleDelete} />
            </>
          }
        />
        <section className={styles.transcript} aria-label={t.transcript.sectionLabel}>
          {renderActionError()}
          {renderBody()}
        </section>
        {renderResizer()}
        <aside className={styles.rail}>
          {aside}
          {meeting.status === 'done' && utterances.length ? (
            <RefinePanel meetingId={meetingId} refineResult={refineResult} />
          ) : null}
          {renderSpeakerPanel()}
        </aside>
      </div>
      {meeting.status === 'done' || meeting.status === 'error' ? (
        <RecordingBar meeting={meeting} audioRef={audioRef} onReprocess={reprocessMeeting} />
      ) : null}
    </>
  )
}
