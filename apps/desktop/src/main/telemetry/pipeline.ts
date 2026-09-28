import type { MergedUtterance } from '@meeting-stt/core/types'
import { findMeeting } from '../db/meetings'
import { getWhisperModelId } from '../db/settings'
import { track } from './track'

interface TrackPipelineCompletedParams {
  meetingId: string
  startedAt: number
  /** `createStageTimer().durations()` 결과. 단계 이름 → ms */
  durations: Record<string, number>
  isQuiet: boolean
  isReprocess: boolean
  speakerCount: number | undefined
  utterances: MergedUtterance[]
}

/** 파이프라인 성능 지표 (references/telemetry.md "수집 항목") */
export const trackPipelineCompleted = ({
  meetingId,
  startedAt,
  durations,
  isQuiet,
  isReprocess,
  speakerCount,
  utterances
}: TrackPipelineCompletedParams) =>
  track({
    name: 'pipeline_completed',
    props: {
      meetingId,
      audioSec: findMeeting({ meetingId })?.durationSec ?? 0,
      totalMs: Date.now() - startedAt,
      sttMs: durations.stt ?? 0,
      diarizeMs: durations.diarize ?? 0,
      mergeMs: durations.merge ?? 0,
      saveMs: durations.save ?? 0,
      whisperModelId: getWhisperModelId(),
      isQuiet,
      isReprocess,
      speakerCountInput: speakerCount ?? null,
      speakerCountResult: new Set(utterances.map(({ speakerLabel }) => speakerLabel)).size,
      utteranceCount: utterances.length
    }
  })
