import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { parseContentRange, type RecordingUploadResponse } from '@meeting-stt/telemetry/collector'

import * as log from '../log'
import { completeRecording, hasPartFile, recordingPathOf, writeChunk } from '../recordingFiles'
import { getRecording, saveRecordingProgress } from '../recordingStore'
import type { CollectorDeps, CollectorEnv } from '../types/collector'
import { isPathSegment } from '../validate'
import { tooLarge } from './body'

const MAX_RECORDING_CHUNK_BYTES = 16 * 1024 * 1024
const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024
const OFFSET_MISMATCH_STATUS = 409

/**
 * `PUT /v1/recordings/{installId}/{meetingId}` — `Content-Range` 조각 이어 올리기 (telemetry.md "전송 계약").
 * 서버가 가진 바이트 수와 조각 시작이 다르면 409 { receivedBytes }로 이어 올릴 위치를 알려 준다.
 */
export const createRecordingsRoute = ({ db, recordingsDir, now = Date.now }: CollectorDeps) => {
  // 같은 녹음에 조각이 동시에 오면 둘 다 같은 위치에 쓰려 하므로 한 번에 하나만 받는다
  const uploadingKeys = new Set<string>()

  return new Hono<CollectorEnv>().put(
    '/:installId/:meetingId',
    bodyLimit({ maxSize: MAX_RECORDING_CHUNK_BYTES, onError: tooLarge }),
    async (c) => {
      const { installId, meetingId } = c.req.param()
      const teamId = c.get('teamId')
      if (!isPathSegment(installId) || !isPathSegment(meetingId)) {
        return c.json({ error: 'installId·meetingId 형식이 틀렸습니다' }, 400)
      }
      const range = parseContentRange(c.req.header('Content-Range') ?? '')
      if (!range) return c.json({ error: 'Content-Range 헤더가 없거나 형식이 틀렸습니다' }, 400)
      if (range.total > MAX_RECORDING_BYTES)
        return c.json({ error: '녹음 파일이 너무 큽니다' }, 413)

      const key = { teamId, installId, meetingId }
      const progress = getRecording({ db, ...key })
      // 전체 크기가 바뀌었으면 다른 파일이다. 0부터 다시 받는다 (telemetry.md "수집 서버")
      const isSizeChanged = progress !== null && progress.totalBytes !== range.total
      const receivedBytes = isSizeChanged ? 0 : (progress?.receivedBytes ?? 0)
      const reply = (bytes: number, status: 200 | typeof OFFSET_MISMATCH_STATUS = 200) =>
        c.json<RecordingUploadResponse>({ receivedBytes: bytes }, status)

      if (progress?.isComplete && !isSizeChanged) return reply(progress.totalBytes)
      const uploadKey = `${teamId}/${installId}/${meetingId}`
      if (uploadingKeys.has(uploadKey)) return reply(receivedBytes, OFFSET_MISMATCH_STATUS)
      if (range.start !== receivedBytes) return reply(receivedBytes, OFFSET_MISMATCH_STATUS)

      const finalPath = recordingPathOf({ recordingsDir, ...key })
      // DB에는 진행이 있는데 디스크의 .part가 사라졌으면(서버 디스크 정리 등) 처음부터 다시 받는다
      if (receivedBytes > 0 && !hasPartFile(finalPath)) {
        saveRecordingProgress({ db, ...key, totalBytes: range.total, receivedBytes: 0, now: now() })
        return reply(0, OFFSET_MISMATCH_STATUS)
      }

      uploadingKeys.add(uploadKey)
      try {
        const chunk = new Uint8Array(await c.req.arrayBuffer())
        if (chunk.length !== range.end - range.start + 1) {
          return c.json({ error: '본문 길이가 Content-Range와 다릅니다' }, 400)
        }
        await writeChunk({ finalPath, chunk, start: range.start })
        const nextReceived = range.end + 1
        const isComplete = nextReceived === range.total
        if (isComplete) {
          await completeRecording({ finalPath, totalBytes: range.total })
        }
        saveRecordingProgress({
          db,
          ...key,
          totalBytes: range.total,
          receivedBytes: nextReceived,
          now: now()
        })
        log.info(
          `[${teamId}] 녹음 ${meetingId} ${nextReceived}/${range.total} 바이트${isComplete ? ' — 완료' : ''}`
        )
        return reply(nextReceived)
      } finally {
        uploadingKeys.delete(uploadKey)
      }
    }
  )
}
