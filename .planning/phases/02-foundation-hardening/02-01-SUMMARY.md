---
phase: 02-foundation-hardening
plan: 01
subsystem: infra
tags: [typed-errors, mcp-server, process-exit, cli-error, preflight]

requires:
  - phase: 01-open-source-release-readiness
    provides: hardened CLI entry + MCP server baseline
provides:
  - CliError typed hierarchy in @appifex/core (CliError, PreflightError, ConfigError, ResumeAbortError, BudgetExhaustedError, EpipeError placeholder)
  - handleCliError translator exported from cli/src/entry.ts
  - wrapToolHandler + server.tool() patch in packages/mcp-server/src/server.ts
  - Three non-entry exit sites refactored to throw instead of process.exit (preflight.ts, pipeline.ts:1140, doctor.ts:62)
affects: [02-02-budget-exhaustion, 02-03-epipe-guards, 02-04-setup-wizard-errors, mcp-server-tools]

tech-stack:
  added: []
  patterns:
    - "Typed CliError hierarchy — each subclass carries domain context (check, configKey, totalBudget, site, etc.) and an exitCode"
    - "MCP tool wrapper pattern: patch server.tool() at construction so every handler goes through wrapToolHandler without editing each registration site"

key-files:
  created:
    - packages/core/src/errors.ts
    - cli/__tests__/preflight.test.ts
    - cli/__tests__/entry-error-handling.test.ts
    - packages/mcp-server/__tests__/cli-error-translation.test.ts
  modified:
    - packages/core/src/index.ts
    - cli/src/preflight.ts
    - cli/src/pipeline.ts
    - cli/src/doctor.ts
    - cli/src/entry.ts
    - cli/src/resume-bootstrap.ts
    - packages/mcp-server/src/server.ts

key-decisions:
  - "Patch server.tool() at createDtcMcpServer construction time instead of editing all ~20 tool registration call sites — one interception point, no maintenance drift as new tools are added"
  - "Migrate the existing cli/src/resume-bootstrap.ts ResumeAbortError to @appifex/core so all ResumeAbortError instances pass instanceof CliError (required for MCP wrapper translation); re-export from resume-bootstrap.ts to preserve existing import paths and test assertions"
  - "doctor.ts throws ConfigError (a CliError subclass), NOT a generic Error — required so the MCP wrapper's instanceof CliError check catches it instead of crashing the host"
  - "Preserve SIGINT handler at pipeline.ts:1110 (Node-idiomatic exit code 128+signal)"

patterns-established:
  - "CliError subclasses carry both message and structured domain context (e.g. PreflightError.check, ConfigError.configKey, BudgetExhaustedError.totalBudget)"
  - "Top-level catch pattern in cli/src/entry.ts: main().catch(handleCliError) with handleCliError: (err: unknown) => never"
  - "MCP tool wrapper translates CliError → { isError: true, content: [{type:'text', text: 'Name: message'}] }; non-CliError re-thrown for SDK default handling"

requirements-completed: [FOUND-04]

duration: 42min
completed: 2026-04-15
---

# Phase 02 Plan 01: Typed CliError Hierarchy Summary

**Typed `CliError` hierarchy in `@appifex/core` plus entry.ts top-level catch and MCP tool wrapper so a thrown pipeline failure no longer kills the MCP host process.**

## Performance

- **Duration:** ~42 min (including worktree bootstrap: pnpm install + better-sqlite3 native build)
- **Started:** 2026-04-15T12:27:00Z
- **Completed:** 2026-04-15T12:38:00Z
- **Tasks:** 4 / 4
- **Files modified:** 7 source + 3 new tests + 1 new errors module = 11 files

## Accomplishments

- New `@appifex/core` error module with 6 classes: `CliError` base plus `PreflightError`, `ConfigError`, `ResumeAbortError`, `BudgetExhaustedError`, `EpipeError` (the last two are placeholders reserved for Plans 02/03 of this phase).
- `cli/src/preflight.ts` now throws `PreflightError` (captures first failing check name) instead of `process.exit(1)`.
- `cli/src/pipeline.ts:1140` resume-abort path now throws `ResumeAbortError` instead of `process.exit(err.exitCode)`.
- `cli/src/doctor.ts:62` now throws `ConfigError` (a CliError subclass) instead of `process.exit(1)`.
- `cli/src/entry.ts` exports `handleCliError(err)` and wires `main().catch(handleCliError)` at the bottom — the only place in the CLI binary that calls `process.exit` for CliError flow.
- `packages/mcp-server/src/server.ts` exports `wrapToolHandler()` and patches `server.tool()` inside `createDtcMcpServer()` so every registered handler gets the wrapper transparently. CliError → `{ isError: true, content: [...] }` envelope; non-CliError re-thrown.
- 3 new test files, 12 assertions, all GREEN; full suite 121 files / 1223 tests pass, 0 regressions.

## Task Commits

