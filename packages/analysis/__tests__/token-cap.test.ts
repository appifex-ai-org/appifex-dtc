import { describe, it, expect } from 'vitest'
import { buildAppContextSummary, enforceTokenCap } from '../src/token-cap.js'
import type { AppContext } from '@appifex/core'

describe('buildAppContextSummary', () => {
  // Test 10: produces markdown with inventory and nav graph sections
  it('produces markdown with inventory and nav graph sections', () => {
    const ctx: AppContext = {
      platform: 'swiftui',
      inventory: [
        { filePath: 'Sources/Views/HomeView.swift', type: 'screen', name: 'HomeView' },
        { filePath: 'Sources/Models/Todo.swift', type: 'model', name: 'Todo' },
      ],
      navGraph: [
        { screenId: 'Sources/Views/HomeView.swift', type: 'push', targets: ['DetailView'] },
      ],
      entryPoint: 'ContentView',
      scannedAt: Date.now(),
    }

    const summary = buildAppContextSummary(ctx)

    // Check key sections exist
    expect(summary).toContain('## Existing App Context')
    expect(summary).toContain('Platform: swiftui')
    expect(summary).toContain('### File Inventory (2 files)')
    expect(summary).toContain('[screen] HomeView')
    expect(summary).toContain('[model] Todo')
    expect(summary).toContain('### Navigation Graph (1 nodes)')
    expect(summary).toContain('Entry point: ContentView')
    expect(summary).toContain('[push]')
    expect(summary).toContain('DetailView')
  })
})

describe('enforceTokenCap', () => {
  // Test 11: returns the same summary unchanged when under cap
  it('returns the same summary unchanged when under 8K tokens', () => {
    const smallSummary = 'a'.repeat(15000) // 15000 / 4 = 3750 tokens — under cap
    expect(enforceTokenCap(smallSummary)).toBe(smallSummary)
  })

  // Test 12: returns truncated string (no throw) when over cap
  it('returns a truncated string without throwing when over 8K tokens', () => {
    // Phase 02 Plan 02 (FOUND-02): Swift density is ~3 chars/token.
    // Trigger truncation with content that exceeds 8000 * 3 = 24000 chars.
    const largeSummary = 'a'.repeat(40000) // 40000 / 3 ≈ 13333 tokens — over cap
    expect(() => enforceTokenCap(largeSummary)).not.toThrow()
    const result = enforceTokenCap(largeSummary)
    expect(result.endsWith('\n[TRUNCATED: summary exceeded 8K token cap]')).toBe(true)
    // WR-02 + FOUND-02: truncated output (content + marker) must fit within the cap
    // at 3 chars/token, 8000 * 3 = 24000.
    const maxLen = 8000 * 3
    expect(result.length).toBeLessThanOrEqual(maxLen)
  })

  // Phase 02 Plan 02 (FOUND-02): Swift density cap: 8k tokens × 3 chars = 24_000
  it('uses Swift chars-per-token density of 3 (8k-token cap → 24_000 chars, not 32_000)', () => {
    // 24_001-char input should trip the cap (>24_000 char budget under 3 chars/token).
    const input = 'a'.repeat(24_001)
    const result = enforceTokenCap(input)
    expect(result.endsWith('\n[TRUNCATED: summary exceeded 8K token cap]')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(24_000)

    // Under the old 4 chars/token density, 24_001 chars would have been
    // estimated as ~6001 tokens and passed through untouched.
    expect(result).not.toBe(input)
  })

  // Test 13: truncated output preserves original content prefix
  it('returns the original content prefix when truncated', () => {
    const largeSummary = 'a'.repeat(40000) // 10000 tokens
    const result = enforceTokenCap(largeSummary)
    expect(result.startsWith('a')).toBe(true)
    expect(result.endsWith('[TRUNCATED: summary exceeded 8K token cap]')).toBe(true)
  })
})
