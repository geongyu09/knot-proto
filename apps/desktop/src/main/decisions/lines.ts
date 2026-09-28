import { formatTimestamp, resolveSpeakerNames } from '@meeting-stt/core/format'
import type { MergedUtterance } from '@shared/types'

import type { DecisionLine } from '../types/decisions'

/** 추출에 필요한 발화 필드. 스크립트가 회의록 텍스트에서도 만들 수 있게 좁혀 둔다 */
export type DecisionSourceUtterance = Pick<
  MergedUtterance,
  'speakerLabel' | 'startSec' | 'endSec' | 'text'
>

interface BuildDecisionLinesParams {
  utterances: DecisionSourceUtterance[]
  /** 화자 라벨 → 사용자가 지정한 이름 */
  displayNames: Record<string, string | null>
}

/**
 * 발화를 줄 번호가 붙은 추출 입력으로 만든다. 화자는 이름이 있으면 이름, 없으면 등장 순서 "화자 N"이다.
 * 프롬프트가 한국어라 기본 이름도 UI 언어와 무관하게 한국어다 (references/decisions.md "LLM 입력").
 */
export const buildDecisionLines = ({ utterances, displayNames }: BuildDecisionLinesParams) => {
  const names = resolveSpeakerNames({
    labels: utterances.map(({ speakerLabel }) => speakerLabel),
    displayNames
  })

  return utterances
    .filter(({ text }) => text.trim())
    .map(({ speakerLabel, startSec, endSec, text }, index): DecisionLine => ({
      lineNo: index + 1,
      speakerLabel,
      speakerName: names[speakerLabel] ?? speakerLabel,
      timestamp: formatTimestamp({ sec: startSec }),
      startSec,
      endSec,
      text: text.trim()
    }))
}