1. **Task 1: Failing tests for CliError hierarchy (RED)** — `bec8d15` (test)
2. **Task 2: CliError hierarchy in @appifex/core** — `565021a` (feat)
3. **Task 3: Refactor preflight / pipeline:1140 / doctor to throw typed errors** — `ae05ed6` (refactor)
4. **Task 4: Top-level CliError catch in entry.ts + MCP tool wrapper** — `54387dd` (feat)

## Files Created/Modified

- `packages/core/src/errors.ts` — NEW. CliError base + 5 subclasses. Each subclass carries domain context (check, configKey, totalBudget, site, etc.).
- `packages/core/src/index.ts` — Added CliError barrel re-export.
- `cli/src/preflight.ts` — Replaced `process.exit(1)` with `throw new PreflightError(lines.join('\n'), firstCheck?.name)`. Dropped the inline `console.error` block — `entry.ts` handleCliError now renders the message.
- `cli/src/pipeline.ts` — At line 1140 (resume-abort catch), replaced `process.exit(err.exitCode)` with `throw new ResumeAbortError(err.message)` after `checkpoint.close()`. SIGINT handler at line 1110 untouched.
- `cli/src/doctor.ts` — Replaced `process.exit(1)` at line 62 with `throw new ConfigError(msg)`. Added `ConfigError` import.
- `cli/src/resume-bootstrap.ts` — Removed local `ResumeAbortError extends Error` class; now re-exports `ResumeAbortError` from `@appifex/core`. All existing `throw new ResumeAbortError(...)` sites and test assertions (`expect(err).toBeInstanceOf(ResumeAbortError)` in `cli/__tests__/resume-bootstrap.test.ts` and `pipeline-add-feature-resume.test.ts`) continue to resolve the new core class.
- `cli/src/entry.ts` — Added `handleCliError(err: unknown): never` export + replaced existing `main().catch((err) => { console.error(...); process.exit(1) })` with `main().catch(handleCliError)`.
- `packages/mcp-server/src/server.ts` — Added `wrapToolHandler<Args,Result>(handler)` + `patchServerForCliErrorTranslation(server)` private helper; `createDtcMcpServer()` calls the patch before tool registration so all existing `server.tool(...)` sites in `server-tools-pipeline.ts` and `server-tools-dev.ts` are wrapped transparently.
- `cli/__tests__/preflight.test.ts` — NEW. 3 assertions. Validates PreflightError thrown on critical prerequisite failure; no-op on success; exitCode/CliError inheritance.
- `cli/__tests__/entry-error-handling.test.ts` — NEW. 4 assertions. Validates handleCliError translates CliError to exit code, respects custom exitCode, falls back to exit 1 on generic errors, and ConfigError flows correctly.
- `packages/mcp-server/__tests__/cli-error-translation.test.ts` — NEW. 5 assertions. Validates wrapToolHandler returns isError envelope on CliError, passes through success results, re-throws non-CliError, handles CliError base class, and createDtcMcpServer stays alive.

## Decisions Made

1. **MCP server.tool patch at construction vs. editing each call site** — 20+ existing `server.tool(...)` invocations across two files. Patching `server.tool` once in `createDtcMcpServer()` is less invasive, keeps per-tool files readable, and auto-wraps any future tools. Exported `wrapToolHandler` publicly so tests can exercise the pure wrapping logic in isolation.

2. **Unify `ResumeAbortError` by moving the existing CLI-local class into `@appifex/core`** — The plan explicitly lists `ResumeAbortError` under the new `@appifex/core` exports. The existing `cli/src/resume-bootstrap.ts::ResumeAbortError` (extends plain `Error`) would not satisfy `instanceof CliError` in the MCP wrapper, so keeping both would silently defeat FOUND-04 for all 7 resume-abort paths (D-04, D-05, D-06, D-15, D-16, D-32, drift). Resolution: delete the local class, re-export the core one from `resume-bootstrap.ts` to preserve `import { ResumeAbortError } from '../src/resume-bootstrap.js'` in existing tests.

3. **`doctor.ts` throws `ConfigError`, not a generic `Error`** — Explicitly required by the plan's must_haves. A generic `Error` would bypass `instanceof CliError` in the MCP wrapper and crash the host.

4. **Preserve SIGINT handler at `pipeline.ts:1110`** — Node-idiomatic `process.exit(130)` for signal 2. Explicitly out of scope per the plan's scope notes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree lacked planning phase files and node_modules**
- **Found during:** Initial bootstrap (before Task 1)
- **Issue:** The worktree was freshly created with no `.planning/phases/02-foundation-hardening/` directory and no installed dependencies. `npx vitest` failed immediately with `Cannot find package 'better-sqlite3'` because native bindings were missing.
- **Fix:** Copied `.planning/phases/02-foundation-hardening/` from the parent repo into the worktree's `.planning/phases/` (planning files only — not committed to this branch). Ran `pnpm install --ignore-scripts` to get JS-only deps, then hand-compiled the `better-sqlite3` native binding via `npm run install` inside its pnpm store entry (host's git lefthook hook path conflict blocked the normal post-install script; bypass was safe — scope is local-only test execution).
- **Files modified:** none in-repo — all bootstrap artefacts are under `node_modules/` (gitignored) and `.planning/` (not tracked here).
- **Verification:** Full test suite 121 files / 1223 passed after native binding rebuilt.

