---
phase: 02-foundation-hardening
verified: 2026-04-18T22:46:39Z
status: passed
score: 4/4 requirements verified in code
overrides_applied: 0
---

# Phase 2: Foundation Hardening Verification Report

**Phase Goal:** Harden the CLI binary launcher, token budget enforcement, EPIPE error propagation, and subprocess isolation so a crashed pipeline never kills the MCP host.
**Verified:** 2026-04-18T22:46:39Z
**Status:** passed

## Goal Achievement

### Requirements Coverage

| # | REQ-ID | Description | Status | Evidence |
|---|--------|-------------|--------|----------|
| 1 | FOUND-01 | `bin/dtc` portable launcher — works from any clone, not tied to original dev machine | PASS | `cli/__tests__/bin-dtc-launcher.test.ts` (2 assertions: is regular file, not symlink; spawns bin/dtc --help exits 0 with "dtc" in stdout) + `__tests__/prepare-hook.test.ts` (3 assertions: exits 0 with core.hooksPath set, exits 0 with no .git, script contains `lefthook install --force`). Total: 5 assertions, all green. Commits: `a6faded` (test RED), `c344c2b` (fix GREEN) for bin/dtc replacement; `54cc584` (test RED), `7933531` (fix GREEN) for prepare guard. Structural check: `test ! -L bin/dtc && test -f bin/dtc` → IS_REGULAR_FILE: yes. Content: `#!/usr/bin/env node\nimport('../cli/dist/entry.js')`. |
| 2 | FOUND-02 | Token estimator Swift density (CHARS_PER_TOKEN=3) + fix-loop 30% reserve guard | PASS | `packages/analysis/__tests__/token-cap.test.ts` (5 assertions: includes case "uses Swift chars-per-token density of 3 (8k-token cap → 24_000 chars, not 32_000)") + `packages/core/__tests__/token-budget.test.ts` (18 assertions: includes 4 canEnterFixLoop threshold cases — true at 1.0, true at exactly 0.30, false at 0.299, false at 0.0) + `packages/fix/__tests__/fix-loop-budget-guard.test.ts` (3 assertions: BudgetExhaustedError thrown before any fixFn call, carries correct totalBudget/remaining/requiredRatio=0.3, back-compat when budgetInstance omitted). Total: 26 assertions, all green. Commits: `aa237f8` (test RED), `34d4631` (fix GREEN), `182d8ce` (feat GREEN guard). Structural check: `grep 'CHARS_PER_TOKEN' packages/analysis/src/token-cap.ts` → `const CHARS_PER_TOKEN = 3`; `grep 'CHARS_PER_TOKEN' packages/analysis/src/modification-planner.ts` → `const CHARS_PER_TOKEN = 3`. |
| 3 | FOUND-03 | Pipeline hard-fails on EPIPE — typed EpipeError at all 4 LLM CLI spawn sites | PASS | `cli/__tests__/pipeline-epipe.test.ts` (1 assertion: runClaudePrint rejects with EpipeError when stdin emits EPIPE) + `packages/codegen/__tests__/claude-cli-epipe.test.ts` (2 assertions: ClaudeCliResult.error starts with "EpipeError:", exports EpipeError as CliError subclass) + `packages/fix/__tests__/claude-cli-fix-epipe.test.ts` (2 assertions: fixFn rejects with EpipeError-prefixed error, exports EpipeError smoke) + `packages/agent/__tests__/base-adapter-epipe.test.ts` (2 assertions: AgentResult.error has EpipeError: prefix, exports EpipeError smoke). Total: 7 assertions, all green. Commits: `4309186` (test RED), `4d1108c` (fix GREEN). Structural check: `grep -l 'EpipeError' cli/src/pipeline.ts packages/codegen/src/claude-cli-generate.ts packages/fix/src/claude-cli-fix.ts packages/agent/src/adapters/base.ts` → 4 files; `/* swallow EPIPE */` removed from pipeline.ts. |
| 4 | FOUND-04 | Subprocess boundary — process.exit cannot kill MCP host; typed CliError hierarchy | PASS | `cli/__tests__/preflight.test.ts` (9 assertions — includes "throws PreflightError instead of calling process.exit", "returns normally (no throw) when no critical failures", "PreflightError exposes exitCode 1 and inherits from CliError") + `packages/mcp-server/__tests__/cli-error-translation.test.ts` (5 assertions: wrapToolHandler returns {isError:true} on CliError, passes through success, re-throws non-CliError, handles CliError base class, createDtcMcpServer host stays alive) + `cli/__tests__/entry-error-handling.test.ts` (4 assertions: exits with err.exitCode on CliError, respects custom exitCode, exits 1 on generic Error, ConfigError flows correctly). Total: 18 assertions, all green. Commits: `bec8d15` (test RED), `565021a` (feat CliError hierarchy), `ae05ed6` (refactor preflight/pipeline/doctor), `54387dd` (feat entry + MCP wrapper). Structural check: `grep -c 'wrapToolHandler' packages/mcp-server/src/server.ts` → 2 matches; `packages/core/src/errors.ts` exports CliError base + 5 subclasses (PreflightError, ConfigError, ResumeAbortError, BudgetExhaustedError, EpipeError). |

