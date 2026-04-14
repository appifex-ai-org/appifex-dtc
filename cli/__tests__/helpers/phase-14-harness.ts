/**
 * Phase 14 (QUALITY-03b, QUALITY-03c) integration harness.
 *
 * Drives the resume bootstrap + skip-logic surface from cli/src/pipeline.ts
 * against a tmp workdir. Uses the REAL Checkpoint, REAL writePreAgentSnapshotSidecar,
 * REAL readPreAgentSnapshotSidecar, and REAL runResumeBootstrap so the assertions
 * are byte-for-byte faithful to a real interrupted add-feature run.
 *
 * Same "faithful simulation" discipline as phase-13-harness.ts: we do NOT call
 * runPipeline (too many heavy deps). We mirror the exact resume-entry sequence
 * at pipeline.ts:771-775 plus the canSkipPhase + revert gating from Task 1.
 */
import { mkdir, mkdtemp, writeFile, unlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  Checkpoint,
  writePreAgentSnapshotSidecar,
  saveRunContext,
  RunContextBuilder,
  type PhaseId,
  type RunContext,
} from '@appifex/core'
import { runResumeBootstrap, type ResumeState } from '../../src/resume-bootstrap.js'

export interface Phase14ScenarioOpts {
  /** Phase at which the original run was interrupted (last completed). */
  interruptAfter: PhaseId
  /** Source files (relative path → content) captured in the sidecar. */
  sourceFiles: Record<string, string>
  /** Optional: mutations to apply to sourceFiles on disk after snapshot (to simulate drift). */
  driftMutations?: {
    modify?: Record<string, string>  // path → new content
    remove?: string[]                // paths to delete
    add?: Record<string, string>     // NEW files (NOT drift per D-15)
  }
  /** Force a corrupt checkpoint DB (D-04). */
  corruptCheckpointDb?: boolean
  /** Force a runId mismatch between checkpoint and run-context (D-06). */
  runIdMismatch?: boolean
  /** Omit run-context.json (D-05). */
  omitRunContext?: boolean
  /** Write 'skipped' status for specific phases in the checkpoint (D-11). */
  skippedPhases?: PhaseId[]
  /** D-32 scenario 3: delete the sidecar file after snapshot write + checkpoint row,
   *  but before runResumeBootstrap is invoked. Simulates an orphaned analysis row. */
  deleteSidecarBeforeResume?: boolean
}

export interface Phase14ScenarioResult {
  tmpDir: string
  dtcDir: string
  checkpointRunId: string
  resumeState: ResumeState | null
  bannerLines: string[]
  error: Error | null
}

export async function runPhase14Scenario(opts: Phase14ScenarioOpts): Promise<Phase14ScenarioResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'phase14-'))
  const dtcDir = join(tmpDir, '.dtc')
  await mkdir(dtcDir, { recursive: true })
  await mkdir(join(dtcDir, 'snapshots'), { recursive: true })

  const checkpointRunId = `run-${randomUUID().slice(0, 12)}`

  // 1. Write source files to disk
  const snapshot = new Map<string, string>()
  for (const [relPath, content] of Object.entries(opts.sourceFiles)) {
    const absPath = join(tmpDir, relPath)
    await mkdir(join(absPath, '..'), { recursive: true })
    await writeFile(absPath, content)
    snapshot.set(relPath, content)
  }

  // 2. Write real sidecar
  const sidecarMeta = await writePreAgentSnapshotSidecar(dtcDir, checkpointRunId, snapshot)

  // 3. Write run-context (unless omitted)
  if (!opts.omitRunContext) {
    const ctxRunId = opts.runIdMismatch ? `run-mismatch-${randomUUID().slice(0, 8)}` : checkpointRunId
    const ctx: RunContext = {
      runId: ctxRunId,
      prompt: 'test',
      platform: 'swiftui',
      mode: 'add-feature',
      status: 'failed',
      timestamp: Date.now(),
      phases: {
        analysis: { status: 'completed', summary: 'test' },
      },
      filesGenerated: [],
    }
    await saveRunContext(tmpDir, ctx)
  }

  // 4. Write checkpoint (unless corrupt)
  let checkpoint: Checkpoint
  if (opts.corruptCheckpointDb) {
    // Write zero bytes to force better-sqlite3 to throw on read
    await writeFile(join(dtcDir, 'checkpoint.db'), '')
    checkpoint = new Checkpoint(':memory:')  // stub; never actually used
  } else {
    checkpoint = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    // Seed analysis row with real sidecar metadata
    checkpoint.savePhase(checkpointRunId, 'analysis', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      snapshotPath: sidecarMeta.path,
      snapshotSha256: sidecarMeta.sha256,
      fileCount: sidecarMeta.fileCount,
    })
    // Seed every phase up to interruptAfter as completed
    const PHASE_ORDER: PhaseId[] = [
      'analysis','design','spec','design_delta','test_gen','codegen',
      'test_regen','build','validate','security','fix','deliver','report',
    ]
    const stopIdx = PHASE_ORDER.indexOf(opts.interruptAfter)
    for (let i = 1; i <= stopIdx; i++) {
      const phase = PHASE_ORDER[i]
      const isSkipped = opts.skippedPhases?.includes(phase) ?? false
      checkpoint.savePhase(checkpointRunId, phase, isSkipped
        ? { status: 'skipped', reason: 'test-skip', completedAt: new Date().toISOString() }
        : { status: 'completed', completedAt: new Date().toISOString() })
    }
  }

  // 5. Apply drift mutations AFTER snapshot + checkpoint are written
  if (opts.driftMutations?.modify) {
    for (const [relPath, newContent] of Object.entries(opts.driftMutations.modify)) {
      await writeFile(join(tmpDir, relPath), newContent)
    }
  }
  if (opts.driftMutations?.remove) {
    for (const relPath of opts.driftMutations.remove) {
      await unlink(join(tmpDir, relPath))
    }
  }
  if (opts.driftMutations?.add) {
    for (const [relPath, content] of Object.entries(opts.driftMutations.add)) {
      const absPath = join(tmpDir, relPath)
      await mkdir(join(absPath, '..'), { recursive: true })
      await writeFile(absPath, content)
    }
  }

  // 5b. D-32 scenario 3: delete sidecar file BEFORE resume bootstrap runs
  if (opts.deleteSidecarBeforeResume) {
    try {
      const snapshotFiles = await readdir(join(dtcDir, 'snapshots'))
      for (const f of snapshotFiles) {
        await unlink(join(dtcDir, 'snapshots', f))
      }
    } catch { /* ignore — test will fail downstream if deletion didn't happen */ }
  }

  // 6. Load previousContext (real loader)
  const { loadRunContext } = await import('@appifex/core')
  const previousContext = await loadRunContext(tmpDir)

  // 7. Invoke runResumeBootstrap — capture banner + error
  const bannerLines: string[] = []
  let resumeState: ResumeState | null = null
  let error: Error | null = null
  try {
    resumeState = await runResumeBootstrap({
      outputDir: tmpDir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner: (msg) => { bannerLines.push(msg) },
    })
  } catch (err) {
    error = err as Error
  }

  try { checkpoint.close() } catch { /* ignore */ }
  return { tmpDir, dtcDir, checkpointRunId, resumeState, bannerLines, error }
}