**2. [Rule 2 — Missing Critical] Local `ResumeAbortError extends Error` would defeat FOUND-04 for resume flows**
- **Found during:** Task 3 (pipeline.ts:1140 refactor)
- **Issue:** The plan implicitly assumed `ResumeAbortError` did not already exist outside `@appifex/core`. It did — `cli/src/resume-bootstrap.ts` defined its own `extends Error` version that 7 code paths already throw and 7 test assertions already check. A new `ResumeAbortError extends CliError` in core would coexist as a DIFFERENT class (instanceof mismatch), so the MCP wrapper's `instanceof CliError` branch would never fire for any of those paths.
- **Fix:** Deleted the local class; re-exported the core one from `resume-bootstrap.ts` to preserve all existing import paths, throws, and test assertions. Single class, same semantics, CliError-compatible.
- **Files modified:** `cli/src/resume-bootstrap.ts`
- **Verification:** Full suite regression-clean (`cli/__tests__/resume-bootstrap.test.ts` 7 assertions GREEN; `pipeline-add-feature-resume.test.ts` 7 scenarios GREEN).

---

**Total deviations:** 2 auto-fixed (1 blocking setup, 1 missing critical unification).
**Impact on plan:** Neither deviation changed the plan's architectural intent. Both were necessary to make the plan's correctness claims actually hold in this codebase.

## Issues Encountered

- `pnpm install` triggered a `lefthook` prepare script that fails due to a pre-existing `core.hooksPath` override in the worktree's inherited git config. Worked around with `pnpm install --ignore-scripts`; since we're only running tests locally this doesn't affect correctness.
- `pnpm test -- <files>` does not forward `--` args to vitest under `pnpm@10`. Used `npx vitest run <files>` directly for targeted runs.

## User Setup Required

None. No external service configuration.

## Deferred Issues

- **29 `process.exit` calls in `cli/src/setup-wizard.ts`** remain — interactive flow only, not MCP-exposed. Deferred to Phase 03+ per plan scope note.
- **40+ `process.exit` calls in `cli/src/entry.ts`** remain inside command-branch error paths. Only the top-level `main().catch(handleCliError)` was added. Converting the per-command exits requires deciding whether those paths throw CliError (affects external scripts checking exit codes) or continue to exit directly. Out of scope for FOUND-04.
- **`BudgetExhaustedError` and `EpipeError` are declared but not yet thrown.** Plans 02 and 03 consume these classes.
- **`scripts/build-and-link.mjs` is missing** — referenced by `pnpm setup` in root `package.json`. Flagged in research, out of Phase 02 scope.

## TDD Gate Compliance

Plan was type=execute (not type=tdd), but individual tasks were marked `tdd="true"`:
- Task 1 RED commit `bec8d15` (test): 3 test files, all failing imports.
- Task 2 GREEN (partial) commit `565021a` (feat): CliError hierarchy added; preflight test imports resolve.
- Task 3 GREEN (preflight) commit `ae05ed6` (refactor): preflight test fully GREEN.
- Task 4 GREEN (entry + MCP) commit `54387dd` (feat): all 3 test files GREEN (12/12 assertions).

Gate sequence (test → feat/refactor → feat) satisfied.

## Next Plan Readiness

- `BudgetExhaustedError` is exported and ready for Plan 02 to throw from the token budget enforcement path.
- `EpipeError` is exported and ready for Plan 03 to throw from EPIPE-sensitive write call sites.
- MCP host protection is now active for all paths that throw CliError subclasses — Plans 02 and 03 get this for free by throwing the right class.

## Self-Check: PASSED

Verified presence on disk:
- FOUND `packages/core/src/errors.ts` (new, 75 lines)
- FOUND `cli/__tests__/preflight.test.ts`, `cli/__tests__/entry-error-handling.test.ts`, `packages/mcp-server/__tests__/cli-error-translation.test.ts` (all new)
- FOUND commits `bec8d15`, `565021a`, `ae05ed6`, `54387dd` in `git log --oneline`

Verified behavior:
- 12/12 plan-01 test assertions GREEN.
- Full test suite: 121 files / 1223 tests / 8 skipped / **0 failures**.
- `pnpm -r exec tsc --noEmit` exit 0.
- `grep -c "extends CliError" packages/core/src/errors.ts` = 5.
- `grep -c "process.exit" cli/src/preflight.ts` = 1 (comment only, not a call).
- `grep -c "process.exit" cli/src/doctor.ts` = 0.
- pipeline.ts `process.exit` calls decreased from 2 → 1 (SIGINT handler preserved).
- doctor.ts throws `ConfigError`, not a generic `Error` (grep confirmed 0 generic Error throws).
- `cli/src/entry.ts` has `instanceof CliError` branch and `main().catch(handleCliError)`.
- `packages/mcp-server/src/server.ts` has `instanceof CliError` and `isError: true` envelope.

---
*Phase: 02-foundation-hardening*
*Plan: 01*
*Completed: 2026-04-15*
