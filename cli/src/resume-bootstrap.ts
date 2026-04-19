/**
 * Phase 14 (QUALITY-03b, QUALITY-03c): Resume bootstrap read layer.
 *
 * Detects resume eligibility, verifies sidecar integrity via aggregate sha256,
 * runs per-file drift detection, and produces a ResumeState consumed by Plan 14-02
 * for skip-logic and pre-codegen revert gating.
 *
 * Error classes covered:
 *   D-04: corrupt checkpoint DB → ResumeAbortError with actionable message
 *   D-05: missing run-context → ResumeAbortError with actionable message
 *   D-06: runId mismatch → ResumeAbortError naming both IDs
 *   D-15: per-file drift → ResumeAbortError with exact D-17 formatted message
 *   D-16: aggregate sha256 mismatch (first gate) → ResumeAbortError
 *   D-32 scenario 3: sidecar file deleted → ResumeAbortError wrapping SidecarCorruptError
 *
 * NOT in this file: canSkipPhase extension, codegen revert gating (Plan 14-02).
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, isAbsolute, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import type { Checkpoint } from '@appifex/core'
import {
  readPreAgentSnapshotSidecar,
  recomputeAggregateSha256,
  SidecarCorruptError,
  type PhaseId,
  type RunContext,
  type SnapshotSidecarPayload,
} from '@appifex/core'

// ── Public error type ─────────────────────────────────────────────────────────

// Phase 02 Plan 01 (FOUND-04): ResumeAbortError now lives in @appifex/core as a
// CliError subclass so MCP tool wrappers can catch it via `instanceof CliError`
// without crashing the host. Re-exported here to preserve existing import paths
// (cli/src/pipeline.ts, cli/__tests__/resume-bootstrap.test.ts,
// cli/__tests__/pipeline-add-feature-resume.test.ts).
import { ResumeAbortError } from '@appifex/core'
export { ResumeAbortError }

// ── Phase 24 (RESUME-02 / D-03): migrate-on-read helper ──────────────────────

/**
 * Phase 24 (RESUME-02 / D-03): Resolve snapshotPath from checkpoint DB.
 * - New entries: relative path → join(dtcDir, path)
 * - Legacy entries: absolute path → join(dtcDir, 'snapshots', basename(path))
 * No DB rewrite — resolved dynamically at load time.
 */
export function migrateSnapshotPath(snapshotPath: string, dtcDir: string): string {
  if (isAbsolute(snapshotPath)) {
    // Legacy absolute path from pre-Phase-24 runs.
    // Re-anchor to current dtcDir. The filename is stable ({runId}-preAgent.json).
    return join(dtcDir, 'snapshots', basename(snapshotPath))
  }
  // New relative path — join with dtcDir to get absolute for fs operations
  return join(dtcDir, snapshotPath)
}

// ── Public data types ─────────────────────────────────────────────────────────

export interface ResumeState {
  lastCompletedPhase: PhaseId
  sidecar: SnapshotSidecarPayload
  sidecarPath: string
  checkpointRunId: string
}

export interface DetectResumeInput {
  outputDir: string
  runMode: string
  noResume: boolean
  previousContextExists: boolean
}

export type EligibilityResult =
  | { eligible: true }
  | {
      eligible: false
      reason: 'not-add-feature' | 'no-resume-flag' | 'no-checkpoint-db' | 'no-previous-context'
    }

export interface RunResumeBootstrapDeps {
  outputDir: string
  runMode: string
  noResume: boolean
  previousContext: RunContext | null
  checkpoint: Checkpoint
  checkpointRunId: string
  logBanner: (msg: string) => void
}

// ── detectResumeEligibility ───────────────────────────────────────────────────

/**
 * Pure eligibility check — no fs writes, no throws on the happy "first run" path.
 * Returns { eligible: false, reason } for every non-resume scenario.
 */
export function detectResumeEligibility(input: DetectResumeInput): EligibilityResult {
  if (input.runMode !== 'add-feature') {
    return { eligible: false, reason: 'not-add-feature' }
  }
  if (input.noResume) {
    return { eligible: false, reason: 'no-resume-flag' }
  }
  const dbPath = join(input.outputDir, '.dtc', 'checkpoint.db')
  if (!existsSync(dbPath)) {
    return { eligible: false, reason: 'no-checkpoint-db' }
  }
  if (!input.previousContextExists) {
    return { eligible: false, reason: 'no-previous-context' }
  }
  return { eligible: true }
}

