// Phase 04 (DX-07): extracted from cli/src/pipeline.ts:132-138.
// Shared by the EPIPE handler in pipeline.ts AND the new claude-cli-message.ts
// factory — extracted to a neutral module to kill duplication without creating
// a leaf→orchestrator import cycle (providers/*.ts importing from pipeline.ts
// would be structurally backwards).
//
// DO NOT inline this body anywhere else. Single source of truth.
// The JSON payload shape (`{ message, code, at: 'child.stdin' }`) is a
// Phase 02 OBS-01 contract — see cli/__tests__/pipeline-claude-epipe.test.ts.

import type { DebugLogger } from '@appifex/core'

/**
 * Phase 02 (OBS-01): surface `claude --print` stdin errors (EPIPE when claude
 * closes stdin early on large prompts) via `DebugLogger` instead of silently
 * swallowing. The writer is fire-and-forget by design — the stdin 'error'
 * listener is sync and must not block the stream — so the EPIPE handler
 * wraps this call in `void`.
 *
 * Exported as a named helper so it can be unit-tested in isolation without
 * spawning the real `claude` binary.
 */
export async function logClaudeStdinError(debug: DebugLogger, err: unknown): Promise<void> {
  await debug.logJson('claude-epipe.json', {
    message: err instanceof Error ? err.message : String(err),
    code: (err as NodeJS.ErrnoException | undefined)?.code,
    at: 'child.stdin',
  })
}
