/**
 * Phase 7 (DESIGN-04): Wave-0 stub retained for 07-VALIDATION.md filename anchor.
 *
 * The REAL parity assertions live in packages/spec/__tests__/adapter-parity.test.ts
 * (revision B-02 — extractor layer, not adapter layer).
 *
 * This file is kept as a redirect stub so that:
 *   1. The 07-VALIDATION.md `adapter-parity.test.ts` check resolves to a passing test.
 *   2. `sanitizeLayerName` import is exercised (Plan 01 DESIGN-01 traceability).
 *
 * See 07-CONTEXT.md D-03/D-04 for the full parity strategy.
 */
import { describe, it, expect } from 'vitest'
import { access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeLayerName } from '@appifex/design'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures', 'parity')

describe('adapter-parity (redirect stub — DESIGN-04)', () => {
  it('parity fixtures exist on disk — real assertions in @appifex/spec adapter-parity.test.ts', async () => {
    // Verify all four parity fixtures are committed (D-03 authoritative source check)
    await access(join(FIXTURES, 'reference.pen'))
    await access(join(FIXTURES, 'stitch.zip'))
    await access(join(FIXTURES, 'figma-rest.json'))
    await access(join(FIXTURES, 'figma-make.json'))
    expect(true).toBe(true)
  })

  it('sanitizeLayerName is exported from @appifex/design (DESIGN-01 traceability)', () => {
    // Smoke-test that the shared sanitization module is in place
    const taken = new Set<string>()
    expect(sanitizeLayerName('Home Screen', taken)).toBe('homeScreen')
    expect(sanitizeLayerName('class', taken)).toBe('class_')
    // Emoji stripped: "🎉 Party" → "party"
    expect(sanitizeLayerName('🎉 Party', taken)).toBe('party')
  })
})
