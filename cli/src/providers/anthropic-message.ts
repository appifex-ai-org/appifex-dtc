// Phase 04 (DX-07): extracted from cli/src/pipeline.ts:963-1000 per REQUIREMENTS.md.
// Factory for the default `anthropic` provider — Anthropic SDK with streaming
// and OpenAI → Anthropic image-format coercion.

import type { DtcConfig } from '@appifex/core'
import type { CreateMessageFn } from './message-types.js'

export async function createAnthropicMessageFn(cfg: DtcConfig): Promise<CreateMessageFn> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: cfg.llm.apiKey })
  return async (params) => {
    // Convert OpenAI image_url format to Anthropic image format
    const messages = params.messages.map((msg) => {
      if (Array.isArray(msg.content)) {
        const content = msg.content.map((part: any) => {
          if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
            const dataMatch = part.image_url.url.match(/^data:(.+?);base64,(.+)$/)
            if (dataMatch) {
              return {
                type: 'image',
                source: { type: 'base64', media_type: dataMatch[1], data: dataMatch[2] },
              }
            }
          }
          return part
        })
        return { ...msg, content }
      }
      return msg
    })
    // Use streaming to avoid timeout on long-running requests
    const stream = client.messages.stream({ ...params, messages } as any)
    const finalMessage = await stream.finalMessage()
    return {
      content: finalMessage.content.map((c: any) => ({
        type: c.type,
        text: c.type === 'text' ? c.text : '',
      })),
      usage: finalMessage.usage,
    }
  }
}
