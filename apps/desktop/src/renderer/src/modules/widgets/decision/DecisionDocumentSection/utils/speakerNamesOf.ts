import { resolveSpeakerNames, type DefaultSpeakerNames } from '@meeting-stt/core/format'
import type { Speaker, Utterance } from '@shared/types'

interface SpeakerNamesOfParams {
  speakers: Speaker[]
  utterances: Utterance[]
  defaultNames: DefaultSpeakerNames
}

/**
 * 화자 라벨 → 표시 이름. 원문 패널과 같은 번호("화자 N")가 나오도록 발화 등장 순서로 매긴다.
 * 문서의 사람 필드는 라벨로 저장되므로 화자 이름을 바꾸면 여기서 바로 새 이름이 된다 (references/decisions.md "문서 필드").
 */
export const speakerNamesOf = ({ speakers, utterances, defaultNames }: SpeakerNamesOfParams) =>
  resolveSpeakerNames({
    labels: [
      ...utterances.map(({ speakerLabel }) => speakerLabel),
      ...speakers.map(({ label }) => label)
    ],
    displayNames: Object.fromEntries(
      speakers.map(({ label, displayName }) => [label, displayName])
    ),
    defaultNames
  })

interface NamesOfParams {
  labels: string[]
  speakerNames: Record<string, string>
}

/** 회의에 없는 라벨(병합 직후 등)은 라벨 그대로 둔다 — 빈 칸보다 낫다 */
export const namesOf = ({ labels, speakerNames }: NamesOfParams) =>
  labels.map((label) => speakerNames[label] ?? label)
