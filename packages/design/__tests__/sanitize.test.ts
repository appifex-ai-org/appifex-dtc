// Phase 7 (DESIGN-01/02/03): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect } from 'vitest'
// @ts-expect-error — module does not exist yet; RED until Plan 01 creates packages/design/src/sanitize.ts
import { sanitizeLayerName } from '@appifex/design'

describe('sanitizeLayerName', () => {
  const cases: Array<{ input: string; expected: string }> = [
    { input: 'Home Screen', expected: 'homeScreen' },
    { input: '🏠 Home', expected: 'home' },
    { input: 'class', expected: 'class_' },
    { input: 'func', expected: 'func_' },
    { input: 'val', expected: 'val_' },
    { input: '123Header', expected: 'header' },
    { input: '', expected: 'node' },
    { input: '  ', expected: 'node' },
    { input: '🎉🎉🎉', expected: 'node' },
    { input: 'My-Button!', expected: 'myButton' },
    { input: 'get', expected: 'get_' },
  ]

  for (const { input, expected } of cases) {
    it(`sanitizes "${input}" → "${expected}"`, () => {
      const taken = new Set<string>()
      expect(sanitizeLayerName(input, taken)).toBe(expected)
    })
  }

  it('deduplicates within scope', () => {
    const taken = new Set<string>()
    expect(sanitizeLayerName('Home Screen', taken)).toBe('homeScreen')
    expect(sanitizeLayerName('Home Screen', taken)).toBe('homeScreen_2')
  })

  it('mutates taken set', () => {
    const taken = new Set<string>()
    sanitizeLayerName('Home Screen', taken)
    expect(taken.has('homeScreen')).toBe(true)
  })
})
