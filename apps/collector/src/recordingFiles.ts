import { existsSync } from 'node:fs'
import { mkdir, open, rename, truncate } from 'node:fs/promises'
import path from 'node:path'

import type { RecordingKey } from './recordingStore'

const PART_SUFFIX = '.part'

interface RecordingPathParams extends RecordingKey {
  recordingsDir: string
}

/** 세 값 모두 PATH_SEGMENT_PATTERN을 통과한 뒤에만 부른다 — 경로 탈출 문자가 없다 */
export const recordingPathOf = ({
  recordingsDir,
  teamId,
  installId,
  meetingId
}: RecordingPathParams) => path.join(recordingsDir, teamId, installId, `${meetingId}.wav`)

export const partPathOf = (finalPath: string) => `${finalPath}${PART_SUFFIX}`

export const hasPartFile = (finalPath: string) => existsSync(partPathOf(finalPath))

interface WriteChunkParams {
  finalPath: string
  chunk: Uint8Array
  start: number
}

/**
 * 조각을 `.part` 파일의 start 위치에 쓴다. 첫 조각이면 새로 만든다.
 * DB 갱신 전에 서버가 죽어 파일이 DB보다 길어져도, 다음 조각이 DB 기준 위치에 덮어쓰므로 어긋나지 않는다.
 */
export const writeChunk = async ({ finalPath, chunk, start }: WriteChunkParams) => {
  await mkdir(path.dirname(finalPath), { recursive: true })
  const handle = await open(partPathOf(finalPath), start === 0 ? 'w' : 'r+')
  try {
    await handle.write(chunk, 0, chunk.length, start)
  } finally {
    await handle.close()
  }
}

interface CompleteRecordingParams {
  finalPath: string
  totalBytes: number
}

/** 마지막 조각을 받은 뒤 남은 꼬리를 자르고 `.part`를 떼어 완성본으로 만든다 */
export const completeRecording = async ({ finalPath, totalBytes }: CompleteRecordingParams) => {
  const partPath = partPathOf(finalPath)
  await truncate(partPath, totalBytes)
  await rename(partPath, finalPath)
}
