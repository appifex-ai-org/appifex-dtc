// Phase 04 (DX-07): extracted from cli/src/pipeline.ts:866-924 per REQUIREMENTS.md.
// Factory for the `google` provider — Gemini REST API with multimodal mapping
// (OpenAI-style `image_url` → Gemini `inline_data`). Preserves the API-key
// redaction (T-04-01 mitigation) verbatim.

import type { DtcConfig } from '@appifex/core'
import type { CreateMessageFn } from './message-types.js'

export async function createGoogleMessageFn(cfg: DtcConfig): Promise<CreateMessageFn> {
  return async (params) => {
    const model = cfg.llm.model ?? 'gemini-3.1-pro-preview'

    // Convert OpenAI message format to Gemini native format
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []
    for (const msg of params.messages) {
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content })
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text })
          } else if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
            // data:image/png;base64,... → inline_data
            const dataMatch = part.image_url.url.match(/^data:(.+?);base64,(.+)$/)
            if (dataMatch) {
              parts.push({ inline_data: { mime_type: dataMatch[1], data: dataMatch[2] } })
            }
          }
        }
      }
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.llm.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: params.max_tokens },
        }),
      },
    )
    if (!resp.ok) {
      const err = await resp.text()
      // Sanitize API key from error message to prevent credential leakage in logs
      const safeErr = cfg.llm.apiKey ? err.replace(cfg.llm.apiKey, '***') : err
      throw new Error(`Gemini API error ${resp.status}: ${safeErr}`)
    }
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0
    return {
      content: [{ type: 'text', text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }
  }
}
