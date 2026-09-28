const FULL_PERCENT = 100

export interface StageMark {
  stage: string
  percent: number
  /** epoch ms */
  at: number
}

/**
 * 진행률 보고 시각으로 단계별 소요 시간을 잰다. 파이프라인 코드에 타이머를 심지 않기 위해서다.
 * - 100%를 보고한 단계는 첫 보고부터 마지막 보고까지 (STT·화자 분리는 병렬이라 서로 겹친다)
 * - 100%를 보고하지 않는 단계(병합·저장)는 첫 보고부터 **그 뒤 다른 단계의 첫 보고**까지
 */
export const stageDurations = ({ marks, endAt }: { marks: StageMark[]; endAt: number }) => {
  const stages = [...new Set(marks.map(({ stage }) => stage))]

  const durationOf = (stage: string) => {
    const own = marks.filter((mark) => mark.stage === stage)
    const first = own[0].at
    const last = own[own.length - 1]
    if (own.some(({ percent }) => percent >= FULL_PERCENT)) return last.at - first

    const next = marks.find((mark) => mark.stage !== stage && mark.at >= last.at)

    return (next?.at ?? endAt) - first
  }

  return Object.fromEntries(stages.map((stage) => [stage, durationOf(stage)]))
}

/** 진행률 콜백을 감싸 시각을 모은다 */
export const createStageTimer = (now: () => number = Date.now) => {
  let marks: StageMark[] = []

  return {
    mark: ({ stage, percent }: { stage: string; percent: number }) => {
      marks = [...marks, { stage, percent, at: now() }]
    },
    durations: () => stageDurations({ marks, endAt: now() })
  }
}
