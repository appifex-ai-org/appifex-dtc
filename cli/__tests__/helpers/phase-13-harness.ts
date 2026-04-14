/**
 * Phase 13 (QUALITY-03a) integration harness.
 *
 * Drives the exact Phase 13 instrumentation surface from `cli/src/pipeline.ts`
 * (centralized emit() hook + outer-catch fallback + analysis sidecar write +
 * design_delta failed-row coverage) against a tmp workdir. Uses the REAL
 * `Checkpoint` class and REAL `writePreAgentSnapshotSidecar` from `@appifex/core`
 * so the trail rows, sidecar JSON, and run-context produced by this harness
 * are byte-for-byte equivalent to a real add-feature run's Phase 13 outputs.
 *
 * This is a "faithful simulation" of the pipeline's Phase 13 surface rather
 * than a full `runPipeline` driver. Rationale: `runPipeline` has ~15 heavy
 * external dependencies (design tool, LLM providers, Xcode/Gradle builds,
 * Semgrep, agent CLIs, git deliver) that are orthogonal to Phase 13's
 * contract. Phase 13 is pure instrumentation — the harness exercises the
 * exact instrumentation logic line-by-line to the pipeline.ts source.
 *
 * The PHASE_ORDER replay here MUST stay in lockstep with the real pipeline's
 * emit() call sites. Changes to pipeline.ts phase terminals require matching
 * changes to `replayAddFeaturePhases` below.
 */
import { mkdir, mkdtemp, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  Checkpoint,
  writePreAgentSnapshotSidecar,
  RunContextBuilder,
  type PhaseId,
  type RunContext,
} from '@appifex/core'

/**
 * Inlined from `packages/core/src/run-context.ts:31` because PHASE_ORDER is not
 * re-exported from `@appifex/core`'s package index (it only ships via the internal
 * run-context module). Keep this in lockstep with the source of truth.
 */
const PHASE_ORDER: PhaseId[] = [
  'analysis',
  'design',
  'spec',
  'design_delta',
  'test_gen',
  'codegen',
  'test_regen',
  'build',
  'validate',
  'security',
  'fix',
  'deliver',
  'report',
]

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunResult {
  runId: string
  dtcDir: string
  completedPhases: PhaseId[]
}

export interface RunOpts {
  /** When false, the design_delta phase emits 'skipped' with a no-baseline reason (D-03). */
  hasBaselinePen?: boolean
  /** When true, Checkpoint.savePhase throws on every call — verifies log-and-continue invariant. */
  simulateCheckpointFailure?: boolean
}

// ---------------------------------------------------------------------------
// Core emit() replay — a byte-faithful reproduction of cli/src/pipeline.ts's
// Phase 13 instrumentation at every phase terminal boundary in PHASE_ORDER.
// ---------------------------------------------------------------------------

/**
 * Subclass of Checkpoint whose savePhase throws on every call while keeping
 * the close() + read methods intact. Used by `simulateCheckpointFailure` to
 * prove the log-and-continue invariant: the pipeline MUST complete every phase
 * even when savePhase throws unconditionally.
 *
 * Phase 13 (WR-05): was previously implemented via `Object.create(real)` +
 * `any` cast, which depended on `better-sqlite3`'s internals never moving to
 * ECMAScript `#private` fields. Subclassing is type-safe and doesn't rely on
 * prototype-chain tricks.
 */
class FailingCheckpoint extends Checkpoint {
  override savePhase(): void {
    throw new Error('[test] simulated checkpoint.savePhase failure')
  }
}

interface EmitContext {
  runMode: 'add-feature' | 'fresh'
  checkpoint: Checkpoint
  checkpointRunId: string
  ctxBuilder: RunContextBuilder
  // Local tracker, mirrors pipeline.ts `let currentPhase`
  currentPhase: { value: PhaseId | null }
}

/**
 * Faithful reproduction of cli/src/pipeline.ts emit(). The terminal-status
 * branch writes a checkpoint row wrapped in log-and-continue, identical to
 * the real pipeline's hook.
 */
