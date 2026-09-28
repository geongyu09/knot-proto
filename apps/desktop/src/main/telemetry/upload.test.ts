import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECORDING_CHUNK_BYTES } from '@meeting-stt/telemetry/collector'
import type { UploadRow } from '../types/telemetry'

/** DB 대신 행 하나를 들고 있는 가짜 업로드 테이블 */
let uploadRow: UploadRow | null = null

vi.mock('../db/telemetry', () => ({
  findUpload: () => uploadRow,
  insertUpload: vi.fn(),
  findDueUpload: () =>
    uploadRow?.status === 'pending' && uploadRow.attempts === 0 ? uploadRow : null,
  updateUpload: (next: Omit<UploadRow, 'audioPath' | 'totalBytes'>) => {
    if (uploadRow) uploadRow = { ...uploadRow, ...next }
  }
}))
vi.mock('../db/meetings', () => ({ findMeeting: () => ({ status: 'done' }) }))
vi.mock('../db/settings', () => ({ getAppSettings: () => ({ isAudioKept: false }) }))
vi.mock('../audio/recordings', () => ({ discardRecording: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../meetingsChanged', () => ({ notifyMeetingsChanged: vi.fn() }))
vi.mock('../log', () => ({ info: vi.fn(), warn: vi.fn(), messageOf: String }))
vi.mock('./config', () => ({ isRecordingUploadEnabled: () => true }))
vi.mock('./context', () => ({ telemetryContext: () => ({ installId: 'install-1' }) }))
vi.mock('./track', () => ({ track: vi.fn() }))
vi.mock('./sinks/collector', () => ({ putCollectorRecordingChunk: vi.fn() }))

const { discardRecording } = await import('../audio/recordings')
const { putCollectorRecordingChunk } = await import('./sinks/collector')
const { track } = await import('./track')
const { uploadDueRecordings } = await import('./upload')

const sent = (receivedBytes: number) => ({
  outcome: 'sent' as const,
  status: 200,
  json: { receivedBytes }
})

let dir = ''
const TOTAL_BYTES = RECORDING_CHUNK_BYTES + 1000

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'upload-test-'))
  const audioPath = path.join(dir, 'meeting.wav')
  await writeFile(audioPath, new Uint8Array(TOTAL_BYTES))
  uploadRow = {
    meetingId: 'm1',
    audioPath,
    totalBytes: TOTAL_BYTES,
    uploadedBytes: 0,
    status: 'pending',
    attempts: 0
  }
  vi.clearAllMocks()
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('uploadDueRecordings', () => {
  it('조각으로 나눠 끝까지 올린 뒤 완료로 표시하고 원본을 지운다', async () => {
    vi.mocked(putCollectorRecordingChunk)
      .mockResolvedValueOnce(sent(RECORDING_CHUNK_BYTES))
      .mockResolvedValueOnce(sent(TOTAL_BYTES))

    await uploadDueRecordings()

    const calls = vi.mocked(putCollectorRecordingChunk).mock.calls.map(([params]) => ({
      start: params.start,
      size: params.bytes.byteLength
    }))
    expect(calls).toEqual([
      { start: 0, size: RECORDING_CHUNK_BYTES },
      { start: RECORDING_CHUNK_BYTES, size: 1000 }
    ])
    expect(uploadRow?.status).toBe('done')
    expect(discardRecording).toHaveBeenCalledWith({ meetingId: 'm1' })
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ name: 'recording_uploaded' }))
  })

  it('서버가 409로 다른 위치를 알려 주면 그 위치부터 다시 보낸다', async () => {
    vi.mocked(putCollectorRecordingChunk)
      .mockResolvedValueOnce({ outcome: 'retry', status: 409, json: { receivedBytes: 500 } })
      .mockResolvedValueOnce(sent(TOTAL_BYTES))

    await uploadDueRecordings()

    expect(vi.mocked(putCollectorRecordingChunk).mock.calls[1][0].start).toBe(500)
    expect(uploadRow?.status).toBe('done')
  })

  it('네트워크 실패는 진행 위치를 남기고 미루며 원본을 지우지 않는다', async () => {
    vi.mocked(putCollectorRecordingChunk)
      .mockResolvedValueOnce(sent(RECORDING_CHUNK_BYTES))
      .mockResolvedValueOnce({ outcome: 'retry', status: null, json: null })

    await uploadDueRecordings()

    expect(uploadRow).toMatchObject({
      status: 'pending',
      uploadedBytes: RECORDING_CHUNK_BYTES,
      attempts: 1
    })
    expect(discardRecording).not.toHaveBeenCalled()
  })

  it('원본 파일이 없으면 포기하고 실패로 표시한다', async () => {
    await rm(dir, { recursive: true, force: true })

    await uploadDueRecordings()

    expect(uploadRow?.status).toBe('failed')
    expect(putCollectorRecordingChunk).not.toHaveBeenCalled()
  })
})
