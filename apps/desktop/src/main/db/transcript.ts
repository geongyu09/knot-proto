import type { MergedUtterance } from '@shared/types'
import { getDb } from './connection'
import { ensureSpeakers } from './speakers'
import { replaceUtterances } from './utterances'

interface SaveTranscriptParams {
  meetingId: string
  utterances: MergedUtterance[]
}

/**
 * 파이프라인 결과로 회의록을 통째로 새로 만든다. 다시 인식하면 새 군집 라벨이 이전 라벨과 대응하지 않으므로
 * 화자 이름을 옮기지 않고 비우며, 이전 발화 id를 가리키는 교정 결과도 비운다 (references/data-model.md "다시 인식").
 * better-sqlite3의 트랜잭션은 중첩되면 savepoint가 되므로 안쪽 함수의 트랜잭션도 이 안에 묶인다.
 */
export const saveTranscript = ({ meetingId, utterances }: SaveTranscriptParams) => {
  const db = getDb()
  const removeSpeakers = db.prepare('DELETE FROM speakers WHERE meeting_id = ?')
  const clearRefine = db.prepare(
    'UPDATE meetings SET refine_applied = NULL, refined_at = NULL WHERE id = ?'
  )
  // 새 발화의 시각이 이전 근거 구간과 맞지 않으므로 이전 결정 문서도 지운다. 추출은 큐가 다시 넣는다
  const clearDecisions = db.prepare('DELETE FROM decisions WHERE meeting_id = ?')

  db.transaction(() => {
    removeSpeakers.run(meetingId)
    ensureSpeakers({
      meetingId,
      labels: [...new Set(utterances.map((utterance) => utterance.speakerLabel))]
    })
    replaceUtterances({ meetingId, utterances })
    clearRefine.run(meetingId)
    clearDecisions.run(meetingId)
  })()
}