function emit(
  ctx: EmitContext,
  phase: PhaseId,
  status: 'started' | 'running' | 'completed' | 'failed' | 'skipped',
  message: string,
): void {
  ctx.currentPhase.value = phase
  if (status === 'completed' || status === 'failed' || status === 'skipped') {
    ctx.ctxBuilder.recordPhase(phase, status === 'skipped' ? 'skipped' : status, message)
    if (ctx.runMode === 'add-feature') {
      try {
        const now = new Date().toISOString()
        if (status === 'completed') {
          ctx.checkpoint.savePhase(ctx.checkpointRunId, phase, {
            status: 'completed',
            completedAt: now,
          })
        } else if (status === 'failed') {
          ctx.checkpoint.savePhase(ctx.checkpointRunId, phase, {
            status: 'failed',
            error: message,
            failedAt: now,
            completedAt: now,
          })
        } else {
          ctx.checkpoint.savePhase(ctx.checkpointRunId, phase, {
            status: 'skipped',
            reason: message,
            completedAt: now,
          })
        }
      } catch (err) {
        console.error(`[checkpoint] savePhase failed for ${phase}/${status}: ${String(err)}`)
      }
    }
  }
}

/**
 * Replays the pipeline.ts add-feature path at phase granularity. Each branch
 * below maps to a phase terminal site in cli/src/pipeline.ts. If any phase
 * throws, the outer catch attributes the failure to the phase that was
 * executing (Pitfall 6) and re-throws.
 */
async function replayAddFeaturePhases(
  ctx: EmitContext,
  opts: {
    dtcDir: string
    failAt?: PhaseId
  },
): Promise<PhaseId[]> {
  const completed: PhaseId[] = []
  const { dtcDir, failAt } = opts

  try {
    for (const phase of PHASE_ORDER) {
      // design_delta skip branch mirrors runDesignDeltaPhase (D-03)
      if (
        phase === 'design_delta' &&
        ctx.runMode === 'add-feature' &&
        (opts as any).hasBaselinePen === false
      ) {
        emit(ctx, phase, 'skipped', 'No baseline .pen tokens available')
        continue
      }

      if (failAt && phase === failAt) {
        // Reach the phase but then throw — the outer catch will attribute the
        // failed row to `currentPhase` (set by emit() 'started' above).
        ctx.currentPhase.value = phase
        throw new Error(`[test] simulated ${phase} failure`)
      }

      // analysis phase carries the sidecar write immediately after its
      // centralized-hook terminal emit (cli/src/pipeline.ts ~line 1570 area).
      emit(ctx, phase, 'completed', `${phase} ok`)
      completed.push(phase)

      // Phase 13 (WR-04): replay the post-emit targeted savePhase calls that
      // pipeline.ts makes for design/spec/test_gen. These upserts carry
      // payloads without a `status` field and — prior to the CR-01 fix —
      // would silently wipe the `status: completed` the centralized hook just
      // wrote, making `lastCompletedPhase` miss these phases. Keeping the
      // replay faithful to the real pipeline ensures regression coverage.
      if (ctx.runMode === 'add-feature') {
        try {
          if (phase === 'design') {
            // pipeline.ts:964 / 972 / 978 / 1022 — all pass { designFile }
            ctx.checkpoint.savePhase(ctx.checkpointRunId, 'design', {
              designFile: '/tmp/design.pen',
            })
          } else if (phase === 'spec') {
            // pipeline.ts:1332 — passes { platformSpec }
            ctx.checkpoint.savePhase(ctx.checkpointRunId, 'spec', {
              platformSpec: {
                appName: 'test',
                platform: 'swiftui',
                screens: [],
                navigation: { type: 'stack', entry: 'root', routes: [] },
                designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
              } as any,
            })
          } else if (phase === 'test_gen') {
            // pipeline.ts:1481 — passes test file names + counts
            ctx.checkpoint.savePhase(ctx.checkpointRunId, 'test_gen', {
              uiTestFileNames: ['flow.yaml'],
              unitTestFileNames: ['spec.test.ts'],
              uiTestCount: 1,
              unitTestCount: 1,
            })
          }
        } catch (err) {
          // Log-and-continue — mirrors pipeline.ts targeted write failure tolerance
          console.error(`[checkpoint] targeted savePhase failed for ${phase}: ${String(err)}`)
        }
      }

      if (phase === 'analysis' && ctx.runMode === 'add-feature') {
        // Replay the sidecar write: build a deterministic preAgentSnapshot,
        // serialize it, and upsert the analysis checkpoint row with the
        // richer payload (identical to pipeline.ts lines ~1570-1595).
        const snapshot = new Map<string, string>([
          [
            'Sources/App.swift',
            'import SwiftUI\n@main struct App: SwiftUI.App { var body: some Scene { WindowGroup {} } }\n',
          ],
          [
            'Sources/ContentView.swift',
            'import SwiftUI\nstruct ContentView: View { var body: some View { Text("Hello") } }\n',
          ],
        ])
        try {
          const sidecarMeta = await writePreAgentSnapshotSidecar(
            dtcDir,
            ctx.checkpointRunId,
            snapshot,
          )
          ctx.checkpoint.savePhase(ctx.checkpointRunId, 'analysis', {
            status: 'completed',
            completedAt: new Date().toISOString(),
            snapshotPath: sidecarMeta.path,
            snapshotSha256: sidecarMeta.sha256,
            fileCount: sidecarMeta.fileCount,
          })
        } catch (err) {
          console.error(`[checkpoint] sidecar write or analysis upsert failed: ${String(err)}`)
        }
      }
    }
  } catch (apiErr) {
    // Phase 13 (Pitfall 6): outer-catch fallback writes a {failed} row for the
    // currently-executing phase. Identical to the outer catch in pipeline.ts.
    if (ctx.runMode === 'add-feature' && ctx.currentPhase.value !== null) {
      try {
        const now = new Date().toISOString()
        ctx.checkpoint.savePhase(ctx.checkpointRunId, ctx.currentPhase.value, {
          status: 'failed',
          error: String(apiErr),
          failedAt: now,
          completedAt: now,
        })
      } catch (ckptErr) {
        console.error(`[checkpoint] outer-catch savePhase failed: ${String(ckptErr)}`)
      }
    }
    throw apiErr
  }

  return completed
}

