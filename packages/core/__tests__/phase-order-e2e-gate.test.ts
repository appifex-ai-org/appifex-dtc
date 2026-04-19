// Phase 6 (VAL-01 D-01): RED tests that lock the e2e_gate phase insertion
// into PHASE_ORDER between 'deliver' and 'xcode_archive'. The symbol is not
// yet in PHASE_ORDER — these tests fail today. Plan 06-01 adds it.
import { describe, it, expect } from 'vitest'
import { PHASE_ORDER } from '../src/run-context.js'

describe('PHASE_ORDER e2e_gate position — Phase 6 (VAL-01 D-01)', () => {
  it('Test 1: PHASE_ORDER contains the e2e_gate phase', () => {
    expect(PHASE_ORDER).toContain('e2e_gate' as any)
  })

  it('Test 2: e2e_gate is positioned between deliver and xcode_archive', () => {
    const deliverIdx = PHASE_ORDER.indexOf('deliver')
    const e2eIdx = PHASE_ORDER.indexOf('e2e_gate' as any)
    const archiveIdx = PHASE_ORDER.indexOf('xcode_archive')
    expect(deliverIdx).toBeGreaterThanOrEqual(0)
    expect(archiveIdx).toBeGreaterThanOrEqual(0)
    expect(e2eIdx).toBe(deliverIdx + 1)
    expect(e2eIdx).toBe(archiveIdx - 1)
  })

  it('Test 3: e2e_gate appears exactly once', () => {
    const count = PHASE_ORDER.filter((p) => (p as string) === 'e2e_gate').length
    expect(count).toBe(1)
  })
})
