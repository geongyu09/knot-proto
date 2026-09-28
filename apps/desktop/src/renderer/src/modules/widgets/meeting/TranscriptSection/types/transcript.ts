/** 화자 선택·병합 UI가 쓰는 한 줄. 라벨은 DB의 원본 값, 이름은 화면에 보이는 값 */
export interface SpeakerOption {
  label: string
  name: string
}

export type TranscriptVariant = 'page' | 'panel'

/** 원문 패널을 이 구간으로 스크롤해 달라는 요청. 같은 칩을 다시 눌러도 움직이게 requestId를 올린다 */
export interface TranscriptScrollRequest {
  startSec: number
  endSec: number
  requestId: number
}
