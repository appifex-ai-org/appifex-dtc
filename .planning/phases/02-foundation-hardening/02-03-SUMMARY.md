---
phase: 02-foundation-hardening
plan: 03
subsystem: infra
tags: [epipe, typed-errors, llm-cli, child-process, error-handling, cli-error]

requires:
  - phase: 02-foundation-hardening
    provides: EpipeError class (Plan 02-01) — extends CliError, carries { site, payloadBytes }
provides:
  - Typed hard-failure on EPIPE at all four real stdin-writing LLM CLI spawn sites
  - Exported `runClaudePrint` helper in cli/src/pipeline.ts — unit-testable spawn site
  - `settle()` double-resolve guards added to claude-cli-generate.ts and claude-cli-fix.ts inner Promises
  - Four EPIPE unit tests that mock `node:child_process.spawn` and assert typed failure
affects:
  - fix-loop (now receives typed EpipeError prefix instead of silent empty claude output)
  - MCP tool wrapper (Plan 02-01) — `EpipeError extends CliError` so wrapper translates cleanly
  - future pipeline stage authors who spawn LLM CLIs — pattern for EPIPE surfacing

tech-stack:
  added: []
  patterns:
    - "settle() idempotent Promise-resolution guard for spawn lifecycles"
    - "stdin error handler installed BEFORE stdin.write() so EPIPE is caught synchronously-ish"
    - "resolve-only spawn sites surface typed errors via EpipeError:-prefixed error strings in their native envelope (ClaudeCliResult / AgentResult)"
    - "reject-capable spawn sites throw `new EpipeError(...)` directly"

key-files:
  created:
    - cli/__tests__/pipeline-epipe.test.ts
    - packages/codegen/__tests__/claude-cli-epipe.test.ts
    - packages/fix/__tests__/claude-cli-fix-epipe.test.ts
    - packages/agent/__tests__/base-adapter-epipe.test.ts
    - .planning/phases/02-foundation-hardening/deferred-items.md
  modified:
    - cli/src/pipeline.ts
    - packages/codegen/src/claude-cli-generate.ts
    - packages/fix/src/claude-cli-fix.ts
    - packages/agent/src/adapters/base.ts

key-decisions:
  - "Extracted `runClaudePrint` as an exported helper from buildCreateMessageFn so the pipeline.ts spawn site is unit-testable without a full runPipeline harness"
  - "Used vi.mock('node:child_process') with a Writable-like fake child that emits EPIPE on write, rather than adding a spawnFn injection parameter — zero production surface area added beyond the runClaudePrint extraction"
  - "Added settle() guards to claude-cli-generate.ts runClaude and claude-cli-fix.ts inner Promise to prevent double-resolve once the stdin error path settles the Promise before 'close' fires"
  - "Resolve-only sites surface EPIPE as a string-prefixed error ('EpipeError: ...') rather than attaching an EpipeError instance — matches existing envelope shapes and lets the fix-loop's `throw result.error ?? 'Claude CLI fix failed'` propagate the prefix cleanly"

patterns-established:
  - "Pattern: stdin error handler installed BEFORE child.stdin.write(prompt) to guarantee EPIPE is caught"
  - "Pattern: settle(fn) helper — { settled = true; fn() } — idempotent Promise settlement across multiple event paths (stdin.error, close, timer)"
  - "Pattern: payload byte count captured via Buffer.byteLength(prompt, 'utf8') BEFORE write and embedded in the error message for observability"

requirements-completed:
  - FOUND-03

duration: 20min
completed: 2026-04-15
---

# Phase 02 Plan 03: EPIPE Hard-Fail at LLM CLI Spawn Sites Summary

**Typed EpipeError surfaces at all four real stdin-writing LLM CLI spawn sites (pipeline.ts `claude --print`, codegen/claude-cli-generate runClaude, fix/claude-cli-fix inner spawn, agent/adapters/base.ts spawnAgentWithInput) — silent swallow at cli/src/pipeline.ts:742-744 removed.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-15T12:42:00Z
- **Completed:** 2026-04-15T12:53:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 4 production files, 4 new tests, 1 helper extraction

## Accomplishments

