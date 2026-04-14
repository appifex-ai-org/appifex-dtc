import { describe, test, expect } from 'vitest'
import { runPhase14Scenario } from './helpers/phase-14-harness.js'
import { detectResumeEligibility, ResumeAbortError } from '../src/resume-bootstrap.js'

describe('Phase 14: add-feature resume flow (QUALITY-03b + QUALITY-03c)', () => {

  // D-32 scenario 1: full run, SIGINT after codegen, resume completes successfully
  test('D-32 scenario 1: resume after codegen interrupt returns ResumeState with lastCompleted=codegen', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'codegen',
      sourceFiles: {
        'Sources/App/ContentView.swift': 'struct ContentView: View {}',
        'Sources/App/Models.swift': 'struct Model {}',
      },
    })
    expect(result.error).toBeNull()
    expect(result.resumeState).not.toBeNull()
    expect(result.resumeState!.lastCompletedPhase).toBe('codegen')
    expect(result.bannerLines).toHaveLength(1)
    expect(result.bannerLines[0]).toBe('Resuming add-feature run from checkpoint (last completed: codegen)')
  })

  // D-32 scenario 2: resume with drifted source file aborts with D-17 error
  test('D-32 scenario 2: drifted source file aborts with D-17 categorized error', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'codegen',
      sourceFiles: {
        'Sources/App/ContentView.swift': 'original content',
        'Sources/App/Models.swift': 'original model',
      },
      driftMutations: {
        modify: { 'Sources/App/ContentView.swift': 'DRIFTED content' },
      },
    })
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toContain('Resume aborted')
    expect(result.error!.message).toContain('source file')
    expect(result.error!.message).toContain('drifted')
    expect(result.error!.message).toContain('Modified:')
    expect(result.error!.message).toContain('Sources/App/ContentView.swift')
    expect(result.error!.message).not.toContain('Sources/App/Models.swift')
    expect(result.error!.message).toContain('--no-resume')
  })

  // D-32 scenario 3: resume with missing sidecar file aborts with corrupt-sidecar error.
  // Uses the harness's `deleteSidecarBeforeResume` option to unlink the sidecar AFTER
  // the checkpoint row is written but BEFORE runResumeBootstrap runs. This simulates an
  // orphaned analysis row (e.g., user deleted `.dtc/snapshots/` manually).
  test('D-32 scenario 3: missing sidecar file aborts with corrupt-sidecar ResumeAbortError', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'codegen',
      sourceFiles: { 'Sources/App/X.swift': 'x' },
      deleteSidecarBeforeResume: true,
    })
    expect(result.resumeState).toBeNull()
    expect(result.error).not.toBeNull()
    expect(result.error).toBeInstanceOf(ResumeAbortError)
    expect(result.error!.message).toContain('sidecar')
    // The bootstrap wraps SidecarCorruptError with "Resume aborted — sidecar snapshot corrupt:"
    expect(result.error!.message).toContain('Resume aborted')
    expect(result.error!.message).toContain('--no-resume')
  })

  // D-32 scenario 4: runId mismatch aborts
  test('D-32 scenario 4: checkpoint runId != run-context runId aborts with both IDs in error', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'codegen',
      sourceFiles: { 'Sources/App/X.swift': 'x' },
      runIdMismatch: true,
    })
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toContain('runId mismatch')
    expect(result.error!.message).toContain('run-mismatch-')
    expect(result.error!.message).toContain('--no-resume')
  })

  // D-32 scenario 5: --no-resume bypasses all resume logic
  test('D-32 scenario 5: detectResumeEligibility with noResume=true returns no-resume-flag reason', () => {
    const result = detectResumeEligibility({
      outputDir: '/tmp/whatever',
      runMode: 'add-feature',
      noResume: true,
      previousContextExists: true,
    })
    expect(result.eligible).toBe(false)
    expect((result as { reason: string }).reason).toBe('no-resume-flag')
  })

  // D-32 scenario 6: first add-feature run (no checkpoint) proceeds silently
  test('D-32 scenario 6: first add-feature run with no checkpoint returns no-checkpoint-db', async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const tmpDir = await mkdtemp(join(tmpdir(), 'phase14-first-'))
    const result = detectResumeEligibility({
      outputDir: tmpDir,
      runMode: 'add-feature',
      noResume: false,
      previousContextExists: false,
    })
    expect(result.eligible).toBe(false)
    expect((result as { reason: string }).reason).toBe('no-checkpoint-db')
  })

  // D-32 scenario 7: skipped checkpoint rows stay skipped on resume
  test('D-32 scenario 7: skipped design_delta / test_regen rows honored as skip-eligible on resume (D-11)', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'test_regen',
      sourceFiles: { 'Sources/App/X.swift': 'x' },
      skippedPhases: ['design_delta', 'test_regen'],
    })
    expect(result.error).toBeNull()
    expect(result.resumeState).not.toBeNull()
    // lastCompletedPhase comes from Checkpoint.lastCompletedPhase which filters
    // on status='completed' — a skipped row is NOT counted. So lastCompletedPhase
    // will be the last 'completed' row in the seeded sequence.
    // Harness seeds analysis/design/spec/test_gen/codegen as completed,
    // design_delta and test_regen as skipped (interruptAfter='test_regen').
    // The last completed row is 'codegen'; test_regen is skipped so it does NOT
    // bump the pointer. This pins D-11/D-12 semantics: skipped rows are
    // skip-eligible on resume but do not advance lastCompletedPhase.
    expect(result.resumeState!.lastCompletedPhase).toBe('codegen')
  })

  // Extra: net-new files are NOT drift (D-15 pin)
  test('D-15 pin: net-new files added after snapshot are not drift', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'codegen',
      sourceFiles: { 'Sources/App/X.swift': 'x' },
      driftMutations: {
        add: { 'Sources/App/BrandNew.swift': 'brand new' },
      },
    })
    expect(result.error).toBeNull()
    expect(result.resumeState).not.toBeNull()
  })

  // Extra: removed source file triggers drift error with Removed: section
  test('D-15/D-17 pin: removed sidecar-tracked file produces Removed: drift error', async () => {
    const result = await runPhase14Scenario({
      interruptAfter: 'codegen',
      sourceFiles: {
        'Sources/App/Keep.swift': 'keep me',
        'Sources/App/Delete.swift': 'delete me',
      },
      driftMutations: {
        remove: ['Sources/App/Delete.swift'],
      },
    })
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toContain('Removed:')
    expect(result.error!.message).toContain('Sources/App/Delete.swift')
    expect(result.error!.message).not.toContain('Modified:')
  })

  // Extra: PROJECT.md non-negotiable — validate/fix/deliver/report always re-run
  test('D-09 pin: FORCE_RERUN_PHASES set contains validate, fix, deliver, report', async () => {
    // Static assertion against the module-level const.
    const pipelineSource = await (await import('node:fs/promises')).readFile(
      new URL('../src/pipeline.ts', import.meta.url).pathname, 'utf-8'
    )
    expect(pipelineSource).toContain("new Set(['validate', 'fix', 'deliver', 'report'])")
  })

  // Extra: PHASE_ORDER must be a static import (no require() allowed in ESM)
  test('ESM pin: pipeline.ts imports PHASE_ORDER statically from @appifex/core', async () => {
    const pipelineSource = await (await import('node:fs/promises')).readFile(
      new URL('../src/pipeline.ts', import.meta.url).pathname, 'utf-8'
    )
    expect(pipelineSource).toContain('PHASE_ORDER')
    expect(pipelineSource).not.toContain("require('@appifex/core')")
    expect(pipelineSource).not.toContain('require("@appifex/core")')
  })

  // VERIFICATION GAP PIN (Phase 14 gap closure, Plan 14-03): the design_delta skip
  // else-branch MUST rehydrate the local `designDelta` variable from
  // `previousContext.designDelta` so generatePreBuildSummary receives the
  // original-run drift report on resume. Pinned via source inspection because the
  // harness does not expose pipeline-local variables (same technique as D-09 / ESM
  // pins above). If this assertion fails, ROADMAP SC #2 has regressed.
  test('gap-closure pin: pipeline.ts rehydrates designDelta from previousContext on resume', async () => {
    const pipelineSource = await (await import('node:fs/promises')).readFile(
      new URL('../src/pipeline.ts', import.meta.url).pathname, 'utf-8'
    )
    // The fix line itself — guarded assignment inside the design_delta skip branch.
    expect(pipelineSource).toContain('designDelta = previousContext.designDelta')
    // The updated emit message reflecting that rehydration happened.
    expect(pipelineSource).toContain('designDelta rehydrated=')
    // The stale "no rehydration" comment from the pre-fix branch must be gone.
    expect(pipelineSource).not.toContain('consistent with the skipped case')
    // The consumer of the local variable must still be wired up.
    expect(pipelineSource).toContain('generatePreBuildSummary(')
    // Sanity: the declaration site is unchanged (single `let designDelta` with DesignDeltaReport type).
    expect(pipelineSource).toContain('let designDelta: DesignDeltaReport | null = null')
  })

})
