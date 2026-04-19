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
    const largeSummary = 'a'.repeat(40000) // 40000 / 4 = 10000 tokens — over cap
    expect(() => enforceTokenCap(largeSummary)).not.toThrow()
    const result = enforceTokenCap(largeSummary)
    expect(result.endsWith('\n[TRUNCATED: summary exceeded 8K token cap]')).toBe(true)
    // WR-02: truncated output (content + marker) must fit within the cap
    const maxLen = 8000 * 4
    expect(result.length).toBeLessThanOrEqual(maxLen)
  })

  // Test 13: truncated output preserves original content prefix
  it('returns the original content prefix when truncated', () => {
    const largeSummary = 'a'.repeat(40000) // 10000 tokens
    const result = enforceTokenCap(largeSummary)
    expect(result.startsWith('a')).toBe(true)
    expect(result.endsWith('[TRUNCATED: summary exceeded 8K token cap]')).toBe(true)
  })
})

describe('CHARS_PER_TOKEN (DX-04 consolidation)', () => {
  it('is imported from @appifex/core and equals 4', async () => {
    const { CHARS_PER_TOKEN } = await import('@appifex/core')
    expect(CHARS_PER_TOKEN).toBe(4)
  })
})
