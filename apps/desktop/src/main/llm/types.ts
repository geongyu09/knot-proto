import type { LlmProvider } from '@shared/types'

/**
 * 요약·용어 초안이 LLM에 넘기는 한 턴 요청 (references/architecture.md "LLM 공급자").
 * `grammar`·`contextTokens`·`temperature`는 local(llama-cli) 전용이고 Claude 공급자는 무시한다.
 */
export interface LlmCompleteParams {
  system: string
  prompt: string
  /** 생성 상한. local은 -n, Claude는 max_tokens의 하한으로 쓴다 */
  maxTokens: number
  /** 임시 파일 이름과 로그에 쓰는 꼬리표 */
  label: string
  /** local이 프롬프트·출력 파일을 두는 폴더. 만들고 지우는 것은 호출하는 쪽의 몫이다 */
  workDir: string
  /** local 전용 GBNF 문법 */
  grammar?: string
  /** local 전용 컨텍스트 크기 */
  contextTokens?: number
  /** local 전용 온도 */
  temperature?: number
  /**
   * 출력 JSON 스키마. Claude API는 `output_config.format`, OpenAI는 `text.format`으로 강제한다.
   * local은 무시한다 — 동봉 llama-cli의 `-jf`가 깨져 있어 같은 모양의 `grammar`를 따로 넘긴다
   * (references/pitfalls.md "로컬 요약 / llama.cpp"). Claude Code CLI도 무시한다(프롬프트 지시 + 파싱).
   * 최상위는 객체여야 한다 (references/decisions.md "LLM 출력")
   */
  jsonSchema?: LlmJsonSchema
}

export interface LlmJsonSchema {
  /** OpenAI format 이름 규칙(영문·숫자·_·-)을 따른다 */
  name: string
  schema: Record<string, unknown>
}

export interface LlmClient {
  provider: LlmProvider
  /** 회의록 한 조각의 최대 글자 수. `splitTranscript`의 budgetChars로 넘긴다 */
  chunkBudgetChars: number
  /** 답변 본문만 돌려준다. llama의 `Assistant:` 표시 제거는 local 구현이 한다 */
  complete: (params: LlmCompleteParams) => Promise<string>
}
