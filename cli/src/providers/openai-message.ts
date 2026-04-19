// Phase 04 (DX-07): extracted from cli/src/pipeline.ts:927-961 per REQUIREMENTS.md.
// Factory for the `openai` provider — OpenAI chat/completions REST. Preserves
// the API-key redaction (T-04-01 mitigation) verbatim.

import type { DtcConfig } from '@appifex/core'
import type { CreateMessageFn } from './message-types.js'

export async function createOpenAiMessageFn(cfg: DtcConfig): Promise<CreateMessageFn> {
  const baseUrl = 'https://api.openai.com/v1'
  return async (params) => {
    const model = cfg.llm.model ?? 'gpt-4.1'
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.llm.apiKey}`,
      },
      body: JSON.stringify({ model, max_tokens: params.max_tokens, messages: params.messages }),
    })
    if (!resp.ok) {
      const err = await resp.text()
      const safeErr = cfg.llm.apiKey ? err.replace(cfg.llm.apiKey, '***') : err
      throw new Error(`OpenAI API error ${resp.status}: ${safeErr}`)
    }
    const data = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    return {
      content: [{ type: 'text', text }],
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
    }
  }
}
