import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/

/** 단일 범위만 해석한다. 브라우저 `<audio>`는 여러 범위를 요청하지 않는다. 해석할 수 없으면 null(전체 전송) */
export const parseRangeHeader = ({
  header,
  size
}: {
  header: string | undefined
  size: number
}) => {
  const match = header ? RANGE_PATTERN.exec(header.trim()) : null
  if (!match || (match[1] === '' && match[2] === '')) return null
  // `bytes=-500`은 끝에서 500바이트
  if (match[1] === '') {
    const suffix = Number(match[2])
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start <= end && start < size ? { start, end } : 'unsatisfiable'
}

/** 완료된 녹음 WAV를 Range 요청에 맞춰 흘려보낸다 — 수백 MB라 메모리에 올리지 않는다 */
export const streamRecording = async ({
  filePath,
  rangeHeader,
  fileName
}: {
  filePath: string
  rangeHeader: string | undefined
  fileName: string
}) => {
  const { size } = await stat(filePath)
  const range = parseRangeHeader({ header: rangeHeader, size })
  const baseHeaders = {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `inline; filename="${fileName}"`
  }
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const { start, end } = range ?? { start: 0, end: size - 1 }
  const body = Readable.toWeb(createReadStream(filePath, { start, end })) as WebReadableStream
  return new Response(body as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(end - start + 1),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
    }
  })
}
