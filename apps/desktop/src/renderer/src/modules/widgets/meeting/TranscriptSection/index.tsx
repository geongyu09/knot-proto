import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import PipelineProgress from '@renderer/modules/features/pipeline/PipelineProgress'
import RefinePanel from '@renderer/modules/features/refine/RefinePanel'
import Button from '@renderer/shared/components/primitives/ui/Button'
import useMeeting from '@renderer/shared/hooks/domain/meeting/useMeeting'
import { PATHS } from '@renderer/shared/routes/paths'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

import useAudioSeek from './model/useAudioSeek'
import useRailResize from './model/useRailResize'
import useTranscriptCopy from './model/useTranscriptCopy'
import Placeholder from './ui/Placeholder'
import RailResizer from './ui/RailResizer'
import RecordingBar from './ui/RecordingBar'
import SpeakerPanel from './ui/SpeakerPanel'
import TranscriptActions from './ui/TranscriptActions'
import TranscriptCopyActions from './ui/TranscriptCopyActions'
import TranscriptHeader from './ui/TranscriptHeader'
import UtteranceRow from './ui/UtteranceRow'
import { toSpeakerOptions } from './utils/toSpeakerOptions'
import styles from './index.module.css'

interface TranscriptSectionProps {
  meetingId: string
  /** 오른쪽 레일 위쪽에 끼울 내용. 상세 화면은 요약을 넣는다 */
  aside?: ReactNode
}

/**
 * 회의 상세의 본문 전체(상단 바 + 회의록 + 오른쪽 레일 + 하단 녹음 바). 화자 목록이 회의록과 같은 `useMeeting` 상태를 써야 해서
 * 레일까지 여기서 그린다 (references/architecture.md "화면별 구성").
 */
export default function TranscriptSection({ meetingId, aside }: TranscriptSectionProps) {
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
  const { railWidth, isResizing, startResize, moveResize, endResize, resizeByKey, resetWidth } =
    useRailResize({ containerRef: contentRef })

  if (isLoading && !meeting) {
    return <Placeholder message={t.transcript.loading} />
  }
  if (error) return <Placeholder message={error.message} isError />
  if (!meeting) return <Placeholder message={t.transcript.notFound} />

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
            onSeek={meeting.hasAudio ? seekTo : undefined}
          />
        ))}
      </ol>
    )
  }

  return (
    <>
      <div
        ref={contentRef}
        className={styles.content}
        data-resizing={isResizing}
        // 끈 폭은 런타임 값이라 CSS 변수 기본값(assets/layout.css)을 인라인으로 덮어쓴다
        style={{ '--rail-width': `${railWidth}px` } as CSSProperties}
      >
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
          {actionError ? (
            <p className={styles.error} role="alert">
              {actionError.message}
            </p>
          ) : null}
          {renderBody()}
        </section>
        <RailResizer
          railWidth={railWidth}
          isResizing={isResizing}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerEnd={endResize}
          onKeyDown={resizeByKey}
          onReset={resetWidth}
        />
        <aside className={styles.rail}>
          {aside}
          {meeting.status === 'done' && utterances.length ? (
            <RefinePanel meetingId={meetingId} refineResult={refineResult} />
          ) : null}
          {utterances.length ? (
            <SpeakerPanel
              speakerOptions={speakerOptions}
              utterances={utterances}
              onRenameSpeaker={renameSpeaker}
              onMergeSpeakers={mergeSpeakers}
            />
          ) : null}
        </aside>
      </div>
      {meeting.status === 'done' || meeting.status === 'error' ? (
        <RecordingBar meeting={meeting} audioRef={audioRef} onReprocess={reprocessMeeting} />
      ) : null}
    </>
  )
}
