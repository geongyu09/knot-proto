import type { DecisionType } from '@shared/types'

import type { DecisionLine } from '../types/decisions'

/**
 * 결정 추출 프롬프트·스키마·청크. 전부 순수 함수이고 D0 스크립트(`scripts/decisions.ts`)와 앱 잡이 함께 쓴다.
 * 값은 references/decisions.md의 초기값이다 — D0 결과로 바뀌면 문서를 먼저 고친다.
 */

/** 결정 여러 개의 JSON이 들어갈 생성 상한 (local -n) */
export const DECISIONS_MAX_PREDICT_TOKENS = 4096

/** 목록을 적는 일이라 요약보다 낮춘다 */
export const DECISIONS_TEMPERATURE = 0.1

const stringSchema = { type: 'string' }
const stringArraySchema = { type: 'array', items: stringSchema }

const objectSchema = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
})

/** 모든 필드 required + additionalProperties false — OpenAI strict 조건이다 (references/decisions.md "LLM 출력") */
export const DECISIONS_JSON_SCHEMA = objectSchema({
  decisions: {
    type: 'array',
    items: objectSchema({
      title: stringSchema,
      decision: stringSchema,
      type: stringSchema,
      background: stringSchema,
      alternatives: {
        type: 'array',
        items: objectSchema({ option: stringSchema, reason: stringSchema })
      },
      actionItems: {
        type: 'array',
        items: objectSchema({ task: stringSchema, owner: stringSchema, due: stringSchema })
      },
      proposers: stringArraySchema,
      participants: stringArraySchema,
      evidenceLines: { type: 'array', items: { type: 'integer' } }
    })
  }
})

export const DECISIONS_JSON_SCHEMA_NAME = 'meeting_decisions'

/**
 * 로컬(llama-cli)용 GBNF. `DECISIONS_JSON_SCHEMA`와 같은 모양·같은 필드 순서다 — 둘을 함께 고친다.
 * 동봉 빌드의 `-jf`가 깨져 있어 손으로 쓴다 (references/pitfalls.md). 근거 줄은 1개 이상을 강제한다.
 */
export const DECISIONS_GRAMMAR = String.raw`root ::= "{" ws "\"decisions\"" ws ":" ws "[" ws ( decision ( ws "," ws decision )* )? ws "]" ws "}"
decision ::= "{" ws "\"title\"" ws ":" ws string ws "," ws "\"decision\"" ws ":" ws string ws "," ws "\"type\"" ws ":" ws string ws "," ws "\"background\"" ws ":" ws string ws "," ws "\"alternatives\"" ws ":" ws alternatives ws "," ws "\"actionItems\"" ws ":" ws actions ws "," ws "\"proposers\"" ws ":" ws strings ws "," ws "\"participants\"" ws ":" ws strings ws "," ws "\"evidenceLines\"" ws ":" ws lines ws "}"
alternatives ::= "[" ws ( alternative ( ws "," ws alternative )* )? ws "]"
alternative ::= "{" ws "\"option\"" ws ":" ws string ws "," ws "\"reason\"" ws ":" ws string ws "}"
actions ::= "[" ws ( action ( ws "," ws action )* )? ws "]"
action ::= "{" ws "\"task\"" ws ":" ws string ws "," ws "\"owner\"" ws ":" ws string ws "," ws "\"due\"" ws ":" ws string ws "}"
strings ::= "[" ws ( string ( ws "," ws string )* )? ws "]"
lines ::= "[" ws int ( ws "," ws int )* ws "]"
int ::= [1-9] [0-9]{0,5}
string ::= "\"" char* "\""
char ::= [^"\\\x7F\x00-\x1F] | [\\] (["\\bfnrt] | "u" [0-9a-fA-F]{4})
ws ::= [ \t\n]{0,20}
`

const formatTypeList = (types: DecisionType[]) =>
  types.length
    ? types
        .map(({ name, description }) => (description ? `- ${name}: ${description}` : `- ${name}`))
        .join('\n')
    : '(정의된 타입 없음 — type은 항상 빈 문자열)'

