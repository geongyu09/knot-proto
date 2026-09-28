const DISPLAY_TIME_ZONE = 'Asia/Seoul'
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const BYTES_PER_KB = 1024
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB']

/** 스모크 테스트 전용 설치 id. 운영 데이터와 구분해 표시한다 (telemetry.md "환경") */
export const SMOKE_INSTALL_ID = '00000000-0000-4000-8000-000000000000'

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: DISPLAY_TIME_ZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

export const formatTime = (epochMs: number | null) =>
  epochMs === null ? '-' : dateTimeFormat.format(new Date(epochMs))

const pad2 = (value: number) => String(value).padStart(2, '0')

/** 1:02:03 또는 2:03 */
export const formatDuration = (totalSec: number) => {
  const sec = Math.max(0, Math.round(totalSec))
  const hours = Math.floor(sec / SECONDS_PER_HOUR)
  const minutes = Math.floor((sec % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = sec % SECONDS_PER_MINUTE
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${minutes}:${pad2(seconds)}`
}

export const formatBytes = (bytes: number) => {
  const unitIndex = Math.min(
    BYTE_UNITS.length - 1,
    bytes > 0 ? Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KB)) : 0
  )
  const value = bytes / BYTES_PER_KB ** unitIndex
  return `${unitIndex === 0 ? value : value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`
}

export const formatNumber = (value: number) => value.toLocaleString('ko-KR')

export const shortId = (id: string) => (id.length > 8 ? id.slice(0, 8) : id)

/** 값이 빈 키는 빼고 쿼리 문자열을 만든다 */
export const hrefOf = ({
  path,
  query = {}
}: {
  path: string
  query?: Record<string, string | number | undefined>
}) => {
  const params = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]): [string, string][] =>
      value === undefined || value === '' ? [] : [[key, String(value)]]
    )
  )
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

export const meetingPathOf = ({
  teamId,
  installId,
  meetingId
}: {
  teamId: string
  installId: string
  meetingId: string
}) => `/admin/meetings/${teamId}/${installId}/${meetingId}`
