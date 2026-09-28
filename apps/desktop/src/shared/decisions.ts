import type { DecisionType } from './types'
import { decisionsKo } from './locales/decisions'

/** 결정 타입 한도. 목록 전체가 추출 프롬프트에 들어가므로 길이를 묶는다 (references/decisions.md "결정 타입") */
export const DECISION_TYPE_MAX_COUNT = 20
export const DECISION_TYPE_NAME_MAX_CHARS = 20
export const DECISION_TYPE_DESCRIPTION_MAX_CHARS = 80

/**
 * 설정 키가 없을 때 읽는 기본 타입. id가 고정이라 사용자가 저장하기 전에 만든 문서도 같은 묶음에 들어간다.
 * 이름은 사용자 데이터라 사전에 두지 않고 한국어 값이다.
 */
export const DEFAULT_DECISION_TYPES: DecisionType[] = [
  {
    id: 'default-product',
    name: '제품·기능',
    description: '무엇을 만들고 무엇을 빼는지, 기능 범위와 우선순위'
  },
  { id: 'default-tech', name: '기술', description: '아키텍처, 라이브러리, 구현 방식, 인프라 선택' },
  { id: 'default-schedule', name: '일정', description: '마감, 출시일, 마일스톤, 순서 조정' },
  { id: 'default-budget', name: '예산·비용', description: '지출, 가격, 비용 배분, 구매' },
  { id: 'default-people', name: '사람·조직', description: '담당자 배정, 채용, 역할과 책임' },
  { id: 'default-process', name: '프로세스·운영', description: '일하는 방식, 회의 규칙, 운영 절차' }
]

type DecisionTypeErrorMessages = typeof decisionsKo.errors

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** 이름 중복 비교 키. 대소문자·앞뒤 공백을 무시한다 */
const nameKey = (name: string) => name.trim().toLowerCase()

interface ReadDecisionTypesParams {
  value: unknown
  /** 빈 id(새 타입)에 붙일 id를 만든다. main이 uuid를 넘긴다 */
  createId: () => string
  errors?: DecisionTypeErrorMessages
}

const readType = ({
  value,
  createId,
  errors
}: {
  value: unknown
  createId: () => string
  errors: DecisionTypeErrorMessages
}): DecisionType => {
  if (!isRecord(value)) throw new Error(errors.invalidType)

  const { id, name, description } = value
  if (typeof id !== 'string' || typeof name !== 'string' || typeof description !== 'string') {
    throw new Error(errors.invalidType)
  }

  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  if (!trimmedName) throw new Error(errors.nameEmpty)
  if (trimmedName.length > DECISION_TYPE_NAME_MAX_CHARS) {
    throw new Error(errors.nameTooLong({ max: DECISION_TYPE_NAME_MAX_CHARS }))
  }
  if (trimmedDescription.length > DECISION_TYPE_DESCRIPTION_MAX_CHARS) {
    throw new Error(errors.descriptionTooLong({ max: DECISION_TYPE_DESCRIPTION_MAX_CHARS }))
  }

  return { id: id.trim() || createId(), name: trimmedName, description: trimmedDescription }
}

/**
 * @description renderer가 보낸 결정 타입 목록을 검증하고 정리합니다. 순서는 그대로 둡니다.
 * @param value - 요청 payload의 `types`
 * @param createId - 새 타입(id가 빈 문자열)에 붙일 id 생성 함수
 * @param errors - 오류 문구 사전. 생략하면 한국어
 * @returns 정리한 타입 목록
 * @example
 * const types = readDecisionTypes({ value: payload.types, createId: randomUUID })
 */
export const readDecisionTypes = ({
  value,
  createId,
  errors = decisionsKo.errors
}: ReadDecisionTypesParams) => {
  if (!Array.isArray(value)) throw new Error(errors.missingTypes)
  if (value.length > DECISION_TYPE_MAX_COUNT) {
    throw new Error(errors.tooManyTypes({ max: DECISION_TYPE_MAX_COUNT }))
  }

  const types = value.map((item) => readType({ value: item, createId, errors }))
  const seen = new Set<string>()
  types.forEach(({ name }) => {
    if (seen.has(nameKey(name))) throw new Error(errors.duplicateName({ name }))
    seen.add(nameKey(name))
  })

  const ids = new Set(types.map(({ id }) => id))
  if (ids.size !== types.length) throw new Error(errors.invalidType)

  return types
}

/**
 * @description 저장된 JSON 값을 타입 목록으로 읽습니다. 모양이 깨졌거나 없으면 기본 목록입니다.
 * @param value - settings `decisions.types`를 JSON.parse한 값
 * @returns 타입 목록
 * @example
 * const types = decisionTypesFromStored(readValue('decisions.types'))
 */
export const decisionTypesFromStored = (value: unknown) => {
  if (!Array.isArray(value)) return DEFAULT_DECISION_TYPES

  try {
    return readDecisionTypes({ value, createId: () => '' }).filter(({ id }) => id)
  } catch {
    // 손상된 설정 하나 때문에 결정 탭이 멈추면 안 된다. 기본 목록으로 읽는다
    return DEFAULT_DECISION_TYPES
  }
}
