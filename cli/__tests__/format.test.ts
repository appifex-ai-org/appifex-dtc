import { describe, it, expect } from 'vitest'
import { formatPreBuildSummary } from '../src/views/format.js'
import type { PreBuildSummary } from '../src/pipeline.js'
import type { DesignDeltaReport } from '@appifex/core'

function makeSummary(overrides: Partial<PreBuildSummary> = {}): PreBuildSummary {
  return {
    newScreens: [],
    modifiedFiles: [],
    designStrategy: 'extend',
    testFilesToGenerate: [],
    tokenCount: 5,
    enrichedPrompt: 'Add dark mode',
    ...overrides,
  }
}

function makeReport(overrides: Partial<DesignDeltaReport> = {}): DesignDeltaReport {
  return {
    added: [],
    removed: [],
    changed: [],
    ...overrides,
  }
}

describe('formatPreBuildSummary', () => {
  it('no designDelta → no drift section', () => {
    const result = formatPreBuildSummary(makeSummary())
    expect(result).not.toContain('Design drift')
    expect(result).not.toContain('~')
  })

  it('pure addition delta (added only, no changed or removed) → no drift section', () => {
    const delta = makeReport({
      added: [{ category: 'colors', name: 'accent', value: '#00d632' }],
    })
    const result = formatPreBuildSummary(makeSummary({ designDelta: delta }))
    expect(result).not.toContain('Design drift')
  })

  it('changed-only delta → drift section with ~ entries', () => {
    const delta = makeReport({
      changed: [{ category: 'colors', name: 'primary', oldValue: '#ffffff', newValue: '#fefefe' }],
    })
    const result = formatPreBuildSummary(makeSummary({ designDelta: delta }))
    expect(result).toContain('Design drift')
    expect(result).toContain('~ colors.primary')
    expect(result).toContain('#ffffff')
    expect(result).toContain('#fefefe')
  })

  it('removed-only delta → drift section with - entries', () => {
    const delta = makeReport({
      removed: [{ category: 'spacing', name: 'xs', value: 4 }],
    })
    const result = formatPreBuildSummary(makeSummary({ designDelta: delta }))
    expect(result).toContain('Design drift')
    expect(result).toContain('- spacing.xs')
  })

  it('mixed changed and removed → both entries appear in drift section', () => {
    const delta = makeReport({
      changed: [{ category: 'colors', name: 'bg', oldValue: '#fff', newValue: '#eee' }],
      removed: [{ category: 'spacing', name: 'lg', value: 32 }],
    })
    const result = formatPreBuildSummary(makeSummary({ designDelta: delta }))
    expect(result).toContain('Design drift')
    expect(result).toContain('~ colors.bg')
    expect(result).toContain('- spacing.lg')
  })

  it('overflow → truncation line appears when entries exceed 20-line cap', () => {
    // Build a large enough delta to trigger truncation (> 20 lines including header)
    const changed = Array.from({ length: 20 }, (_, i) => ({
      category: 'colors' as const,
      name: `token${i}`,
      oldValue: '#fff',
      newValue: '#eee',
    }))
    const delta = makeReport({ changed })
    const result = formatPreBuildSummary(makeSummary({ designDelta: delta }))
    expect(result).toContain('Design drift')
    expect(result).toContain('more')
  })
})
