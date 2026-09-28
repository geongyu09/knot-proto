const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

const pad2 = (value: number) => String(value).padStart(2, '0')

/**
 * 녹음 타이머용 "12:47". 한 시간이 넘으면 "1:02:03"이 된다.
 * 회의록 타임스탬프(`formatTimestamp`, 항상 시:분:초)와 달리 짧은 회의가 대부분이라 한 시간 미만이면 시를 생략한다.
 */
export const formatClock = ({ sec }: { sec: number }) => {
  const total = Math.max(0, Math.floor(sec))
  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE

  return hours ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`
}