**Score: 4/4 requirements PASS at the code level. All requirements fully automated; no human steps outstanding.**

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/core/src/errors.ts` | VERIFIED | CliError base + 5 subclasses: PreflightError, ConfigError, ResumeAbortError, BudgetExhaustedError, EpipeError. Each carries domain context (check, configKey, totalBudget, site, payloadBytes) and exitCode. |
| `packages/analysis/src/token-cap.ts` | VERIFIED | `CHARS_PER_TOKEN = 3` (was 4). Swift averages ~3 chars/token. Anchored with Phase 02 Plan 02 (FOUND-02) comment. |
| `packages/analysis/src/modification-planner.ts` | VERIFIED | `CHARS_PER_TOKEN = 3` flipped; MODIFICATION_TOKEN_CAP comment updated to ~24k chars (8000 × 3). |
| `packages/core/src/token-budget.ts` | VERIFIED | `FIX_LOOP_MIN_RESERVE_RATIO = 0.3` exported constant; public `get total(): number` getter; `canEnterFixLoop(): boolean` method; private field renamed `#total`. |
| `packages/fix/src/fix-loop.ts` | VERIFIED | `FixLoopOpts.budgetInstance?: TokenBudget` additive field; top-of-function guard throws `BudgetExhaustedError` before any LLM call when `!canEnterFixLoop()`. |
| `bin/dtc` | VERIFIED | Regular executable file (not symlink). Content: `#!/usr/bin/env node\nimport('../cli/dist/entry.js')`. Relative import resolves from `bin/` to repo-root `cli/dist/entry.js`. |
| `package.json` (root) | VERIFIED | `"prepare": "test -d .git && lefthook install --force || true"` — guarded against core.hooksPath + missing .git. |
| `cli/src/preflight.ts` | VERIFIED | Throws `PreflightError` (captures first failing check name) instead of `process.exit(1)`. |
| `cli/src/pipeline.ts` | VERIFIED | `runClaudePrint` extracted as exported helper; stdin EPIPE handler rejects with `EpipeError`; `/* swallow EPIPE */` removed. ResumeAbortError re-export from @appifex/core unified. |
| `cli/src/entry.ts` | VERIFIED | `handleCliError(err: unknown): never` exported; `main().catch(handleCliError)` wired at bottom — sole process.exit for CliError flow. |
| `packages/mcp-server/src/server.ts` | VERIFIED | `wrapToolHandler()` exported + `patchServerForCliErrorTranslation()` applied at construction — all registered handlers wrapped transparently. CliError → `{isError:true}` envelope. |
| `packages/codegen/src/claude-cli-generate.ts` | VERIFIED | EPIPE surfaces as `EpipeError:`-prefixed error in ClaudeCliResult.error; `settle()` guards prevent double-resolve. |
| `packages/fix/src/claude-cli-fix.ts` | VERIFIED | EPIPE surfaces as `EpipeError:`-prefixed error in inner envelope; outer function throws it; `settle()` guards added. |
| `packages/agent/src/adapters/base.ts` | VERIFIED | EPIPE settles `AgentResult` with `EpipeError:`-prefixed error, `stopReason: 'error'`, `exitCode: 1`. |
| `cli/__tests__/bin-dtc-launcher.test.ts` | VERIFIED | 2 assertions: is regular file (not symlink); exits 0 on --help with "dtc" in stdout. |
| `__tests__/prepare-hook.test.ts` | VERIFIED | 3 assertions: prepare exits 0 with core.hooksPath set, exits 0 with no .git, script contains `lefthook install --force`. |
| `packages/analysis/__tests__/token-cap.test.ts` | VERIFIED | Extended with Swift-density case (CHARS_PER_TOKEN=3). |
| `packages/core/__tests__/token-budget.test.ts` | VERIFIED | Extended with public get total() test + 4 canEnterFixLoop threshold cases. |
| `packages/fix/__tests__/fix-loop-budget-guard.test.ts` | VERIFIED | New. 3 cases: BudgetExhaustedError thrown + fixFn never called, error carries correct ratios, back-compat with no budgetInstance. |
| `cli/__tests__/pipeline-epipe.test.ts` | VERIFIED | 1 assertion: runClaudePrint rejects with EpipeError (instanceof CliError, site/payloadBytes populated). |
| `packages/codegen/__tests__/claude-cli-epipe.test.ts` | VERIFIED | 2 assertions: ClaudeCliResult.error starts with "EpipeError:", is CliError subclass. |
| `packages/fix/__tests__/claude-cli-fix-epipe.test.ts` | VERIFIED | 2 assertions: fixFn rejects with EpipeError prefix, EpipeError exported from @appifex/core. |
| `packages/agent/__tests__/base-adapter-epipe.test.ts` | VERIFIED | 2 assertions: AgentResult.error has EpipeError: prefix, EpipeError exported. |
| `cli/__tests__/preflight.test.ts` | VERIFIED | 9 assertions: throws PreflightError (no exit), returns normally on success, exitCode=1, CliError inheritance, never calls process.exit, plus Phase 3 additions. |
| `packages/mcp-server/__tests__/cli-error-translation.test.ts` | VERIFIED | 5 assertions: {isError:true} envelope, pass-through success, re-throws non-CliError, CliError base, host stays alive. |
| `cli/__tests__/entry-error-handling.test.ts` | VERIFIED | 4 assertions: exits with exitCode, respects custom exitCode, exits 1 on generic Error, ConfigError flows. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (live run) | `pnpm test` | 175 files passed / 1612 tests passed / 8 skipped / 20.81s | PASS |
| Phase 2 targeted tests | `pnpm vitest run cli/__tests__/bin-dtc-launcher.test.ts packages/analysis/__tests__/token-cap.test.ts packages/core/__tests__/token-budget.test.ts packages/fix/__tests__/fix-loop-budget-guard.test.ts cli/__tests__/pipeline-epipe.test.ts packages/codegen/__tests__/claude-cli-epipe.test.ts packages/fix/__tests__/claude-cli-fix-epipe.test.ts packages/agent/__tests__/base-adapter-epipe.test.ts cli/__tests__/preflight.test.ts packages/mcp-server/__tests__/cli-error-translation.test.ts cli/__tests__/entry-error-handling.test.ts __tests__/prepare-hook.test.ts` | 12 files passed / 56 tests passed / 1.05s | PASS |
| bin/dtc is a portable shim (not symlink) | `test ! -L bin/dtc && test -f bin/dtc && echo IS_REGULAR_FILE: yes` | IS_REGULAR_FILE: yes; content is `#!/usr/bin/env node\nimport('../cli/dist/entry.js')` | PASS |
| bin/dtc exits 0 | `./bin/dtc --help` | exits 0, prints "dtc — Design-to-Code Toolkit v0.1.0" | PASS |
| CHARS_PER_TOKEN = 3 in both analysis sites | `grep 'CHARS_PER_TOKEN' packages/analysis/src/token-cap.ts packages/analysis/src/modification-planner.ts` | `const CHARS_PER_TOKEN = 3` in both files | PASS |
| EpipeError at exactly 4 spawn sites | `grep -l 'EpipeError' cli/src/pipeline.ts packages/codegen/src/claude-cli-generate.ts packages/fix/src/claude-cli-fix.ts packages/agent/src/adapters/base.ts` | 4 files listed | PASS |
| wrapToolHandler in MCP server | `grep -c 'wrapToolHandler' packages/mcp-server/src/server.ts` | 2 matches | PASS |
| Silent EPIPE swallow removed | `grep 'swallow EPIPE' cli/src/pipeline.ts` | 0 matches | PASS |
| Prepare guard present | `grep 'prepare' package.json` | `"prepare": "test -d .git && lefthook install --force \|\| true"` | PASS |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `cli/__tests__/preflight.test.ts` | Phase 3 additions expanded test count from original 3 assertions to 9 — assertion count in evidence table reflects live count | Info | Evidence table in this VERIFICATION.md cites 9 assertions (Phase 2 + Phase 3 additions); the original Phase 2 plan documented 3. Both counts are correct for their respective snapshots. |
| `packages/core/__tests__/token-budget.test.ts` | Phase 7 (OBS-01 D-14) additions expanded from 9 assertions to 18 — live count used throughout | Info | Phase 7 added `consumeBreakdown`, `phaseBreakdown`, `phaseCostUsd`, `totalCostUsd` tests to the file. The 18 live assertions include all Phase 2 FOUND-02 cases (public get total() + 4 canEnterFixLoop threshold cases) verified green. |
| `packages/agent/src/adapters/base.ts` | `claude-cli-fix.ts` was the original file path; actual file is `packages/fix/src/claude-cli-fix.ts` | Info | No impact — correct path used throughout this document. |

### Gaps Summary

**Zero code-level gaps remain. All 4 requirements are satisfied in the repository.**

All 12 Phase 2 test files pass green. Structural checks confirm the key invariants: EpipeError at 4 source files, CHARS_PER_TOKEN=3 at both analysis sites, wrapToolHandler in mcp-server, bin/dtc is a portable shim. UAT (02-UAT.md): status `complete`, 6/6 tests passed, 0 pending.

### Verdict

**GOAL_ACHIEVED** — the repository contains every artifact, wiring, and test required by the phase goal.

Status is `passed`.

---

_Verified: 2026-04-18T22:46:39Z_
_Verifier: Claude (gsd-verifier)_