// ---------------------------------------------------------------------------
// Public harness entry points
// ---------------------------------------------------------------------------

async function makeTmpDtcDir(prefix: string): Promise<{ workdir: string; dtcDir: string }> {
  const workdir = await mkdtemp(join(tmpdir(), prefix))
  const dtcDir = join(workdir, '.dtc')
  await mkdir(dtcDir, { recursive: true })
  await mkdir(join(dtcDir, 'snapshots'), { recursive: true })
  return { workdir, dtcDir }
}

/**
 * Drive a full add-feature pipeline simulation. Produces every PHASE_ORDER
 * row in the checkpoint DB plus the preAgent sidecar JSON.
 */
export async function runFullAddFeaturePipeline(opts: RunOpts = {}): Promise<RunResult> {
  const { workdir, dtcDir } = await makeTmpDtcDir('phase13-af-')
  const checkpointRunId = `run-${randomUUID().slice(0, 8)}`
  const dbPath = join(dtcDir, 'checkpoint.db')
  const realCheckpoint: Checkpoint = opts.simulateCheckpointFailure
    ? new FailingCheckpoint(dbPath)
    : new Checkpoint(dbPath)
  const checkpoint = realCheckpoint
  const ctxBuilder = new RunContextBuilder({
    prompt: 'test',
    platform: 'swiftui',
    mode: 'add-feature',
  })

  const ctx: EmitContext = {
    runMode: 'add-feature',
    checkpoint,
    checkpointRunId,
    ctxBuilder,
    currentPhase: { value: null },
  }

  const completedPhases = await replayAddFeaturePhases(ctx, {
    dtcDir,
    ...(opts.hasBaselinePen === false && ({ hasBaselinePen: false } as any)),
  } as any)

  // Persist run-context.json for completeness (not asserted on in add-feature tests)
  const { saveRunContext } = await import('@appifex/core')
  await saveRunContext(workdir, ctxBuilder.build('completed'))

  try {
    realCheckpoint.close()
  } catch {
    /* ignore */
  }
  return { runId: checkpointRunId, dtcDir, completedPhases }
}

/**
 * Drive an add-feature pipeline that throws at `failAt`. Priors must remain
 * {completed}; the failing phase must land a {failed} row via the outer catch.
 */
export async function runAddFeaturePipelineWithFailure(failAt: PhaseId): Promise<RunResult> {
  const { workdir, dtcDir } = await makeTmpDtcDir('phase13-affail-')
  const checkpointRunId = `run-${randomUUID().slice(0, 8)}`
  const checkpoint = new Checkpoint(join(dtcDir, 'checkpoint.db'))
  const ctxBuilder = new RunContextBuilder({
    prompt: 'test',
    platform: 'swiftui',
    mode: 'add-feature',
  })

  const ctx: EmitContext = {
    runMode: 'add-feature',
    checkpoint,
    checkpointRunId,
    ctxBuilder,
    currentPhase: { value: null },
  }

  let completedPhases: PhaseId[] = []
  try {
    completedPhases = await replayAddFeaturePhases(ctx, { dtcDir, failAt })
  } catch {
    // Expected — outer catch already wrote the failed row.
  }

  try {
    await (await import('@appifex/core')).saveRunContext(workdir, ctxBuilder.build('failed'))
  } catch {
    /* ignore */
  }
  try {
    checkpoint.close()
  } catch {
    /* ignore */
  }
  return { runId: checkpointRunId, dtcDir, completedPhases }
}