- EPIPE at `claude --print` in pipeline.ts now REJECTS with `EpipeError { site: 'cli/pipeline.ts:claude-print', payloadBytes }` — was previously `/* swallow EPIPE */`
- EPIPE at `runClaude` in claude-cli-generate.ts resolves ClaudeCliResult with `error` starting with `EpipeError: ... (site=packages/codegen/claude-cli-generate.ts, <N> bytes)`
- EPIPE in claude-cli-fix.ts resolves inner envelope with `EpipeError:`-prefixed error; outer function throws it, and fix-loop surfaces the typed prefix to callers
- EPIPE in agent base adapter settles `AgentResult` with `EpipeError:`-prefixed error, `stopReason: 'error'`, `exitCode: 1`
- Exported `runClaudePrint({ prompt, model, cwd })` helper from cli/src/pipeline.ts — enables direct unit testing of the claude CLI spawn path
- Four new unit tests pass; full repo test suite (126 files, 1232 tests) still green

## Task Commits

1. **Task 1: Write failing EPIPE tests for 4 sites** — `4309186` (test)
2. **Task 2: Wire production code to surface EpipeError at 4 sites + remove silent swallow** — `4d1108c` (fix)

## Files Created/Modified

**Created:**
- `cli/__tests__/pipeline-epipe.test.ts` — asserts runClaudePrint rejects with `EpipeError` (instanceof CliError, site/payloadBytes populated)
- `packages/codegen/__tests__/claude-cli-epipe.test.ts` — asserts runClaude ClaudeCliResult.error starts with `EpipeError:` and contains site + byte count
- `packages/fix/__tests__/claude-cli-fix-epipe.test.ts` — asserts fixFn rejects with `EpipeError:`-prefixed error containing site + byte count
- `packages/agent/__tests__/base-adapter-epipe.test.ts` — asserts spawnAgent resolves failure AgentResult with `EpipeError:`-prefixed error
- `.planning/phases/02-foundation-hardening/deferred-items.md` — logs pre-existing mcp-server typecheck failure (out of scope)

**Modified:**
- `cli/src/pipeline.ts` — added `EpipeError` import; extracted `runClaudePrint` exported helper; rewrote stdin error handler to `reject(new EpipeError(...))`; replaced inline claude-cli spawn in `buildCreateMessageFn` with `runClaudePrint` call; removed `/* swallow EPIPE */` silent handler
- `packages/codegen/src/claude-cli-generate.ts` — added stdin error handler in `runClaude` that resolves ClaudeCliResult with `EpipeError:` prefix; wrapped existing close/timer callbacks in `settle()` guard
- `packages/fix/src/claude-cli-fix.ts` — added stdin error handler in inner spawn Promise that resolves envelope with `EpipeError:` prefix; wrapped close/timer in `settle()` guard
- `packages/agent/src/adapters/base.ts` — added stdin error handler using existing `settle()` helper that resolves AgentResult with `EpipeError:` prefix

## Decisions Made

