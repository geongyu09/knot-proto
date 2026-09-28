/** 결정 추출 입력의 발화 한 줄 (references/decisions.md "LLM 입력") */
export interface DecisionLine {
  /** 회의 전체 기준 1부터. 청크가 나뉘어도 바뀌지 않는다 */
  lineNo: number
  speakerLabel: string
  /** LLM에 보여 준 화자 표기 — 표시 이름이 있으면 그것, 없으면 "화자 N" */
  speakerName: string
  timestamp: string
  startSec: number
  endSec: number
  text: string
}

/** LLM이 돌려준 결정 후보 하나. 모양 검사만 통과한 상태다 */
export interface ExtractedDecision {
  title: string
  decision: string
  type: string
  background: string
  alternatives: { option: string; reason: string }[]
  actionItems: { task: string; owner: string; due: string }[]
  proposers: string[]
  participants: string[]
  evidenceLines: number[]
}
