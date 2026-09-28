import type {
  ExtractDecisionsRequest,
  GetDecisionRequest,
  GetMeetingDecisionsRequest,
  SearchDecisionsRequest
} from '@shared/ipc'

// Electron은 main에서 던진 에러를 "Error invoking remote method '<채널>': Error: <원문>"으로 감싼다
const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

// main이 던진 안내(추출 준비 안 됨 등)는 원문 그대로 보여 준다
const toUserError = (caught: unknown) => {
  if (!(caught instanceof Error)) return new Error(String(caught))
  if (!REMOTE_ERROR_PREFIX.test(caught.message)) return caught

  return new Error(caught.message.replace(REMOTE_ERROR_PREFIX, ''))
}

/**
 * @description 사이드 패널 결정 탭에 그릴 결정 문서 목록을 불러옵니다. 회의 최신순 → 회의 안 순서입니다.
 * @returns 결정 문서 목록 (가벼운 행)
 * @example
 * const decisions = await getDecisionsApi()
 */
export const getDecisionsApi = async () => window.api.decisions.list()

/**
 * @description 결정 문서 하나와 출처 회의를 불러옵니다.
 * @param decisionId - 결정 문서 ID
 * @returns 문서와 출처 회의. 없는 문서(다시 추출로 사라진 id 등)면 null
 * @example
 * const result = await getDecisionApi({ decisionId })
 */
export const getDecisionApi = async ({ decisionId }: GetDecisionRequest) =>
  window.api.decisions.get({ decisionId })

/**
 * @description 한 회의에서 나온 결정 문서 목록을 불러옵니다.
 * @param meetingId - 회의 ID
 * @returns 그 회의의 결정 문서 목록 (회의 안 순서)
 * @example
 * const decisions = await getMeetingDecisionsApi({ meetingId })
 */
export const getMeetingDecisionsApi = async ({ meetingId }: GetMeetingDecisionsRequest) =>
  window.api.decisions.ofMeeting({ meetingId })

/**
 * @description 회의의 결정 문서를 전부 새로 추출합니다. 잡을 큐에 넣고 즉시 반환하며, 진행은 `onDecisionProgress`,
 * 목록 갱신은 `onMeetingsChanged`로 옵니다. 성공하면 그 회의의 기존 문서 id는 사라집니다.
 * @param meetingId - 회의 ID
 * @returns 없음
 * @example
 * await extractDecisionsApi({ meetingId })
 */
export const extractDecisionsApi = async ({ meetingId }: ExtractDecisionsRequest) => {
  try {
    await window.api.decisions.extract({ meetingId })
  } catch (caught) {
    throw toUserError(caught)
  }
}

/**
 * @description 결정 문서의 제목·결정 내용·배경에서 검색어를 찾습니다.
 * @param query - 검색어. 공백뿐이면 빈 결과
 * @returns 걸린 결정 문서 목록
 * @example
 * const results = await searchDecisionsApi({ query: '가격' })
 */
export const searchDecisionsApi = async ({ query }: SearchDecisionsRequest) =>
  window.api.decisions.search({ query })
