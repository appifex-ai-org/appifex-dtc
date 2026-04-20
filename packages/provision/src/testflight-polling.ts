// Phase 5 Plan 05 (TF-04 D-15, Q2): build-processing polling loop.
// - Flat 30s cadence + ±5s jitter to avoid thundering-herd if multiple dtc runs poll concurrently.
// - 45-min hard timeout — returns 'TIMEOUT' so caller (runTestFlightUploadPhase) can
//   D-17 soft-fail (pipeline exit 0 + user-facing warning).
// - Emits a `running` ProgressEvent every tick with elapsed-minutes message for the
//   terminal UI + MCP client progress streams.
// - Zero retries on AUTH errors (Q2): getBuildProcessingState throws TestFlightError on
//   non-ok outcomes, which propagates to the caller without retry. The polling loop
//   itself is only responsible for translating processingState → terminal union.

import type { ProgressEmitter, PhaseId } from '@appifex/core'
import type { AscRestOpts } from './asc-rest.js'
import { getBuildProcessingState } from './asc-rest.js'

export interface PollOpts {
  ascOpts: AscRestOpts
  buildId: string
  emitter: ProgressEmitter
  phaseId?: PhaseId
  intervalMs?: number
  timeoutMs?: number
}

export async function pollUntilProcessed(
  opts: PollOpts,
): Promise<'VALID' | 'INVALID' | 'FAILED' | 'TIMEOUT'> {
  const interval = opts.intervalMs ?? 30_000
  const timeout = opts.timeoutMs ?? 45 * 60_000
  // Phase 5 (D-15): testflight_upload isn't in PHASE_ORDER yet; callers may pass a
  // specific PhaseId — default to 'provision' which is in the current enum.
  const phase: PhaseId = opts.phaseId ?? 'provision'
  const start = Date.now()

  while (true) {
    const elapsed = Date.now() - start
    if (elapsed >= timeout) return 'TIMEOUT'

    const state = await getBuildProcessingState(opts.ascOpts, opts.buildId)
    if (state === 'VALID') return 'VALID'
    if (state === 'FAILED' || state === 'INVALID') return state

    const mins = Math.floor(elapsed / 60_000)
    opts.emitter.emit({
      phase,
      status: 'running',
      message: `Apple processing build... ${mins} min elapsed`,
      timestamp: Date.now(),
    })

    // ±5s jitter keeps concurrent dtc runs from hammering ASC in lockstep.
    const jittered = interval + (Math.random() * 10_000 - 5_000)
    await new Promise((r) => setTimeout(r, jittered))
  }
}
