// Plan 03 Task 2: File-content position assertions verifying that the design_delta
// block is placed AFTER the spec-skip branch close (T-12-07 bypass fix).
// These assertions catch regressions where someone moves the block back inside
// the if (!specSkipped) branch, silently bypassing the gate on resume runs.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipelinePath = join(__dirname, '..', 'src', 'pipeline.ts')
const s = readFileSync(pipelinePath, 'utf8')

describe('pipeline.ts relocation assertions (T-12-07)', () => {
  it('contains the spec-skip close brace marker', () => {
    const idx = s.indexOf('} // end if (!specSkipped)')
    expect(idx, 'Missing spec-skip close brace comment').toBeGreaterThan(-1)
  })

  it('runDesignDeltaPhase is CALLED (await runDesignDeltaPhase) AFTER the spec-skip branch close', () => {
    const specSkippedEndIdx = s.indexOf('} // end if (!specSkipped)')
    const callIdx = s.indexOf('await runDesignDeltaPhase(')
    expect(specSkippedEndIdx).toBeGreaterThan(-1)
    expect(callIdx, 'Missing await runDesignDeltaPhase( call in pipeline body').toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(specSkippedEndIdx)
  })

  it('generatePreBuildSummary call site is AFTER the spec-skip branch close', () => {
    const specSkippedEndIdx = s.indexOf('} // end if (!specSkipped)')
    // The definition is "export function generatePreBuildSummary("
    // The call site is "= generatePreBuildSummary(" or "const summary = generatePreBuildSummary("
    const callIdx = s.indexOf('const summary = generatePreBuildSummary(')
    expect(specSkippedEndIdx).toBeGreaterThan(-1)
    expect(callIdx, 'Missing summary = generatePreBuildSummary( call site').toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(specSkippedEndIdx)
  })

  it("file contains the 'design_delta' phase string (design_delta events are emitted)", () => {
    // runDesignDeltaPhase emits via emit('design_delta', ...) which maps to progress.emit({ phase: 'design_delta' })
    // Check that the string appears in the file
    expect(s).toContain("'design_delta'")
  })

  it("file contains the 'Drift detected. Proceed with this plan?' prompt text", () => {
    expect(s).toContain('Drift detected. Proceed with this plan?')
  })

  it('generatePreBuildSummary has exactly ONE call site in pipeline.ts (no duplication)', () => {
    // Count call sites (not the function definition)
    const allCount = (s.match(/generatePreBuildSummary\(/g) ?? []).length
    const defCount = (s.match(/export function generatePreBuildSummary\(/g) ?? []).length
    const callCount = allCount - defCount
    expect(callCount).toBe(1)
  })
})
