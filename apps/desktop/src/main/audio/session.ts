import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import { CHUNK_SAMPLES, rmsOf, SAMPLE_RATE_HZ } from '@shared/audio'
import type { RecordingStateEvent } from '@shared/ipc'
import {
  findMeeting,
  insertMeeting,
  updateMeetingDuration,
  updateMeetingSpeakerCount,
  updateMeetingStatus
} from '../db/meetings'
import { getSystemAudioEnabled, setSystemAudioEnabled } from '../db/settings'
import { info, messageOf, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import { enqueuePipelineJob } from '../pipeline/queue'
import {
  feedLiveTranscript,
  getLiveTranscriptState,
  resetLiveTranscript,
  setLiveTranscriptEnabled
} from './liveTranscript'
import { probeSystemAudio, startSystemAudioCapture, type SystemAudioCapture } from './systemAudio'
import { mixSamples } from './systemAudioMix'
import { createWavWriter, type WavWriter } from './wavWriter'
import { t } from '../locale'

/** 이보다 짧으면 사실상 빈 녹음이라 파이프라인을 돌리지 않는다 */
export const MIN_RECORDING_SEC = 1

interface RecordingSession {
  meetingId: string
  /** 경과 시간의 기준 시각. 재개할 때마다 멈춰 있던 시간만큼 뒤로 민다 */
  startedAt: number
  /** 일시정지한 시각. 이 동안 들어온 청크는 버린다 (references/architecture.md "일시정지·재개") */
  pausedAt: number | null
  writer: WavWriter
  level: number
  /** 온라인 회의 소리 캡처. 켜져 있어도 도구가 실패하면 null이고 마이크만 녹음한다 */
  systemAudio: SystemAudioCapture | null
}

/**
 * 진행 중 녹음의 단일 출처. 오디오 그래프는 녹음 호스트 창 하나가 들고 있고, 상태는 여기에만 있다
 * (references/architecture.md의 "녹음 호스트 창 · 메뉴바 · 전역 단축키").
 */
let session: RecordingSession | null = null

/**
 * 참석자 수는 세션 밖에 둔다 — 녹음 시작 전에도 입력할 수 있고, 정지 후에도 남아 다음 녹음에 그대로 쓰인다.
 * 두 창의 입력란에 계속 보이므로 숨은 값이 아니다.
 */
let speakerCount: number | undefined

/**
 * 온라인 회의 소리 함께 녹음 (Phase 5-2). 참석자 수처럼 세션 밖에 두고, DB(`audio.systemCapture`)에서 처음 한 번 읽어 캐시한다.
 * 실패 안내는 켜기(프로브)나 녹음 중 캡처가 끊겼을 때 실리고 다음 시도에서 지운다.
 */
let isSystemAudioEnabled: boolean | undefined
let systemAudioError: string | undefined

const systemAudioEnabled = () => {
  if (isSystemAudioEnabled === undefined) isSystemAudioEnabled = getSystemAudioEnabled()

  return isSystemAudioEnabled
}

let notifyState: (event: RecordingStateEvent) => void = () => {}

export const recordingsDir = () => path.join(app.getPath('userData'), 'recordings')

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 기본 제목은 "2026-08-26 회의" (references/data-model.md) */
export const defaultTitle = (createdAt: number) => {
  const date = new Date(createdAt)

  return t().main.recording.defaultTitle({
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  })
}

/** main이 창을 만든 뒤 한 번 등록한다. 창이 없을 때 보내면 무시된다 */
export const setRecordingStateListener = (listener: (event: RecordingStateEvent) => void) => {
  notifyState = listener
}

export const getRecordingState = (): RecordingStateEvent => ({
  meetingId: session?.meetingId ?? null,
  startedAt: session?.startedAt ?? null,
  pausedAt: session?.pausedAt ?? null,
  level: session?.level ?? 0,
  speakerCount,
  liveTranscript: getLiveTranscriptState(),
  systemAudio: {
    isEnabled: systemAudioEnabled(),
    ...(systemAudioError ? { errorMessage: systemAudioError } : {})
  }
})

/** `stoppedMeetingId`·`errorMessage`처럼 한 번만 실리는 값은 여기서 얹는다 */
const publish = (extra: Partial<RecordingStateEvent> = {}) =>
  notifyState({ ...getRecordingState(), ...extra })

export const isRecording = () => session !== null

const sessionOf = (meetingId: string) => {
  if (session?.meetingId !== meetingId) throw new Error(t().main.recording.notActive)

  return session
}

/** 회의 행과 WAV 파일을 함께 만든다. id를 먼저 정해야 파일 이름이 정해진다 */
export const startRecording = async ({ sampleRate }: { sampleRate: number }) => {
  if (session) throw new Error(t().main.recording.alreadyActive)
  if (sampleRate !== SAMPLE_RATE_HZ) {
    throw new Error(
      t().main.recording.sampleRateUnsupported({ expected: SAMPLE_RATE_HZ, actual: sampleRate })
    )
  }

  const meetingId = randomUUID()
  const createdAt = Date.now()
  const audioPath = path.join(recordingsDir(), `${meetingId}.wav`)

  await mkdir(recordingsDir(), { recursive: true })
  const writer = await createWavWriter({ filePath: audioPath })
  insertMeeting({ id: meetingId, title: defaultTitle(createdAt), createdAt, audioPath })
  session = {
    meetingId,
    startedAt: createdAt,
    pausedAt: null,
    writer,
    level: 0,
    systemAudio: null
  }
  if (systemAudioEnabled()) session.systemAudio = openSystemAudio({ meetingId })
  resetLiveTranscript()
  info(`녹음 시작 ${meetingId}`)
  publish()
  notifyMeetingsChanged()

  return { meetingId }
}

/** 실패해도 녹음은 마이크만으로 계속한다 — 회의 중에 녹음이 통째로 실패하는 것보다 낫다 */
const openSystemAudio = ({ meetingId }: { meetingId: string }) => {
  systemAudioError = undefined
  const onFailure = (message: string) => {
    if (session?.meetingId !== meetingId) return
    warn(`시스템 오디오 캡처 실패 ${meetingId}: ${message}`)
    session.systemAudio = null
    systemAudioError = message
    publish()
  }

  try {
    const capture = startSystemAudioCapture({ onFailure })
    capture.ready.catch((caught: unknown) => onFailure(messageOf(caught)))

    return capture
  } catch (caught) {
    onFailure(messageOf(caught))

    return null
  }
}

/** 상대방의 마지막 말이 FIFO에 남아 있을 수 있어 한 청크 더 쓴 뒤 도구를 끝낸다 */
const closeSystemAudio = async (active: RecordingSession) => {
  const capture = active.systemAudio
  if (!capture) return

  active.systemAudio = null
  const rest = capture.drain(CHUNK_SAMPLES)
  if (rest.length > 0) await active.writer.appendChunk(rest)
  await capture.stop()
}

export const appendRecordingChunk = async ({
  meetingId,
  pcm
}: {
  meetingId: string
  pcm: ArrayBuffer
}) => {
  // 끝난 녹음이나 남은 오디오 그래프가 보낸 청크다. 사용자에게 알릴 실패가 아니라 버린다 (references/pitfalls.md)
  if (session?.meetingId !== meetingId) {
    warn(`진행 중이 아닌 녹음의 청크를 버렸습니다 ${meetingId}`)
    return
  }

  const active = session
  const micSamples = new Float32Array(pcm)

  // 호스트 창의 오디오 그래프는 일시정지와 무관하게 돌아 청크가 계속 온다. 멈춰 있던 동안의 상대방 소리가
  // 재개 뒤에 섞이지 않도록 시스템 오디오도 같은 길이만큼 꺼내 버린다
  if (active.pausedAt !== null) {
    active.systemAudio?.take(micSamples.length)
    active.level = 0
    publish()
    return
  }

  // 섞은 결과가 WAV·레벨·라이브 받아쓰기의 입력이다. 파이프라인은 손대지 않는다
  const samples = active.systemAudio
    ? mixSamples({ base: micSamples, overlay: active.systemAudio.take(micSamples.length) })
    : micSamples

  await active.writer.appendChunk(samples)
  // 레벨 미터는 여기서 계산해 두 창에 같은 값을 보낸다 (renderer마다 따로 재지 않는다)
  active.level = rmsOf(samples)
  // 인식 결과는 따로 publish하지 않고 다음 청크 이벤트에 실린다 — 0.5초 안에 실려 가는 값이라 이벤트를 늘릴 이유가 없다
  feedLiveTranscript({ samples, rms: active.level })
  publish()
}

/** 헤더를 확정하고 파이프라인 잡을 큐에 넣는다 */
export const stopRecording = async ({ meetingId }: { meetingId: string }) => {
  const active = sessionOf(meetingId)
  await closeSystemAudio(active)
  const { durationSec } = await active.writer.finalize()
  session = null
  resetLiveTranscript()
  updateMeetingDuration({ meetingId, durationSec })
  if (speakerCount) updateMeetingSpeakerCount({ meetingId, speakerCount })
  info(
    `녹음 종료 ${meetingId} (${durationSec.toFixed(1)}초${speakerCount ? `, 참석자 ${speakerCount}명` : ''})`
  )

  if (durationSec < MIN_RECORDING_SEC) {
    updateMeetingStatus({
      meetingId,
      status: 'error',
      errorMessage: t().main.recording.tooShort
    })
  } else {
    enqueuePipelineJob({ meetingId })
  }

  publish({ stoppedMeetingId: meetingId })
  notifyMeetingsChanged()

  const meeting = findMeeting({ meetingId })
  if (!meeting) throw new Error(t().main.recording.meetingInfoNotFound)

  return meeting
}

/** 값이 바뀌면 두 창의 입력란이 같은 값을 보도록 바로 알린다. 검증은 핸들러가 끝냈다 */
export const setRecordingSpeakerCount = (next: number | undefined) => {
  speakerCount = next
  publish()

  return getRecordingState()
}

/** 재개할 때 기준 시각을 멈춰 있던 시간만큼 밀어 경과 시간이 일시정지 구간을 세지 않게 한다 */
export const setRecordingPaused = (isPaused: boolean) => {
  if (!session) throw new Error(t().main.recording.notActive)
  if ((session.pausedAt !== null) === isPaused) return getRecordingState()

  const now = Date.now()
  if (isPaused) {
    session.pausedAt = now
    session.level = 0
  } else if (session.pausedAt !== null) {
    session.startedAt += now - session.pausedAt
    session.pausedAt = null
  }
  info(`녹음 ${isPaused ? '일시정지' : '재개'} ${session.meetingId}`)
  publish()

  return getRecordingState()
}

/** 녹음 화면의 파형 ↔ 라이브 받아쓰기 보기. 참석자 수처럼 세션 밖에 두어 다음 녹음에도 이어진다 */
export const setRecordingLiveTranscript = (isEnabled: boolean) => {
  setLiveTranscriptEnabled(isEnabled)
  publish()

  return getRecordingState()
}

/**
 * 온라인 회의 소리 함께 녹음 켜기/끄기. 켤 때는 도구를 한 번 돌려 권한 창을 미리 띄우고 실패를 그 자리에서 알린다.
 * 녹음 중에는 프로브 없이 값만 바꾼다 (다음 녹음부터 적용, 화면은 스위치를 비활성화한다).
 */
export const setRecordingSystemAudio = async (isEnabled: boolean) => {
  systemAudioError = undefined

  if (isEnabled && !session) {
    try {
      await probeSystemAudio()
    } catch (caught) {
      systemAudioError = messageOf(caught)
      warn(`시스템 오디오 프로브 실패: ${systemAudioError}`)
      isEnabled = false
    }
  }

  isSystemAudioEnabled = isEnabled
  setSystemAudioEnabled({ isEnabled })
  publish()

  return getRecordingState()
}

/**
 * 마이크 권한 거부처럼 녹음 호스트 창에서만 알 수 있는 실패를 메인 창에 전한다.
 * 시작을 누른 사람이 메인 창에 있을 수 있어 실패가 보이지 않는 호스트 창에만 남으면 안 된다.
 */
export const reportRecordingError = ({ message }: { message: string }) =>
  publish({ errorMessage: message })

/**
 * 종료 직전에 진행 중 녹음을 마무리한다. 헤더가 확정되지 않은 WAV는 파이프라인이 읽지 못한다.
 * Phase 5-3부터 화면 이동으로 정지되지 않으므로 이 경로가 마지막 방어선이다.
 */
export const finalizeActiveRecording = async () => {
  if (!session) return false

  await stopRecording({ meetingId: session.meetingId })

  return true
}