// ── runResumeBootstrap ────────────────────────────────────────────────────────

/**
 * Orchestrates the full resume entry sequence.
 *
 * Returns:
 *   - null: non-resume scenario (first-run, --no-resume, wrong mode)
 *   - ResumeState: resume eligible, sidecar loaded, drift clean
 *
 * Throws ResumeAbortError on any hard error. The caller (pipeline.ts) is
 * responsible for catching, printing, and exiting with exitCode.
 */
export async function runResumeBootstrap(
  deps: RunResumeBootstrapDeps,
): Promise<ResumeState | null> {
  // Derive dtcDir from outputDir — single source of truth, matches detectResumeEligibility
  const dtcDir = join(deps.outputDir, '.dtc')

  const eligibility = detectResumeEligibility({
    outputDir: deps.outputDir,
    runMode: deps.runMode,
    noResume: deps.noResume,
    previousContextExists: deps.previousContext !== null,
  })

  if (!eligibility.eligible) {
    // D-05: checkpoint DB exists but run-context is missing
    if (eligibility.reason === 'no-previous-context') {
      const dbPath = join(dtcDir, 'checkpoint.db')
      throw new ResumeAbortError(
        `Resume aborted — found checkpoint DB at ${dbPath} but .dtc/run-context.json is missing.\n` +
          `Resume cannot rehydrate modification plan / design delta without run-context.\n` +
          `Fix: delete ${dbPath} or run \`dtc run --add-feature --no-resume\` to start fresh.`,
      )
    }
    // D-03: first add-feature run (no-checkpoint-db) → null silently. No banner, no error.
    // D-02: --no-resume flag → null silently.
    // not-add-feature → null silently.
    return null
  }

  // Guaranteed non-null by eligibility check
  const previousContext = deps.previousContext!

  // D-06: runId mismatch check
  if (previousContext.runId !== deps.checkpointRunId) {
    throw new ResumeAbortError(
      `Resume aborted — runId mismatch between checkpoint and run-context.\n` +
        `  run-context.json runId: ${previousContext.runId}\n` +
        `  checkpoint DB runId:    ${deps.checkpointRunId}\n` +
        `These artifacts belong to different runs. Fix: delete \`.dtc/checkpoint.db\` or run \`dtc run --add-feature --no-resume\`.`,
    )
  }

  // D-04: query checkpoint; wrap in try/catch for corrupt-DB case
  let lastCompleted: PhaseId | null
  try {
    lastCompleted = deps.checkpoint.lastCompletedPhase(deps.checkpointRunId)
  } catch (err) {
    throw new ResumeAbortError(
      `Resume aborted — checkpoint DB at ${join(dtcDir, 'checkpoint.db')} is unreadable: ${String(err)}\n` +
        `Fix: \`rm ${join(dtcDir, 'checkpoint.db')} && dtc run --add-feature --no-resume\` to start fresh.`,
    )
  }

  if (lastCompleted === null) {
    // Checkpoint DB exists but has no completed phases yet — treat as first-run (no banner)
    return null
  }

  // D-22: read analysis row for sidecar pointer
  const analysisRow = deps.checkpoint.getPhase(deps.checkpointRunId, 'analysis') as {
    snapshotPath?: string
    snapshotSha256?: string
    status?: string
  } | null
  if (!analysisRow || !analysisRow.snapshotPath || !analysisRow.snapshotSha256) {
    throw new ResumeAbortError(
      `Resume aborted — checkpoint analysis row missing sidecar pointer (snapshotPath/snapshotSha256).\n` +
        `Fix: \`dtc run --add-feature --no-resume\` to start fresh.`,
    )
  }

  // D-22: load sidecar
  // Phase 24 (D-03): resolve stored path (may be legacy absolute or new relative)
  const resolvedSidecarPath = migrateSnapshotPath(analysisRow.snapshotPath, dtcDir)
  let sidecar: SnapshotSidecarPayload
  try {
    sidecar = await readPreAgentSnapshotSidecar(resolvedSidecarPath)
  } catch (err) {
    if (err instanceof SidecarCorruptError) {
      throw new ResumeAbortError(
        `Resume aborted — sidecar snapshot corrupt: ${err.message}\n` +
          `Fix: \`dtc run --add-feature --no-resume\` to start fresh.`,
      )
    }
    throw err
  }

  // D-16: aggregate sha256 is the FIRST integrity gate (before per-file reads)
  const recomputed = recomputeAggregateSha256(sidecar)
  if (recomputed !== analysisRow.snapshotSha256) {
    throw new ResumeAbortError(
      `Resume aborted — sidecar aggregate sha256 mismatch.\n` +
        `  checkpoint row:    ${analysisRow.snapshotSha256}\n` +
        `  sidecar recompute: ${recomputed}\n` +
        `The snapshot file at ${resolvedSidecarPath} was modified or truncated since the original run.\n` +
        `Fix: \`dtc run --add-feature --no-resume\` to start fresh.`,
    )
  }

  // Print resume banner BEFORE drift check (per D-07 UX: banner first)
  deps.logBanner(`Resuming add-feature run from checkpoint (last completed: ${lastCompleted})`)

  // D-15: per-file drift check against live source tree
  const drift = await checkDrift(sidecar, deps.outputDir)
  if (drift.modified.length > 0 || drift.removed.length > 0) {
    throw new ResumeAbortError(formatDriftError(drift))
  }

  return {
    lastCompletedPhase: lastCompleted,
    sidecar,
    sidecarPath: resolvedSidecarPath,
    checkpointRunId: deps.checkpointRunId,
  }
}