/** 타입 목록이 회의마다 같아 시스템 프롬프트에 둔다 */
export const buildDecisionSystemPrompt = ({ types }: { types: DecisionType[] }) =>
  `너는 회의록에서 "결정"만 찾아 구조화하는 도우미다.

결정이란 회의에서 참석자들이 합의했거나 결정권자가 확정한 사항이다. 단순한 논의, 아이디어, 의견, 질문, 결론 없이 끝난 안건, 나중에 정하기로 한 미결 사항은 결정이 아니다.
결정 하나는 문서 하나가 된다. 서로 다른 결정을 하나로 합치지 말고, 같은 결정을 여러 개로 쪼개지 마라.
결정이 하나도 없으면 decisions를 빈 배열로 둔다.

모든 내용은 회의록에 있는 것만 적는다. 없는 사실을 지어내지 마라.
- title: 결정을 40자 이내 명사형으로 ("가격 정책을 월 구독으로 확정")
- decision: 무엇을 정했는지 1~3문장
- type: 아래 타입 이름 중 하나를 글자 그대로. 어느 것에도 맞지 않으면 빈 문자열
- background: 왜 이 결정이 나왔는지. 회의록에 없으면 빈 문자열
- alternatives: 회의에서 실제로 언급된 다른 선택지와 기각 이유만
- actionItems: 결정에 따라 하기로 한 일. owner·due는 회의록에 나온 말 그대로, 없으면 빈 문자열. 날짜를 계산하지 마라
- proposers: 결정을 제안한 사람, participants: 이 결정 논의에 참여한 사람. 회의록 줄에 적힌 화자 표기 그대로 쓴다
- evidenceLines: 이 결정이 나온 발화의 줄 번호(각 줄 맨 앞 대괄호 안 숫자). 반드시 하나 이상

결정 타입:
${formatTypeList(types)}

출력은 JSON 객체 하나다: {"decisions": [...]}`

/** `[12] 화자 2 (03:15) 텍스트` 한 줄 */
export const formatDecisionLine = ({ lineNo, speakerName, timestamp, text }: DecisionLine) =>
  `[${lineNo}] ${speakerName} (${timestamp}) ${text}`

interface SplitDecisionLinesParams {
  lines: DecisionLine[]
  budgetChars: number
}

/**
 * 줄 경계로 청크를 나눈다. 줄 번호는 회의 전체 기준 그대로라 청크가 나뉘어도 근거 줄이 원문을 가리킨다.
 * 예산보다 긴 줄 하나는 혼자 청크가 된다.
 */
export const splitDecisionLines = ({ lines, budgetChars }: SplitDecisionLinesParams) =>
  lines.reduce<DecisionLine[][]>((chunks, line) => {
    const last = chunks.at(-1)
    const lastChars = last?.reduce((sum, item) => sum + formatDecisionLine(item).length + 1, 0) ?? 0
    const lineChars = formatDecisionLine(line).length + 1

    if (!last || lastChars + lineChars > budgetChars) return [...chunks, [line]]

    return [...chunks.slice(0, -1), [...last, line]]
  }, [])

interface BuildChunkPromptParams {
  chunk: DecisionLine[]
  index: number
  total: number
}

export const buildDecisionChunkPrompt = ({ chunk, index, total }: BuildChunkPromptParams) => {
  const scope = total === 1 ? '회의록 전체' : `회의록의 ${index + 1}/${total} 구간`

  return `다음은 ${scope}다.

${chunk.map(formatDecisionLine).join('\n')}

위 회의록에서 결정을 찾아 JSON으로 적어라.`
}

/**
 * 구간별 후보를 합치는 프롬프트. 근거 줄은 원래 번호를 그대로 쓰게 하고, 코드가 후보 근거의 합집합 밖을 버린다.
 */
export const buildDecisionReducePrompt = ({ candidates }: { candidates: unknown[] }) =>
  `다음은 같은 회의를 구간별로 나눠 찾은 결정 후보다.

${JSON.stringify({ decisions: candidates }, null, 2)}

같은 결정을 가리키는 후보는 하나로 합치고 evidenceLines는 두 후보의 줄 번호를 모두 넣어라. 다른 결정은 그대로 둔다.
새 결정을 만들거나 후보에 없는 줄 번호를 쓰지 마라. 결과를 같은 JSON 형식으로 적어라.`