/**
 * Drive a fresh-app pipeline simulation. Produces only the run-context.json
 * (no add-feature checkpoint rows — fresh-app gate is off).
 *
 * Shape of the emitted run-context MUST remain byte-stable (modulo normalized
 * volatile fields) between runs — this is the "pure instrumentation" invariant
 * from `pipeline-checkpoint-unchanged.test.ts`.
 */
export async function runFullFreshAppPipeline(_opts: RunOpts = {}): Promise<RunResult> {
  const { workdir, dtcDir } = await makeTmpDtcDir('phase13-fresh-')
  const checkpointRunId = `run-${randomUUID().slice(0, 8)}`
  const checkpoint = new Checkpoint(join(dtcDir, 'checkpoint.db'))
  const ctxBuilder = new RunContextBuilder({
    prompt: 'Build a minimal counter app',
    platform: 'swiftui',
    mode: 'fresh',
  })

  const ctx: EmitContext = {
    runMode: 'fresh',
    checkpoint,
    checkpointRunId,
    ctxBuilder,
    currentPhase: { value: null },
  }

  // Fresh-app path does NOT traverse `analysis` or `design_delta` (both are
  // add-feature-gated in pipeline.ts). Replay only the phases that fire in a
  // fresh-app run, matching pipeline.ts's fresh-app emit sequence.
  const FRESH_APP_PHASES: PhaseId[] = [
    'design',
    'spec',
    'test_gen',
    'codegen',
    'test_regen',
    'build',
    'validate',
    'security',
    'fix',
    'deliver',
    'report',
  ]
  for (const phase of FRESH_APP_PHASES) {
    emit(ctx, phase, 'completed', `${phase} ok`)
  }

  const { saveRunContext } = await import('@appifex/core')
  await saveRunContext(workdir, ctxBuilder.build('completed'))

  try {
    checkpoint.close()
  } catch {
    /* ignore */
  }
  return { runId: checkpointRunId, dtcDir, completedPhases: FRESH_APP_PHASES }
}

// ---------------------------------------------------------------------------
// normalizeRunContext — strip volatile fields so the golden-fixture comparator
// in pipeline-checkpoint-unchanged.test.ts can assert structural equality.
// ---------------------------------------------------------------------------

/**
 * Replace timestamps, runIds, and tmp-path prefixes with `<NORMALIZED>` so
 * two fresh-app runs produce identical objects. The comparator in
 * `pipeline-checkpoint-unchanged.test.ts` applies this to both sides before
 * `expect(actual).toEqual(golden)`.
 */
export function normalizeRunContext(ctx: any): any {
  if (ctx === null || typeof ctx !== 'object') return ctx
  const NORMALIZED = '<NORMALIZED>'
  // Shallow clone so we don't mutate the caller's object.
  const out: any = Array.isArray(ctx) ? [] : {}
  for (const [key, value] of Object.entries(ctx)) {
    // Drop purely informational comment fields from fixture side-by-side.
    if (key === '_comment') continue

    // Normalize known volatile keys
    if (
      key === 'runId' ||
      key === 'startedAt' ||
      key === 'updatedAt' ||
      key === 'timestamp' ||
      key === 'completedAt' ||
      key === 'failedAt'
    ) {
      out[key] = NORMALIZED
      continue
    }

    if (typeof value === 'string') {
      // ISO-8601 timestamps — normalize
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        out[key] = NORMALIZED
        continue
      }
      // runId strings
      if (/^run-[a-f0-9]{8,}/.test(value)) {
        out[key] = NORMALIZED
        continue
      }
      // tmp path prefixes
      if (
        value.startsWith('/tmp/') ||
        value.startsWith('/var/folders/') ||
        value.startsWith('/private/var/')
      ) {
        out[key] = NORMALIZED
        continue
      }
    }

    if (typeof value === 'object' && value !== null) {
      out[key] = normalizeRunContext(value)
      continue
    }

    out[key] = value
  }
  return out
}

// ---------------------------------------------------------------------------
// Misc — unused helper guards to prevent tsc unused warnings
// ---------------------------------------------------------------------------

// Re-export types used by callers
export type { RunContext, PhaseId }

// Silence unused-import lint for helpers kept for future expansion
void readFile
void writeFile
void access
