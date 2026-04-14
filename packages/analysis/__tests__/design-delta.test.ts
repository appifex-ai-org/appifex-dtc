// Plan 01 wave-0: this file fails via ERR_MODULE_NOT_FOUND until Plan 02 Task 1 creates
// ../src/design-delta.ts. Plan 02 does NOT edit this file — it only creates the source.

import { describe, it, expect } from 'vitest'
import type { DesignTokens, TypographyToken } from '@appifex/core'

// This import intentionally fails in Plan 01 (module does not exist yet).
// Plan 02 Task 1 creates packages/analysis/src/design-delta.ts and this flips GREEN.
import { diffDesignTokens } from '../src/design-delta.js'

const emptyTokens: DesignTokens = {
  colors: {},
  typography: {},
  spacing: {},
  borderRadius: {},
}

const baseTypo: TypographyToken = {
  fontFamily: 'Inter',
  fontSize: 16,
  fontWeight: '400',
  lineHeight: 1.5,
}

describe('diffDesignTokens', () => {
  it('returns empty delta for identical inputs', () => {
    const tokens: DesignTokens = {
      colors: { primary: '#ffffff' },
      typography: {},
      spacing: { md: 8 },
      borderRadius: {},
    }
    expect(diffDesignTokens(tokens, tokens)).toEqual({ added: [], removed: [], changed: [] })
  })

  it('classifies a new color as added', () => {
    const newTokens: DesignTokens = {
      ...emptyTokens,
      colors: { primary: '#fff' },
    }
    expect(diffDesignTokens(emptyTokens, newTokens)).toEqual({
      added: [{ category: 'colors', name: 'primary', value: '#fff' }],
      removed: [],
      changed: [],
    })
  })

  it('classifies added tokens across all 4 categories', () => {
    const newTokens: DesignTokens = {
      colors: { accent: '#00d632' },
      typography: { body: baseTypo },
      spacing: { sm: 4 },
      borderRadius: { card: 12 },
    }
    const result = diffDesignTokens(emptyTokens, newTokens)
    expect(result.added).toContainEqual({ category: 'colors', name: 'accent', value: '#00d632' })
    expect(result.added).toContainEqual({ category: 'typography', name: 'body', value: baseTypo })
    expect(result.added).toContainEqual({ category: 'spacing', name: 'sm', value: 4 })
    expect(result.added).toContainEqual({ category: 'borderRadius', name: 'card', value: 12 })
    expect(result.removed).toEqual([])
    expect(result.changed).toEqual([])
  })

  it('classifies a removed color as removed', () => {
    const existingTokens: DesignTokens = {
      ...emptyTokens,
      colors: { primary: '#ffffff' },
    }
    const result = diffDesignTokens(existingTokens, emptyTokens)
    expect(result.removed).toEqual([{ category: 'colors', name: 'primary', value: '#ffffff' }])
    expect(result.added).toEqual([])
    expect(result.changed).toEqual([])
  })

  it('treats color case difference (#FFFFFF vs #ffffff) as unchanged (D-06)', () => {
    const existing: DesignTokens = { ...emptyTokens, colors: { bg: '#FFFFFF' } }
    const updated: DesignTokens = { ...emptyTokens, colors: { bg: '#ffffff' } }
    const result = diffDesignTokens(existing, updated)
    expect(result.changed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('classifies a real color change (#ffffff vs #fefefe) as changed with full old/new values', () => {
    const existing: DesignTokens = { ...emptyTokens, colors: { bg: '#ffffff' } }
    const updated: DesignTokens = { ...emptyTokens, colors: { bg: '#fefefe' } }
    const result = diffDesignTokens(existing, updated)
    expect(result.changed).toEqual([
      { category: 'colors', name: 'bg', oldValue: '#ffffff', newValue: '#fefefe' },
    ])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('classifies a spacing numeric change (8 → 9) as changed with no tolerance (D-06)', () => {
    const existing: DesignTokens = { ...emptyTokens, spacing: { md: 8 } }
    const updated: DesignTokens = { ...emptyTokens, spacing: { md: 9 } }
    const result = diffDesignTokens(existing, updated)
    expect(result.changed).toEqual([
      { category: 'spacing', name: 'md', oldValue: 8, newValue: 9 },
    ])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('classifies a typography whole-token change (any field differs) as changed with full old/new tokens (D-06)', () => {
    const oldTypo: TypographyToken = { fontFamily: 'Inter', fontSize: 16, fontWeight: '400' }
    const newTypo: TypographyToken = { fontFamily: 'Inter', fontSize: 18, fontWeight: '400' }
    const existing: DesignTokens = { ...emptyTokens, typography: { body: oldTypo } }
    const updated: DesignTokens = { ...emptyTokens, typography: { body: newTypo } }
    const result = diffDesignTokens(existing, updated)
    expect(result.changed).toEqual([
      { category: 'typography', name: 'body', oldValue: oldTypo, newValue: newTypo },
    ])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('returns empty delta for truly identical inputs (all categories empty)', () => {
    expect(diffDesignTokens(emptyTokens, emptyTokens)).toEqual({ added: [], removed: [], changed: [] })
  })
})
