import type { Runner } from '@appifex/core'

/**
 * Phase 14 (D-24, D-26): revert the source tree to the preAgent sidecar baseline.
 *
 * Writes every file in the snapshot map back to disk at its stored path.
 * Unlike revertUnexpectedChanges (which filters by modificationPlan), this
 * unconditionally rewrites ALL sidecar files — the goal is a known baseline
 * for a fresh codegen re-run on resume.
 *
 * Files NOT in the sidecar (new files written by the interrupted agent run)
 * are LEFT IN PLACE per D-26. The resumed codegen will overwrite or ignore
 * them as needed.
 *
 * MUST run after the drift check (D-25) — drift detection is gated upstream
 * in cli/src/resume-bootstrap.ts so a drifted resume never reaches this call.
 */
export async function revertToSidecarBaseline(
  runner: Runner,
  snapshot: Map<string, string>,
): Promise<number> {
  let count = 0
  for (const [filePath, originalContent] of snapshot) {
    try {
      await runner.writeFile(filePath, originalContent)
      count++
    } catch (err) {
      console.error(`[resume] revertToSidecarBaseline: failed to write ${filePath}: ${String(err)}`)
    }
  }
  return count
}
