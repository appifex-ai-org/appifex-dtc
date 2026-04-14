/**
 * Phase 13: fresh-app regression golden invariant — RED stub.
 *
 * Proves that adding checkpoint instrumentation in Wave 2 is a PURE addition:
 * the fresh-app run-context.json must remain byte-identical (modulo normalized
 * volatile fields) to the pre-Phase-13 golden fixture at
 * cli/__tests__/__fixtures__/phase-13-golden/run-context.json.
 *
 * Wave 2 (Plan 13-03) will create ./helpers/phase-13-harness.ts exposing
 * runFullFreshAppPipeline() and normalizeRunContext(). Until then this test
 * fails with "Cannot find module" — the expected RED state.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runFullFreshAppPipeline, normalizeRunContext } from './helpers/phase-13-harness.js'

describe('Phase 13: fresh-app regression (pure instrumentation invariant)', () => {
  it('fresh-app run produces byte-identical run-context.json vs pre-Phase-13 golden', async () => {
    const { dtcDir } = await runFullFreshAppPipeline()
    const actual = normalizeRunContext(JSON.parse(await readFile(join(dtcDir, 'run-context.json'), 'utf8')))
    const golden = normalizeRunContext(JSON.parse(await readFile(
      join(__dirname, '__fixtures__/phase-13-golden/run-context.json'), 'utf8',
    )))
    expect(actual).toEqual(golden)
  })
})
