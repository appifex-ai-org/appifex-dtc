/**
 * Phase 7 (OBS-01 D-13): prices per 1M tokens for supported LLM models.
 *
 * Verified 2026-04-18 from vendor pricing docs (see 07-RESEARCH.md §Sources).
 * Update via PR when vendor pricing shifts; bump `PRICING_AS_OF` stamp in the same PR.
 *
 * NOTE: CONTEXT.md D-13 showed Opus 4.6/4.7 at $15/$75 — research confirmed live rates
 * are $5/$25 per MTok (see 07-RESEARCH.md Assumption A1). This module uses the
 * verified values.
 *
 * Models not in this table fall back to `null` USD in `tokensToUsd`; the UI renders `—`.
 */

/** Prices per 1M tokens in USD. Base input + output (NOT cache-read / cache-write). */
export const PRICING_USD_PER_MTOK = {
  // Anthropic — platform.claude.com/docs/en/docs/about-claude/pricing (2026-04-18)
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
  'claude-opus-4-6': { input: 5.0, output: 25.0 },
  'claude-opus-4-5': { input: 5.0, output: 25.0 },
  'claude-opus-4-1': { input: 15.0, output: 75.0 }, // older model, still at old pricing
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-haiku-3-5': { input: 0.8, output: 4.0 },
  // OpenAI — verified 2026 sources (see 07-RESEARCH.md line 1405)
  'gpt-5': { input: 0.625, output: 5.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  // Google — ai.google.dev/gemini-api/docs/pricing (Apr 2026); 2.5-pro <200k tier
  'gemini-2-5-pro': { input: 1.25, output: 10.0 },
  'gemini-2-5-flash': { input: 0.3, output: 2.5 },
} as const

export const PRICING_AS_OF = '2026-04-18'

export type KnownModel = keyof typeof PRICING_USD_PER_MTOK

/**
 * Convert a token count to USD for a given model.
 * Returns `null` when the model is not in the pricing table (UI renders `—`).
 */
export function tokensToUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const entry = (PRICING_USD_PER_MTOK as Record<string, { input: number; output: number }>)[model]
  if (!entry) return null
  return (inputTokens / 1_000_000) * entry.input + (outputTokens / 1_000_000) * entry.output
}
