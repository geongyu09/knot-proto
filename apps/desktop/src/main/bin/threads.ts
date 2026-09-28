import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'
import { messageOf, warn } from '../log'

const execFileAsync = promisify(execFile)

/** 성능 코어 수. Apple Silicon은 효율 코어까지 세면 스레드를 과하게 잡는다 */
const PERFORMANCE_CORE_KEY = 'hw.perflevel0.logicalcpu'

/**
 * GPU가 일하는 동안 CPU 스레드는 Metal 커맨드 버퍼 인코딩과 스핀 대기에만 쓰인다.
 * 더 준다고 빨라지지 않아 화자 분리에 코어를 양보한다 (references/architecture.md).
 */
const STT_MAX_THREADS = 4
const SUMMARY_MAX_THREADS = 2

/**
 * 조용히 처리할 때 화자 분리는 성능 코어의 절반만 쓴다. CPU 부하가 절반이 되고 시간은 44% 는다.
 * 더 줄이면 시간만 늘고 누적 CPU 시간은 거의 그대로다 (references/architecture.md)
 */
const QUIET_DIARIZE_CORE_DIVISOR = 2

/** sysctl을 읽지 못했을 때의 어림값. Apple Silicon은 성능·효율 코어가 대체로 반반이다 */
const FALLBACK_PERFORMANCE_RATIO = 2

interface PlanThreadsParams {
  performanceCores: number
  /** 설정 '조용히 처리'. 속도를 내주고 화자 분리의 발열·팬 소음을 줄인다 */
  isQuiet?: boolean
}

/**
 * 성능 코어 수 하나로 세 바이너리의 스레드 수를 정한다.
 * 실측 근거는 `references/architecture.md`의 가속·스레드 정책.
 */
export const planThreads = ({ performanceCores, isQuiet = false }: PlanThreadsParams) => {
  const cores = Math.max(1, Math.floor(performanceCores))

  return {
    stt: Math.min(STT_MAX_THREADS, cores),
    diarize: isQuiet ? Math.ceil(cores / QUIET_DIARIZE_CORE_DIVISOR) : cores,
    summary: Math.min(SUMMARY_MAX_THREADS, cores)
  }
}

const readPerformanceCores = async () => {
  try {
    const { stdout } = await execFileAsync('sysctl', ['-n', PERFORMANCE_CORE_KEY])
    const parsed = Number(stdout.trim())
    if (Number.isInteger(parsed) && parsed > 0) return parsed

    warn(`${PERFORMANCE_CORE_KEY} 값을 읽지 못했습니다: ${stdout.trim()}`)
  } catch (caught) {
    warn(`성능 코어 수 조회에 실패했습니다: ${messageOf(caught)}`)
  }

  return Math.max(1, Math.round(os.cpus().length / FALLBACK_PERFORMANCE_RATIO))
}

let performanceCoresPromise: Promise<number> | null = null

interface ThreadPlanParams {
  isQuiet?: boolean
}

/**
 * 외부 바이너리에 넘길 스레드 수. 코어 구성은 바뀌지 않으므로 프로세스 수명 동안 한 번만 조회한다.
 * 동기 spawn은 UI를 멈추므로 쓰지 않는다 (references/pitfalls.md).
 */
export const threadPlan = async ({ isQuiet = false }: ThreadPlanParams = {}) =>
  planThreads({ performanceCores: await performanceCoreCount(), isQuiet })

/** 성능 코어 수. 코어 구성은 바뀌지 않으므로 프로세스 수명 동안 한 번만 조회한다 */
export const performanceCoreCount = () => {
  performanceCoresPromise ??= readPerformanceCores()

  return performanceCoresPromise
}
