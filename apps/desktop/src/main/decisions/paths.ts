import path from 'node:path'
import { app } from 'electron'

/** 추출 중에만 쓰는 프롬프트·출력 파일 자리. 요약처럼 잡이 끝나면 실패해도 지운다 */
export const decisionsWorkDir = ({ meetingId }: { meetingId: string }) =>
  path.join(app.getPath('userData'), 'decisions', meetingId)
