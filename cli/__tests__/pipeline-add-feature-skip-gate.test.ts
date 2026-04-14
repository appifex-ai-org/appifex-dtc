import { describe, it, expect } from 'vitest'
import { createSkipGate } from '../src/pipeline.js'
import type { PhaseOutcome, RunContext, RunMode } from '@appifex/core'

/**
 * Phase 18 Plan 01 — Bug A regression test.
 *
 * The spec phase must ALWAYS re-run in `--add-feature` mode so the new feature
 * prompt is processed into a fresh platformSpec. Previously, the skip gate
 * returned true whenever previousContext.phases.spec.status === 'completed',
 * which silently dropped the user's feature prompt. See
 * `.planning/phases/17-drift-token-extraction-fix/17-02-smoke-rerun-and-status-flips-SUMMARY.md`
 * § Root Cause Bug A.
 */

const completed = (): PhaseOutcome => ({ status: 'completed', summary: 'ok' })

function makePrevContext(mode: RunMode = 'fresh'): RunContext {
  return {
    runId: 'run-prev-1234',
    prompt: 'original prompt',
    platform: 'swiftui',
    mode,
    status: 'completed',
    timestamp: Date.now() - 60_000,
    phases: {
      analysis: completed(),
      design: completed(),
      spec: completed(),
      design_delta: completed(),
      test_gen: completed(),
      codegen: completed(),
      build: completed(),
      validate: completed(),
      deliver: completed(),
      report: completed(),
    },
    filesGenerated: [],
  }
}

describe('createSkipGate (Phase 18 Plan 01 — Bug A)', () => {
  it('add-feature mode: canSkipPhase("spec") returns FALSE even when previousContext.phases.spec.status === completed', () => {
    const gate = createSkipGate({
      runMode: 'add-feature',
      isContinuation: true,
      previousContext: makePrevContext(),
      resumeState: null,
    })
    expect(gate.canSkipPhase('spec')).toBe(false)
  })

  it('fresh mode: canSkipPhase("spec") returns FALSE (fresh never skips — isContinuation is false)', () => {
    const gate = createSkipGate({
      runMode: 'fresh',
      isContinuation: false,
      previousContext: null,
      resumeState: null,
    })
    expect(gate.canSkipPhase('spec')).toBe(false)
  })

  it('resume mode: canSkipPhase("spec") returns TRUE when previousContext.phases.spec.status === completed (skip preserved)', () => {
    const gate = createSkipGate({
      runMode: 'resume',
      isContinuation: true,
      previousContext: makePrevContext('resume'),
      resumeState: null,
    })
    expect(gate.canSkipPhase('spec')).toBe(true)
  })

  it('add-feature mode: canSkipPhase("design") returns TRUE when previousContext.phases.design.status === completed (design reuse unaffected by fix)', () => {
    const gate = createSkipGate({
      runMode: 'add-feature',
      isContinuation: true,
      previousContext: makePrevContext(),
      resumeState: null,
    })
    expect(gate.canSkipPhase('design')).toBe(true)
  })

  it('add-feature mode: canSkipPhase("codegen") returns TRUE when previousContext.phases.codegen.status === completed (codegen reuse unaffected by fix)', () => {
    const gate = createSkipGate({
      runMode: 'add-feature',
      isContinuation: true,
      previousContext: makePrevContext(),
      resumeState: null,
    })
    expect(gate.canSkipPhase('codegen')).toBe(true)
  })
})