- **Exported runClaudePrint** (pipeline.ts) rather than mocking the entire `buildCreateMessageFn` or `runPipeline` flow. The helper has a minimal contract (`{ prompt, model, cwd }`) and mirrors the existing inline implementation byte-for-byte aside from the stdin error handler and settle() guards. This adds zero runtime behavior change for non-EPIPE paths.
- **String-prefixed error at resolve-only sites** rather than attaching an EpipeError instance to the envelope. The three envelope shapes (ClaudeCliResult, FixFnResult, AgentResult) all use `error: string | undefined`; embedding the prefix `EpipeError:` preserves that contract and keeps the fix-loop's `throw err` path intact. Callers that need the typed instance can parse the prefix or the caller chain can be upgraded later.
- **No spawnFn injection parameter** — using `vi.mock('node:child_process')` keeps the production API untouched. Each test hoists a single mock and overrides `spawn` via `vi.mocked(spawn).mockImplementation(...)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added `settle()` guards at claude-cli-generate.ts and claude-cli-fix.ts**
- **Found during:** Task 2 (wiring stdin error handlers)
- **Issue:** With a new stdin `error` handler resolving the inner Promise, the existing `close` and timeout paths could also `resolve()` — causing double-resolve after an EPIPE. JavaScript Promises ignore post-settlement resolves, but the secondary resolve could mask real downstream state if the envelope were later extended.
- **Fix:** Introduced a local `settle(fn)` idempotent helper in each Promise body (mirroring the pattern already in packages/agent/src/adapters/base.ts) and wrapped every `resolve(...)` call in the stdin/close/timer handlers with `settle(() => resolve(...))`.
- **Files modified:** packages/codegen/src/claude-cli-generate.ts, packages/fix/src/claude-cli-fix.ts
- **Verification:** All 4 EPIPE tests pass; full repo suite (126 files, 1232 tests) remains green.
- **Committed in:** 4d1108c

**2. [Scope — testing harness] Switched claude-cli-fix-epipe.test.ts from `mockReturnValueOnce` to `mockImplementation`**
- **Found during:** Task 2 verification after GREEN transition
- **Issue:** Test called `fixFn(failures)` twice (once inside `expect.rejects`, once in try/catch to inspect the error). `mockReturnValueOnce` only set up the first spawn; the second call returned `undefined`, producing `Cannot read properties of undefined (reading 'stdin')`.
- **Fix:** Replaced with `vi.mocked(spawn).mockImplementation((() => makeFakeChildEmittingEpipeOnStdin()) as any)` so every spawn call gets a fresh fake child.
- **Files modified:** packages/fix/__tests__/claude-cli-fix-epipe.test.ts
- **Verification:** Test now passes GREEN.
- **Committed in:** 4d1108c

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 test-harness correctness)
**Impact on plan:** Neither deviation changes plan scope. The `settle()` guard is a safety-net for double-resolve hygiene; the test-harness fix is mechanical. SDK sites (default-generate, layered-generate, default-fix) untouched as specified.

## Issues Encountered

- **Pre-existing typecheck failure in packages/mcp-server/src/server.ts** (out of scope, logged to `.planning/phases/02-foundation-hardening/deferred-items.md`):
  - `TS2305: Module '"@appifex/core"' has no exported member 'CliError'.` at server.ts:2:10
  - `TS18046: 'err' is of type 'unknown'.` at server.ts:27:46 and 27:59
  - Verified pre-existing via `git stash && pnpm -r exec tsc --noEmit` before our changes were applied.
  - Likely residue from Plan 02-01 not propagating the CliError export into the mcp-server workspace. Belongs in a follow-up plan; not caused by Plan 02-03 and not blocking the FOUND-03 goal.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- FOUND-03 is closed: EPIPE surfaces typed at all four real stdin-writing LLM CLI spawn sites.
- Wave 2 Plan 03 does not depend on anything beyond EpipeError from Plan 01; no downstream plans blocked.
- Recommended follow-up (separate plan): fix pre-existing `packages/mcp-server/src/server.ts` TS errors so `pnpm -r exec tsc --noEmit` passes cleanly (see deferred-items.md).

## Self-Check: PASSED

Verified post-commit:
- `[ -f cli/__tests__/pipeline-epipe.test.ts ]` → FOUND
- `[ -f packages/codegen/__tests__/claude-cli-epipe.test.ts ]` → FOUND
- `[ -f packages/fix/__tests__/claude-cli-fix-epipe.test.ts ]` → FOUND
- `[ -f packages/agent/__tests__/base-adapter-epipe.test.ts ]` → FOUND
- `git log --oneline | grep 4309186` → FOUND (test commit)
- `git log --oneline | grep 4d1108c` → FOUND (fix commit)
- `grep 'swallow EPIPE' cli/src/pipeline.ts` → 0 matches (removed)
- `grep 'EpipeError' cli/src/pipeline.ts packages/codegen/src/claude-cli-generate.ts packages/fix/src/claude-cli-fix.ts packages/agent/src/adapters/base.ts` → >=1 match in each of the 4 files
- `pnpm vitest run cli/__tests__/pipeline-epipe.test.ts packages/codegen/__tests__/claude-cli-epipe.test.ts packages/fix/__tests__/claude-cli-fix-epipe.test.ts packages/agent/__tests__/base-adapter-epipe.test.ts` → 4 files, 7 tests, all PASS
- `pnpm test` → 126 files, 1232 tests, 8 skipped, all PASS

---
*Phase: 02-foundation-hardening*
*Completed: 2026-04-15*
