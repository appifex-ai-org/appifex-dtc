---
phase: 2
slug: foundation-hardening
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-15
audited: 2026-04-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.0 |
| **Config file** | `vitest.config.ts` (root) — aliases `@appifex/*` → `packages/*/src/index.ts` |
| **Quick run command** | `pnpm vitest run <file>` |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Estimated runtime** | ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run <single target>` (per-task narrow; <3s unit, <10s integration)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** `pnpm check` (lint + format + typecheck + test) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-* | 01 | 1 | FOUND-01 | — | `bin/dtc --help` exits 0 from any clone | integration | `pnpm vitest run cli/__tests__/bin-dtc-launcher.test.ts` | ✅ | ✅ green |
| 02-02-* | 02 | 1 | FOUND-02a | — | Swift density cap uses CHARS_PER_TOKEN=3 | unit | `pnpm vitest run packages/analysis/__tests__/token-cap.test.ts` | ✅ extended | ✅ green |
| 02-02-* | 02 | 1 | FOUND-02b | — | `canEnterFixLoop()` false when remaining < 30% | unit | `pnpm vitest run packages/core/__tests__/token-budget.test.ts` | ✅ extended | ✅ green |
| 02-02-* | 02 | 1 | FOUND-02c | — | Fix loop short-circuits with `BudgetExhaustedError` | unit | `pnpm vitest run packages/fix/__tests__/fix-loop-budget-guard.test.ts` | ✅ | ✅ green |
| 02-03-* | 03 | 2 | FOUND-03a | — | EPIPE on pipeline.ts claude spawn → `EpipeError` | unit | `pnpm vitest run cli/__tests__/pipeline-epipe.test.ts` | ✅ | ✅ green |
| 02-03-* | 03 | 2 | FOUND-03b | — | EPIPE on claude-cli-generate stdin → `EpipeError` | unit | `pnpm vitest run packages/codegen/__tests__/claude-cli-epipe.test.ts` | ✅ | ✅ green |
| 02-03-* | 03 | 2 | FOUND-03c | — | EPIPE on claude-cli-fix stdin → `EpipeError` | unit | `pnpm vitest run packages/fix/__tests__/claude-cli-fix-epipe.test.ts` | ✅ | ✅ green |
| 02-03-* | 03 | 2 | FOUND-03d | — | EPIPE on agent/adapters/base stdin → `EpipeError` | unit | `pnpm vitest run packages/agent/__tests__/base-adapter-epipe.test.ts` | ✅ | ✅ green |
| 02-04-* | 04 | 1 | FOUND-04a | — | `runPreflight` failure throws `PreflightError` (no exit) | unit | `pnpm vitest run cli/__tests__/preflight.test.ts` | ✅ | ✅ green |
| 02-04-* | 04 | 3 | FOUND-04b | — | MCP tool returns `{isError:true}`; host stays alive | integration | `pnpm vitest run packages/mcp-server/__tests__/cli-error-translation.test.ts` | ✅ | ✅ green |
| 02-04-* | 04 | 3 | FOUND-04c | — | `entry.ts` translates `CliError` → chalk + exit code | unit | `pnpm vitest run cli/__tests__/entry-error-handling.test.ts` | ✅ | ✅ green |
| 02-05-* | 05 | 1 | FOUND-01 | — | `prepare` script guards against `core.hooksPath` + missing `.git` (cold-start install) | integration | `pnpm vitest run __tests__/prepare-hook.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files (must exist before task execution writes implementation):

- [x] `cli/__tests__/bin-dtc-launcher.test.ts` — spawn `bin/dtc --help`, assert exit 0
- [x] `packages/fix/__tests__/fix-loop-budget-guard.test.ts` — assert `BudgetExhaustedError` when budget < 30%
- [x] `cli/__tests__/pipeline-epipe.test.ts` — mock spawn stdin → `EPIPE` → assert `EpipeError`
- [x] `packages/codegen/__tests__/claude-cli-epipe.test.ts` — same mock pattern
- [x] `packages/fix/__tests__/claude-cli-fix-epipe.test.ts` — same mock pattern
- [x] `packages/agent/__tests__/base-adapter-epipe.test.ts` — same mock pattern
- [x] `cli/__tests__/preflight.test.ts` — assert `runPreflight` throws `PreflightError`
- [x] `packages/mcp-server/__tests__/cli-error-translation.test.ts` — assert tool error envelope + host alive
- [x] `cli/__tests__/entry-error-handling.test.ts` — assert top-level catch handles `CliError`
- [x] `__tests__/prepare-hook.test.ts` — Plan 05 gap closure: `prepare` script survives `core.hooksPath` + missing `.git`

Existing test files to extend:

- [x] `packages/analysis/__tests__/token-cap.test.ts` — add Swift-density case (CHARS_PER_TOKEN=3)
- [x] `packages/core/__tests__/token-budget.test.ts` — add `canEnterFixLoop()` cases (above/at/below threshold)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fresh-clone smoke: clone the repo to a different machine path, run `bin/dtc --help` without `pnpm install` | FOUND-01 | Hard to reproduce "different absolute path" automatically inside the same checkout; integration test approximates by running from `process.cwd()` but cannot prove cross-machine portability | `git clone <repo> /tmp/dtc-fresh && cd /tmp/dtc-fresh && ./bin/dtc --help && echo "exit=$?"` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-04-17

---

## Validation Audit 2026-04-17

Retroactive Nyquist audit of executed phase against VALIDATION.md contract.

| Metric | Count |
|--------|-------|
| Requirements audited | 12 |
| COVERED | 12 |
| PARTIAL | 0 |
| MISSING | 0 |
| Gaps found | 1 (map entry missing for Plan 05 / `__tests__/prepare-hook.test.ts`) |
| Resolved | 1 (row added to Per-Task Map) |
| Escalated | 0 |

**Result:** Nyquist-compliant. All 12 requirements have automated verification; full suite green (12 test files, 48 assertions) in 1.01s on 2026-04-17.

Commands run:
```
pnpm vitest run \
  cli/__tests__/bin-dtc-launcher.test.ts \
  packages/analysis/__tests__/token-cap.test.ts \
  packages/core/__tests__/token-budget.test.ts \
  packages/fix/__tests__/fix-loop-budget-guard.test.ts \
  cli/__tests__/pipeline-epipe.test.ts \
  packages/codegen/__tests__/claude-cli-epipe.test.ts \
  packages/fix/__tests__/claude-cli-fix-epipe.test.ts \
  packages/agent/__tests__/base-adapter-epipe.test.ts \
  cli/__tests__/preflight.test.ts \
  packages/mcp-server/__tests__/cli-error-translation.test.ts \
  cli/__tests__/entry-error-handling.test.ts \
  __tests__/prepare-hook.test.ts
# → Test Files 12 passed · Tests 48 passed · 1.01s
```
