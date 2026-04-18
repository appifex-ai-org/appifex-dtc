/**
 * Phase 7 (MCP-02 D-05 D-06): handleGetPipelineStatus MCP handler.
 *
 * Read-only: reads .dtc/run-context.json + .dtc/checkpoint.db for a project and
 * returns a flat snapshot the agent can use to decide resume-vs-restart.
 *
 * Revision B-04 (2026-04-18): unions status from BOTH sources. PhaseOutcome.status
 * only has completed/failed/skipped — 'running' lives in CheckpointBase.status
 * (exact scenario: mid-phase crash leaves Checkpoint row as 'running' with no
 * corresponding RunContext entry).
 */
import { loadRunContext, Checkpoint, PHASE_ORDER } from '@appifex/core'
import type { PhaseId } from '@appifex/core'
import { join } from 'node:path'

type UnifiedStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface HandleGetPipelineStatusArgs {
  projectDir: string
  configDir?: string
}

export async function handleGetPipelineStatus(
  args: HandleGetPipelineStatusArgs,
): Promise<{ text: string; isError: boolean }> {
  const ctx = await loadRunContext(args.projectDir)
  if (!ctx) {
    return {
      text: JSON.stringify(
        { runId: null, currentPhase: null, phases: [] },
        null,
        2,
      ),
      isError: false,
    }
  }

  const checkpoint = new Checkpoint(join(args.projectDir, '.dtc', 'checkpoint.db'))
  try {
    const phases = PHASE_ORDER.map((id: PhaseId) => {
      const outcome = ctx.phases[id]

      // Revision B-04: read checkpoint row to catch 'running' (mid-phase crash).
      // ctx.phases[id]?.status ∈ { completed | failed | skipped }, so 'running'
      // can ONLY come from the Checkpoint side.
      let checkpointStatus: UnifiedStatus | undefined
      try {
        const row = checkpoint.getPhase(ctx.runId, id) as { status?: string } | null
        if (row && typeof row.status === 'string') {
          if (
            row.status === 'running' ||
            row.status === 'completed' ||
            row.status === 'failed' ||
            row.status === 'skipped'
          ) {
            checkpointStatus = row.status
          }
        }
      } catch {
        // Corrupt row or DB read fail — ignore; fall through to outcome-based status.
      }

      // Union precedence: Checkpoint 'running' beats RunContext; otherwise prefer
      // RunContext (it's the terminal outcome source of truth); then checkpoint
      // terminal status; finally 'pending'.
      const outcomeStatus = outcome?.status as UnifiedStatus | undefined
      const status: UnifiedStatus =
        checkpointStatus === 'running'
          ? 'running'
          : outcomeStatus ?? checkpointStatus ?? 'pending'

      return {
        id,
        status,
        ...(outcome?.summary && { summary: outcome.summary }),
      }
    })

    // Pitfall 7: derive currentPhase with fallback chain
    const running = phases.find((p) => p.status === 'running')
    let currentPhase: PhaseId | null = null
    if (running) {
      currentPhase = running.id
    } else {
      const lastCompletedIdx = [...phases]
        .map((p, i) => ({ p, i }))
        .reverse()
        .find((x) => x.p.status === 'completed')?.i
      if (lastCompletedIdx != null && lastCompletedIdx + 1 < PHASE_ORDER.length) {
        currentPhase = PHASE_ORDER[lastCompletedIdx + 1]
      }
      // If no completed phase either, currentPhase stays null (idle/complete)
    }

    const failedEntry = phases.find((p) => p.status === 'failed')

    return {
      text: JSON.stringify(
        {
          runId: ctx.runId,
          currentPhase,
          phases,
          ...(failedEntry && {
            lastError: {
              name: 'PhaseError',
              message: String(ctx.phases[failedEntry.id]?.summary ?? 'Phase failed'),
              phase: failedEntry.id,
            },
          }),
        },
        null,
        2,
      ),
      isError: false,
    }
  } finally {
    checkpoint.close()
  }
}
