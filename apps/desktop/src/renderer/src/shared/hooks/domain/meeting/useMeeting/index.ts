import { useCallback, useEffect, useState } from 'react'
import type { MeetingDetail } from '@shared/types'
import { onPipelineProgress, onRefineProgress } from '@renderer/shared/api/events'
import {
  deleteMeetingApi,
  getMeetingApi,
  renameMeetingApi,
  reprocessMeetingApi
} from '@renderer/shared/api/meetings'
import { mergeSpeakersApi, renameSpeakerApi } from '@renderer/shared/api/speakers'
import {
  reassignUtteranceApi,
  revertUtteranceRefineApi,
  updateUtteranceTextApi
} from '@renderer/shared/api/utterances'
import { useLocale } from '@renderer/shared/provider/context/localeContext'

interface UseMeetingParams {
  meetingId: string
}

type DetailListener = (detail: MeetingDetail) => void

/**
 * 같은 회의를 여러 위젯이 각자 읽는다(결정 문서와 원문 패널, 회의록과 요약). 한쪽에서 화자 이름·발화를 고치면
 * 다른 쪽도 곧바로 같은 상세를 보게 편집 결과를 이 창 안에서 나눈다 (references/decisions.md "원문 패널").
 */
const detailListeners = new Set<DetailListener>()

const publishDetail = (detail: MeetingDetail) => {
  detailListeners.forEach((listener) => listener(detail))
}

const useMeeting = ({ meetingId }: UseMeetingParams) => {
  const { t } = useLocale()
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)

  // effect에서 부르는 함수라 await 대신 프로미스 체인으로 쓴다 (useMeetings와 같은 이유)
  const fetchMeeting = useCallback(
    () =>
      getMeetingApi({ meetingId })
        .then((next) => {
          setDetail(next)
          setError(null)
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught : new Error(t.transcript.errors.load))
        )
        .finally(() => setIsLoading(false)),
    [meetingId, t]
  )

  const refetch = useCallback(() => {
    setIsLoading(true)

    return fetchMeeting()
  }, [fetchMeeting])

  useEffect(() => {
    fetchMeeting()
  }, [fetchMeeting])

  // 이 회의의 처리가 끝났을 때만 다시 읽는다
  useEffect(
    () =>
      onPipelineProgress((event) => {
        if (event.meetingId !== meetingId) return
        if (event.stage === 'done' || event.stage === 'error') fetchMeeting()
      }),
    [meetingId, fetchMeeting]
  )

  // 자동 교정이 본문을 바꾸므로 잡이 끝나면 다시 읽는다 (references/architecture.md "회의록 교정")
  useEffect(
    () =>
      onRefineProgress((event) => {
        if (event.meetingId === meetingId && event.stage === 'done') fetchMeeting()
      }),
    [meetingId, fetchMeeting]
  )

  useEffect(() => {
    const listener: DetailListener = (next) => {
      if (next.meeting.id === meetingId) setDetail(next)
    }
    detailListeners.add(listener)

    return () => {
      detailListeners.delete(listener)
    }
  }, [meetingId])

  /** 편집 채널은 갱신된 상세를 그대로 돌려준다 (references/architecture.md) */
  const applyMutation = async (mutate: () => Promise<MeetingDetail>) => {
    try {
      const next = await mutate()
      setDetail(next)
      publishDetail(next)
      setSaveError(null)

      return true
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught : new Error(t.transcript.errors.save))

      return false
    }
  }

  const renameMeeting = ({ title }: { title: string }) =>
    applyMutation(() => renameMeetingApi({ meetingId, title }))

  const editUtteranceText = ({ utteranceId, text }: { utteranceId: string; text: string }) =>
    applyMutation(() => updateUtteranceTextApi({ meetingId, utteranceId, text }))

  const reassignUtterance = ({
    utteranceId,
    speakerLabel
  }: {
    utteranceId: string
    speakerLabel: string
  }) => applyMutation(() => reassignUtteranceApi({ meetingId, utteranceId, speakerLabel }))

  /** 교정된 발화를 원문으로 되돌린다. 응답에 교정 결과(refineResult)도 함께 바뀌어 온다 */
  const revertUtteranceRefine = ({ utteranceId }: { utteranceId: string }) =>
    applyMutation(() => revertUtteranceRefineApi({ meetingId, utteranceId }))

  const renameSpeaker = ({ label, displayName }: { label: string; displayName: string }) =>
    applyMutation(() => renameSpeakerApi({ meetingId, label, displayName }))

  const mergeSpeakers = ({ fromLabel, intoLabel }: { fromLabel: string; intoLabel: string }) =>
    applyMutation(() => mergeSpeakersApi({ meetingId, fromLabel, intoLabel }))

  /** 응답은 처리 중으로 바뀐 상세다. 끝나면 진행률 이벤트의 done·error로 다시 읽는다 */
  const reprocessMeeting = ({ speakerCount }: { speakerCount: number | null }) =>
    applyMutation(() => reprocessMeetingApi({ meetingId, speakerCount }))

  /** 성공하면 상세가 사라지므로 호출한 쪽이 화면을 옮긴다 */
  const removeMeeting = async () => {
    try {
      await deleteMeetingApi({ meetingId })
      setSaveError(null)

      return true
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught : new Error(t.transcript.errors.remove))

      return false
    }
  }

  return {
    meeting: detail?.meeting ?? null,
    utterances: detail?.utterances ?? [],
    speakers: detail?.speakers ?? [],
    refineResult: detail?.refineResult ?? null,
    isLoading,
    error,
    saveError,
    refetch,
    renameMeeting,
    editUtteranceText,
    reassignUtterance,
    revertUtteranceRefine,
    renameSpeaker,
    mergeSpeakers,
    reprocessMeeting,
    removeMeeting
  }
}

export default useMeeting
