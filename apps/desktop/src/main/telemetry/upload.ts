import { existsSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import {
  isRecordingUploadResponse,
  RECORDING_CHUNK_BYTES,
  RECORDING_OFFSET_MISMATCH_STATUS
} from '@meeting-stt/telemetry/collector'
import { discardRecording } from '../audio/recordings'
import { findMeeting } from '../db/meetings'
import { getAppSettings } from '../db/settings'
import { findDueUpload, findUpload, insertUpload, updateUpload } from '../db/telemetry'
import { info, messageOf, warn } from '../log'
import { notifyMeetingsChanged } from '../meetingsChanged'
import type { UploadRow } from '../types/telemetry'
import { retryDelayMs } from './backoff'
import { isRecordingUploadEnabled } from './config'
import { telemetryContext } from './context'
import { putCollectorRecordingChunk } from './sinks/collector'
import { track } from './track'

/**
 * 녹음 WAV 이어 올리기 (references/telemetry.md "수집 항목", "전송 계약").
 * 업로드가 끝나기 전에는 `audio.keep`이 꺼져 있어도 원본을 지우지 않고, 끝나는 순간 그때의 설정대로 지운다.
 */

/**
 * 회의의 녹음을 업로드 대기열에 올린다. 이미 있으면 그대로 둔다(다시 인식한 회의).
 * 업로드가 아직 안 끝났으면 true — 호출한 쪽은 원본을 지우지 않는다.
 */
export const registerRecordingUpload = async ({
  meetingId,
  audioPath
}: {
  meetingId: string
  audioPath: string
}) => {
  if (!isRecordingUploadEnabled()) return false

  try {
    if (!findUpload({ meetingId })) {
      const { size } = await stat(audioPath)
      insertUpload({ meetingId, audioPath, totalBytes: size, now: Date.now() })
    }

    return findUpload({ meetingId })?.status === 'pending'
  } catch (caught) {
    warn(`녹음 업로드 등록 실패 (${meetingId}): ${messageOf(caught)}`)

    return false
  }
}

/** 업로드가 끝났거나 포기한 녹음에 원래의 보관 규칙을 적용한다. 처리 중·실패한 회의는 원본이 필요해 남긴다 */
const applyRetentionAfterUpload = async ({ meetingId }: { meetingId: string }) => {
  if (getAppSettings().isAudioKept) return
  if (findMeeting({ meetingId })?.status !== 'done') return

  try {
    await discardRecording({ meetingId })
    notifyMeetingsChanged()
  } catch (caught) {
    warn(`업로드 뒤 원본 녹음 삭제 실패 (${meetingId}): ${messageOf(caught)}`)
  }
}

const readChunk = async ({ path, start }: { path: string; start: number }) => {
  const handle = await open(path, 'r')
  try {
    const buffer = new Uint8Array(RECORDING_CHUNK_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, RECORDING_CHUNK_BYTES, start)

    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

const saveProgress = ({ row, uploadedBytes }: { row: UploadRow; uploadedBytes: number }) =>
  updateUpload({
    meetingId: row.meetingId,
    uploadedBytes,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Date.now()
  })

const postpone = ({ row, isAuthFailure }: { row: UploadRow; isAuthFailure: boolean }) => {
  const attempts = row.attempts + 1
  updateUpload({
    meetingId: row.meetingId,
    uploadedBytes: row.uploadedBytes,
    status: 'pending',
    attempts,
    nextAttemptAt: Date.now() + retryDelayMs({ attempts, isAuthFailure })
  })
}

const giveUp = async ({ row, reason }: { row: UploadRow; reason: string }) => {
  warn(`녹음 업로드 포기 (${row.meetingId}): ${reason}`)
  updateUpload({ ...row, status: 'failed', nextAttemptAt: Date.now() })
  await applyRetentionAfterUpload({ meetingId: row.meetingId })
}

type ChunkResult = { kind: 'next'; uploadedBytes: number } | { kind: 'stop' }

/** 조각 하나를 보낸다. 서버가 가진 위치가 다르면(409) 그 위치로 맞춘다 */
const sendChunk = async ({ row, uploadedBytes }: { row: UploadRow; uploadedBytes: number }) => {
  const bytes = await readChunk({ path: row.audioPath, start: uploadedBytes })
  const { installId } = telemetryContext()
  const { outcome, status, json } = await putCollectorRecordingChunk({
    installId,
    meetingId: row.meetingId,
    bytes,
    start: uploadedBytes,
    total: row.totalBytes
  })

  const isOffsetMismatch = status === RECORDING_OFFSET_MISMATCH_STATUS
  if ((outcome === 'sent' || isOffsetMismatch) && isRecordingUploadResponse(json)) {
    return { kind: 'next', uploadedBytes: json.receivedBytes } satisfies ChunkResult
  }
  if (outcome === 'drop') {
    await giveUp({ row, reason: `서버 응답 ${status}` })
    return { kind: 'stop' } satisfies ChunkResult
  }

  postpone({ row: { ...row, uploadedBytes }, isAuthFailure: outcome === 'auth' })
  return { kind: 'stop' } satisfies ChunkResult
}

const uploadRecording = async (row: UploadRow) => {
  if (!existsSync(row.audioPath)) {
    await giveUp({ row, reason: '원본 파일이 없음' })
    return
  }

  const startedAt = Date.now()
  let uploadedBytes = row.uploadedBytes
  while (uploadedBytes < row.totalBytes) {
    const result: ChunkResult = await sendChunk({ row, uploadedBytes })
    if (result.kind === 'stop') return
    // 서버가 위치를 앞으로 옮겨 주지 않으면 같은 조각을 끝없이 보내게 된다
    if (result.uploadedBytes === uploadedBytes) {
      postpone({ row: { ...row, uploadedBytes }, isAuthFailure: false })
      return
    }

    uploadedBytes = result.uploadedBytes
    saveProgress({ row, uploadedBytes })
  }

  updateUpload({ ...row, uploadedBytes, status: 'done', nextAttemptAt: Date.now() })
  info(`녹음 업로드 완료 (${row.meetingId}, ${row.totalBytes}B)`)
  track({
    name: 'recording_uploaded',
    props: { meetingId: row.meetingId, bytes: row.totalBytes, elapsedMs: Date.now() - startedAt }
  })
  await applyRetentionAfterUpload({ meetingId: row.meetingId })
}

let isUploading = false

/** 때가 된 업로드를 하나씩 끝까지 올린다. 동시에 두 번 돌지 않는다 */
export const uploadDueRecordings = async () => {
  if (isUploading || !isRecordingUploadEnabled()) return
  isUploading = true

  try {
    for (
      let row = findDueUpload({ now: Date.now() });
      row;
      row = findDueUpload({ now: Date.now() })
    ) {
      await uploadRecording(row)
    }
  } catch (caught) {
    warn(`녹음 업로드 중 오류: ${messageOf(caught)}`)
  } finally {
    isUploading = false
  }
}
