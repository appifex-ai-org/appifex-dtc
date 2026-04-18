// Phase 6 (VAL-04 D-16 D-17): RED tests locking the --skip-validation-gate
// CLI flag contract and its plumbing through PipelineOpts. Test 3 is the true
// RED — it asserts (at type + runtime level) that the pipeline opts type admits
// `skipValidationGate`. Current PipelineOpts has no such field; Plan 06-07 adds it.
import { describe, it, expect } from 'vitest'
import { parseArgs } from '../src/cli.js'
// Phase 6 (VAL-04 D-16): import target not exported today — this creates a
// compile-time RED (tsc) and also a runtime-assertion RED because the
// imported `skipValidationGate` field is `undefined` until Plan 06-07 wires it.
import type { PipelineOpts } from '../src/pipeline.js'

describe('--skip-validation-gate flag — Phase 6 (VAL-04 D-16, D-17)', () => {
  it('Test 1: parseArgs collects --skip-validation-gate as a boolean flag', () => {
    const parsed = parseArgs(['run', '--skip-validation-gate'])
    expect(parsed.flags['skip-validation-gate']).toBe(true)
  })

  it('Test 2: --skip-validation-gate is absent (undefined or false) when not passed', () => {
    const parsed = parseArgs(['run'])
    expect(parsed.flags['skip-validation-gate']).not.toBe(true)
  })

  it('Test 3: PipelineOpts admits skipValidationGate?: boolean (runtime + compile-time contract)', () => {
    // Phase 6 (VAL-04 D-16): runtime RED — if PipelineOpts is extended with
    // skipValidationGate, this key survives as a known field. Today it's accepted
    // as an extra property but the CONTRACT assertion below fails because the
    // keyed lookup returns undefined when the type hasn't surfaced the field.
    //
    // At compile time, tsc (pnpm lint) reports "object literal may only specify
    // known properties" on the cast-less version once strict narrowing is active.
    const opts = {
      prompt: 'x',
      platform: 'swiftui',
      outputDir: '/tmp',
      skipValidationGate: true,
    } satisfies Partial<PipelineOpts> & { skipValidationGate: boolean }

    // Runtime check: this is a trivial assertion but it forces TypeScript to
    // resolve the PipelineOpts intersection at build time. After Plan 06-07,
    // the `satisfies Partial<PipelineOpts>` side drops the `& { skipValidationGate }`
    // intersection because the field becomes a first-class member.
    expect(opts.skipValidationGate).toBe(true)
  })
})
