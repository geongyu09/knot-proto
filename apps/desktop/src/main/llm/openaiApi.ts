import OpenAI from 'openai'
import type { OpenaiModelId } from '@shared/types'
import { API_MIN_MAX_TOKENS } from '@shared/llm'
import { t } from '../locale'

import type { LlmJsonSchema } from './types'

/** 요약·초안은 정형 작업이라 깊은 추론이 필요 없다 (references/architecture.md "OpenAI API 호출") */
const REASONING_EFFORT = 'low'

interface CompleteWithOpenaiApiParams {
  apiKey: string
  model: OpenaiModelId
  system: string
  prompt: string
  maxTokens: number
  jsonSchema?: LlmJsonSchema
}

/** SDK 오류를 사용자에게 보여줄 한국어 안내로 바꾼다. 구체적인 것부터 본다 */
const toUserError = (caught: unknown) => {
  if (caught instanceof OpenAI.AuthenticationError) {
    return new Error(t().main.llm.openaiKeyInvalid)
  }
  if (caught instanceof OpenAI.RateLimitError) {
    return new Error(t().main.llm.openaiQuotaExceeded)
  }
  if (caught instanceof OpenAI.APIConnectionError) {
    return new Error(t().main.llm.openaiUnreachable)
  }
  if (caught instanceof OpenAI.APIError) {
    return new Error(
      t().main.llm.openaiApiError({
        status: String(caught.status ?? t().main.llm.unknownStatus),
        message: caught.message
      })
    )
  }

  return caught instanceof Error ? caught : new Error(String(caught))
}

/**
 * Responses API를 한 번 부른다. HTTP 200이어도 `status: 'incomplete'`면 본문이 잘려 있으므로
 * 이유를 나눠 오류로 바꾼다 (references/pitfalls.md).
 */
export const completeWithOpenaiApi = async ({
  apiKey,
  model,
  system,
  prompt,
  maxTokens,
  jsonSchema
}: CompleteWithOpenaiApiParams) => {
  const client = new OpenAI({ apiKey })

  try {
    const response = await client.responses.create({
      model,
      instructions: system,
      input: prompt,
      // 추론 토큰이 여기에 포함되므로 로컬용 상한을 그대로 쓰지 않는다
      max_output_tokens: Math.max(maxTokens, API_MIN_MAX_TOKENS),
      reasoning: { effort: REASONING_EFFORT },
      ...(jsonSchema
        ? {
            text: {
              format: {
                type: 'json_schema' as const,
                name: jsonSchema.name,
                schema: jsonSchema.schema,
                strict: true
              }
            }
          }
        : {})
    })

    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason
      if (reason === 'content_filter') throw new Error(t().main.llm.openaiRefused)

      throw new Error(t().main.llm.openaiTruncated)
    }

    return response.output_text
  } catch (caught) {
    throw toUserError(caught)
  }
}
