// Phase 7 (OBS-01): Wave 0 RED stub — see 07-VALIDATION.md
// @ts-expect-error — module does not exist yet; RED until Plan 03 creates packages/core/src/pricing.ts
import { tokensToUsd, PRICING_USD_PER_MTOK, PRICING_AS_OF } from '../src/pricing.js'
import { describe, it, expect } from 'vitest'

describe('PRICING_USD_PER_MTOK', () => {
  it('PRICING_AS_OF is the verified date stamp', () => {
    expect(PRICING_AS_OF).toBe('2026-04-18')
  })

  it('PRICING_USD_PER_MTOK is defined', () => {
    expect(typeof PRICING_USD_PER_MTOK).toBe('object')
    expect(PRICING_USD_PER_MTOK).not.toBeNull()
  })
})

describe('tokensToUsd', () => {
  it('claude-opus-4-7: 1M input tokens = $5.00', () => {
    expect(tokensToUsd('claude-opus-4-7', 1_000_000, 0)).toBe(5.00)
  })

  it('claude-opus-4-7: 1M output tokens = $25.00', () => {
    expect(tokensToUsd('claude-opus-4-7', 0, 1_000_000)).toBe(25.00)
  })

  it('claude-opus-4-6: 1M input tokens = $5.00', () => {
    expect(tokensToUsd('claude-opus-4-6', 1_000_000, 0)).toBe(5.00)
  })

  it('claude-opus-4-1: 1M input tokens = $15.00 (older model at old pricing)', () => {
    expect(tokensToUsd('claude-opus-4-1', 1_000_000, 0)).toBe(15.00)
  })

  it('claude-sonnet-4-6: 1M input tokens = $3.00', () => {
    expect(tokensToUsd('claude-sonnet-4-6', 1_000_000, 0)).toBe(3.00)
  })

  it('claude-sonnet-4-6: 1M output tokens = $15.00', () => {
    expect(tokensToUsd('claude-sonnet-4-6', 0, 1_000_000)).toBe(15.00)
  })

  it('claude-haiku-4-5: 1M input tokens = $1.00', () => {
    expect(tokensToUsd('claude-haiku-4-5', 1_000_000, 0)).toBe(1.00)
  })

  it('gpt-5: 1M input tokens = $0.625', () => {
    expect(tokensToUsd('gpt-5', 1_000_000, 0)).toBe(0.625)
  })

  it('gemini-2-5-pro: 1M input tokens = $1.25', () => {
    expect(tokensToUsd('gemini-2-5-pro', 1_000_000, 0)).toBe(1.25)
  })

  it('unknown model returns null', () => {
    expect(tokensToUsd('unknown-model', 1_000_000, 1_000_000)).toBeNull()
  })

  it('mixed: claude-sonnet-4-6 500K input + 200K output = $4.50', () => {
    // 500_000 / 1_000_000 * 3.00 + 200_000 / 1_000_000 * 15.00 = 1.50 + 3.00 = 4.50
    const result = tokensToUsd('claude-sonnet-4-6', 500_000, 200_000)
    expect(result).toBeCloseTo(4.5, 5)
  })
})
