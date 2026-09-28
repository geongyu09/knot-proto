import type { UpdateDecisionTypesRequest } from '@shared/ipc'

// Electron은 main에서 던진 에러를 "Error invoking remote method '<채널>': Error: <원문>"으로 감싼다
const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

// 검증 오류(이름 중복·길이 초과)는 main이 사용자 언어로 만든 문구라 그대로 보여 준다
const toUserError = (caught: unknown) => {
  if (!(caught instanceof Error)) return new Error(String(caught))
  if (!REMOTE_ERROR_PREFIX.test(caught.message)) return caught

  return new Error(caught.message.replace(REMOTE_ERROR_PREFIX, ''))
}

/**
 * @description 결정 타입 목록을 불러옵니다. 저장한 적이 없으면 기본 6개입니다. 배열 순서가 사이드 패널 묶음 순서입니다.
 * @returns 결정 타입 목록
 * @example
 * const types = await getDecisionTypesApi()
 */
export const getDecisionTypesApi = async () => window.api.decisionTypes.get()

/**
 * @description 결정 타입 목록을 통째로 저장합니다. 새 타입은 id를 빈 문자열로 보내면 main이 id를 붙입니다.
 * 이미 만든 문서는 다시 분류되지 않습니다.
 * @param types - 저장할 타입 목록 (순서 그대로)
 * @returns 저장된 타입 목록
 * @example
 * const saved = await updateDecisionTypesApi({ types: [{ id: '', name: '보안', description: '' }] })
 */
export const updateDecisionTypesApi = async ({ types }: UpdateDecisionTypesRequest) => {
  try {
    return await window.api.decisionTypes.update({ types })
  } catch (caught) {
    throw toUserError(caught)
  }
}