// ── checkDrift ────────────────────────────────────────────────────────────────

/**
 * Read-only drift detection: compares live file hashes against sidecar-recorded hashes.
 *
 * Rules (D-15):
 *   - Files in sidecar that are MISSING from disk → removed[]
 *   - Files in sidecar whose hash DIFFERS from disk → modified[]
 *   - Files on disk NOT in sidecar → ignored (not drift)
 *
 * Defense in depth (T-14-03): any path that is absolute, contains `..`, or
 * resolves outside projectDir is treated as removed[] (never read).
 */
export async function checkDrift(
  sidecar: SnapshotSidecarPayload,
  projectDir: string,
): Promise<{ modified: string[]; removed: string[] }> {
  const modified: string[] = []
  const removed: string[] = []
  const projectDirResolved = resolve(projectDir)

  for (const relPath of Object.keys(sidecar.sha256PerFile)) {
    // Defense in depth: belt-and-braces check (reader already validates, but cheap here)
    if (
      isAbsolute(relPath) ||
      relPath.split('/').includes('..') ||
      relPath.split('\\').includes('..')
    ) {
      removed.push(relPath)
      continue
    }
    const absPath = join(projectDir, relPath)
    const resolvedAbs = resolve(absPath)
    // T-14-03: symlink escape guard — reject paths that escape projectDir
    // Phase 02 Plan 04 (WR-01): use path.sep for cross-platform correctness (macOS-only today, but latent trap)
    if (!resolvedAbs.startsWith(projectDirResolved + sep) && resolvedAbs !== projectDirResolved) {
      removed.push(relPath)
      continue
    }
    try {
      const content = await readFile(absPath, 'utf-8')
      const liveHash = createHash('sha256').update(content).digest('hex')
      if (liveHash !== sidecar.sha256PerFile[relPath]) {
        modified.push(relPath)
      }
    } catch {
      // ENOENT or any read error → treat as removed
      removed.push(relPath)
    }
  }

  return {
    modified: modified.sort(),
    removed: removed.sort(),
  }
}

// ── formatDriftError ──────────────────────────────────────────────────────────

/**
 * Produces the exact D-17 drift error block.
 * Format must match the CONTEXT.md example character-for-character.
 */
export function formatDriftError(drift: { modified: string[]; removed: string[] }): string {
  const total = drift.modified.length + drift.removed.length
  const lines: string[] = []

  lines.push(
    `Resume aborted — ${total} source file${total === 1 ? '' : 's'} have drifted since the original run:`,
  )
  lines.push('')

  if (drift.modified.length > 0) {
    lines.push('Modified:')
    for (const p of drift.modified) lines.push(`  ${p}`)
    lines.push('')
  }

  if (drift.removed.length > 0) {
    lines.push('Removed:')
    for (const p of drift.removed) lines.push(`  ${p}`)
    lines.push('')
  }

  lines.push('Fix drift and retry, or run `dtc run --add-feature --no-resume` to start fresh.')

  return lines.join('\n')
}
