/**
 * Phase 13 (QUALITY-03a): add-feature checkpoint trail — RED integration stubs.
 *
 * These tests lock the Nyquist contract from 13-VALIDATION.md:
 * every PHASE_ORDER member must land a checkpoint row (completed/failed/skipped),
 * the sidecar must exist at .dtc/snapshots/<runId>-preAgent.json, and analysis
 * checkpoint data must reference — not duplicate — snapshot content.
 *
 * The helpers imported from './helpers/phase-13-harness.js' do NOT yet exist;
 * Wave 2 (Plan 13-03) will create them. Until then these tests fail with
 * "Cannot find module", which IS the expected RED state for this plan.
 */
import { describe, it, expect } from 'vitest'
import { Checkpoint } from '@appifex/core'
import { join } from 'node:path'
import { runFullAddFeaturePipeline, runAddFeaturePipelineWithFailure } from './helpers/phase-13-harness.js'

describe('Phase 13: add-feature checkpoint trail', () => {
  it('writes a row for every PHASE_ORDER member after a full add-feature run', async () => {
    const { runId, dtcDir } = await runFullAddFeaturePipeline()
    const ckpt = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    const rows = ckpt.completedPhases(runId)
    expect(rows).toEqual(expect.arrayContaining([
      'analysis','design','spec','design_delta','test_gen','codegen',
      'test_regen','build','validate','security','fix','deliver','report',
    ]))
    ckpt.close()
  })

  it('writes {failed} row at failing phase and preserves completed priors', async () => {
    const { runId, dtcDir } = await runAddFeaturePipelineWithFailure('codegen')
    const ckpt = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    expect(ckpt.lastCompletedPhase(runId)).toBe('test_gen')  // phase before codegen
    const codegenRow = ckpt.getPhase(runId, 'codegen') as any
    expect(codegenRow.status).toBe('failed')
    expect(typeof codegenRow.error).toBe('string')
    ckpt.close()
  })

  it('writes {skipped} row for design_delta when no baseline .pen', async () => {
    const { runId, dtcDir } = await runFullAddFeaturePipeline({ hasBaselinePen: false })
    const ckpt = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    const row = ckpt.getPhase(runId, 'design_delta') as any
    expect(row.status).toBe('skipped')
    expect(typeof row.reason).toBe('string')
    ckpt.close()
  })

  it('log-and-continue: savePhase throw does NOT abort the pipeline phase', async () => {
    const { completedPhases } = await runFullAddFeaturePipeline({ simulateCheckpointFailure: true })
    // Pipeline should still finish successfully
    expect(completedPhases).toContain('report')
  })

  it('writes sidecar at .dtc/snapshots/<runId>-preAgent.json matching schema', async () => {
    const { runId, dtcDir } = await runFullAddFeaturePipeline()
    const sidecarPath = join(dtcDir, 'snapshots', `${runId}-preAgent.json`)
    const { readFile } = await import('node:fs/promises')
    const body = JSON.parse(await readFile(sidecarPath, 'utf8'))
    expect(body).toHaveProperty('files')
    expect(body).toHaveProperty('sha256PerFile')
    expect(body).toHaveProperty('writtenAt')
  })

  it('lastCompletedPhase sees spec/test_gen even after targeted writes without status (CR-01 regression)', async () => {
    // WR-04 regression: prior to CR-01, the targeted per-phase upserts at
    // pipeline.ts:964/972/978/1022/1332/1481 would clobber the `status`
    // field the centralized emit() hook had just written, because savePhase
    // used `data = excluded.data` (full replace). The harness now replays
    // those targeted writes, so this test would fail without the json_patch
    // merge fix in Checkpoint.savePhase.
    const { runId, dtcDir } = await runFullAddFeaturePipeline()
    const ckpt = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    // Every phase must remain reachable via lastCompletedPhase even though
    // design/spec/test_gen received targeted writes without a status field.
    expect(ckpt.lastCompletedPhase(runId)).toBe('report')
    // Spot-check the richer payloads are still intact and carry status.
    const specRow = ckpt.getPhase(runId, 'spec') as any
    expect(specRow.status).toBe('completed')
    expect(specRow.platformSpec).toBeDefined()
    const testGenRow = ckpt.getPhase(runId, 'test_gen') as any
    expect(testGenRow.status).toBe('completed')
    expect(testGenRow.uiTestFileNames).toEqual(['flow.yaml'])
    ckpt.close()
  })

  it('analysis checkpoint data references sidecar path + hash, not content', async () => {
    const { runId, dtcDir } = await runFullAddFeaturePipeline()
    const ckpt = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    const row = ckpt.getPhase(runId, 'analysis') as any
    expect(row.snapshotPath).toMatch(/snapshots\/.+-preAgent\.json$/)
    expect(row.snapshotSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(typeof row.fileCount).toBe('number')
    expect(row.files).toBeUndefined()  // content MUST NOT be duplicated
    ckpt.close()
  })
})
