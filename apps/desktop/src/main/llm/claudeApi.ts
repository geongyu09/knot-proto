import Anthropic from '@anthropic-ai/sdk'
import { API_MIN_MAX_TOKENS, CLAUDE_API_MODEL_ID } from '@shared/llm'
import { t } from '../locale'

import type { LlmJsonSchema } from './types'

/** 요약·초안은 정형 작업이라 높은 노력이 필요 없다 (references/architecture.md "Claude API 호출") */
const EFFORT = 'medium'

interface CompleteWithClaudeApiParams {
  apiKey: string
  system: string
  prompt: string
  maxTokens: number
  jsonSchema?: LlmJsonSchema
}

/** SDK 오류를 사용자에게 보여줄 한국어 안내로 바꾼다. 구체적인 것부터 본다 */
const toUserError = (caught: unknown) => {
  if (caught instanceof Anthropic.AuthenticationError) {
    return new Error(t().main.llm.claudeKeyInvalid)
  }
  if (caught instanceof Anthropic.RateLimitError) {
    return new Error(t().main.llm.claudeRateLimited)
  }
  if (caught instanceof Anthropic.APIConnectionError) {
    return new Error(t().main.llm.claudeUnreachable)
  }
  if (caught instanceof Anthropic.APIError) {
    return new Error(
      t().main.llm.claudeApiError({
        status: String(caught.status ?? t().main.llm.unknownStatus),
        message: caught.message
      })
    )
  }

  return caught instanceof Error ? caught : new Error(String(caught))
}

/**
 * Messages API를 한 번 부른다. 스트리밍은 화면에 흘리지 않고 긴 출력의 HTTP 타임아웃을 피하는 용도라
 * `finalMessage()`만 쓴다.
 */
export const completeWithClaudeApi = async ({
  apiKey,
  system,
  prompt,
  maxTokens,
  jsonSchema
}: CompleteWithClaudeApiParams) => {
  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages
      .stream({
        model: CLAUDE_API_MODEL_ID,
        // 적응형 사고 토큰이 여기에 포함되므로 로컬용 상한을 그대로 쓰지 않는다
        max_tokens: Math.max(maxTokens, API_MIN_MAX_TOKENS),
        system,
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'adaptive' },
        output_config: {
          effort: EFFORT,
          ...(jsonSchema ? { format: { type: 'json_schema', schema: jsonSchema.schema } } : {})
        }
      })
      .finalMessage()

    if (message.stop_reason === 'refusal') {
      throw new Error(t().main.llm.claudeRefused)
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error(t().main.llm.claudeTruncated)
    }

    return message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
  } catch (caught) {
    throw toUserError(caught)
  }
}
