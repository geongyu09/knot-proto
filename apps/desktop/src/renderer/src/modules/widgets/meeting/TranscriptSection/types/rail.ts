/** 오른쪽 칸의 폭 규칙. 회의 상세의 레일과 결정 문서의 원문 패널이 값만 다르게 쓴다 */
export interface RailLimits {
  defaultPx: number
  minPx: number
  maxPx: number
  /** 끈 폭을 기억하는 localStorage 키 */
  storageKey: string
}
