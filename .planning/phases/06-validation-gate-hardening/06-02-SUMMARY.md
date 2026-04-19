---
phase: 06
plan: 2
subsystem: analysis
tags: [VAL-02, D-07, D-08, D-09, D-10, pure-function, fix-loop, ranker, barrel]
requires:
  - packages/core exports Platform, Runner, InventoryEntry, ModifiedScreens via types barrel
  - packages/validate exports ValidationResult
  - packages/analysis/src/nav-graph.ts exports NavGraphResult
  - packages/analysis/__tests__/fix-context-ranker.test.ts (Wave 0 RED tests from 06-00)
provides:
  - packages/analysis/src/fix-context-ranker.ts (pure async rankFixContext + 2 constants + 2 types)
  - @appifex/analysis barrel re-exports (rankFixContext, CHARS_PER_TOKEN, FIX_CONTEXT_BUDGET_RATIO, RankFixContextInput, RankFixContextResult)
affects:
  - Plan 06-05 can now import rankFixContext from @appifex/analysis to replace default-fix.ts:172-218 first-10-glob fallback (not wired in this plan)
tech-stack:
  added:
    - "@appifex/validate workspace dep in packages/analysis/package.json (type-only usage)"
  patterns:
    - "Pure async function with injected Runner (matches modified-screens.ts shape)"
    - "Set-based dedup that preserves insertion order (P1 > P2 > P3 ordering via insertion sequencing)"
    - "Bounded-class regex to avoid catastrophic backtracking"
key-files:
  created:
    - "packages/analysis/src/fix-context-ranker.ts (218 lines)"
  modified:
    - "packages/analysis/src/index.ts (3 lines appended — barrel re-exports)"
    - "packages/analysis/package.json (added @appifex/validate workspace dep)"
    - "pnpm-lock.yaml (workspace link regenerated)"
decisions:
  - "D-07 → priority order P1 (failing-test + semgrep + Maestro id) > P2 (modifiedScreens) > P3 (nav-graph 1-hop); first-seen wins on dedup"
  - "D-08 → N = floor(remainingTokens * 0.4 / avgFileTokens); 3 chars/token Swift density; one-file sample for avg; 5000-char fallback"
  - "D-09 → cold-start synthesizes screens from flowYaml tapOn/assertVisible ids (multi-line + inline forms) via prefix-capitalized inventory match"
  - "D-10 → pure function: no node:fs, no TokenBudget instance, no Anthropic imports; Runner injected; caller owns budget"
metrics:
  duration_minutes: 4
  completed: 2026-04-18
  tests_transitioned: 11
---

# Phase 6 Plan 2: Fix-Context Ranker Pure Function Summary

One-liner: `rankFixContext` lands as a pure async function in `@appifex/analysis` replacing the brute-force first-10-glob fallback with a deterministic P1/P2/P3 locality-ranked, budget-capped candidate list — ready for Plan 06-05 to consume from both `default-fix.ts` and `claude-cli-fix.ts`.

## Objective (restated)

Deliver the brainpower for VAL-02 without coupling to LLM mechanics. A self-contained pure function is unit-testable in isolation, reusable across both fix paths, and cheap to reason about (no side effects beyond one `runner.readFile` for token-size sampling).

## File Breakdown — packages/analysis/src/fix-context-ranker.ts (218 lines)

| Section | Lines (approx) | Contents |
|---|---|---|
| Module header JSDoc | 1-22 | Phase marker + pure-function contract + D-07/08/09/10 mapping |
| Imports | 23-25 | `import type` only (verbatimModuleSyntax) — `@appifex/core`, `@appifex/validate`, `./nav-graph.js` |
| Public constants | 27-33 | `CHARS_PER_TOKEN = 3`, `FIX_CONTEXT_BUDGET_RATIO = 0.4` |
| Internal constant | 35 | `SAMPLE_FALLBACK_CHARS = 5000` |
| Public types | 37-57 | `RankFixContextInput`, `RankFixContextResult` |
| `rankFixContext` async function | 59-142 | P1 → cold-start synthesis → P2 → P3 → budget cap → return |
| `resolveIdToScreenFile` helper | 148-157 | D-09 prefix-capitalized inventory match |
| `extractFlowIds` helper | 160-169 | Multi-line + inline Maestro YAML regex |
| `neighborScreenFiles` helper | 172-196 | Bidirectional nav-graph 1-hop expansion |
| `estimateAvgFileTokens` helper | 199-217 | Runner-sampled first-candidate token estimate + fallback |

## Decision Mapping

| Decision | Where | How |
|---|---|---|
| **D-07** priority ordering | `rankFixContext` body, P1 → P2 → P3 sequential `Set.add` | `Set<string>` preserves first-insertion order; parsing failing-test paths first means they land in the earliest slots. Same file appearing in P2 or P3 is silently skipped by the Set and retains its P1 slot. |
| **D-08** budget cap | `rankFixContext` budget-cap block | `maxFiles = floor((remainingTokens * 0.4) / avg)`; `Number.isFinite(remainingTokens)` check disables the cap when `Infinity` is passed; `Math.max(0, ...)` guarantees `N ≥ 0`; `Math.min(maxFiles, candidates.length)` guarantees `N ≤ candidates`. Test 7 (N=1) and Test 8 (N=0) cover both bounds. |
| **D-09** cold-start | `coldStart` check + `extractFlowIds` + `resolveIdToScreenFile` | When `modifiedScreens.added.length === 0 && modifiedScreens.modified.length === 0 && flowYaml` is truthy, ids from the flow YAML get mapped to inventory screen files and fed into the P2 tier (synthesized, not stored on the input). Test 6 exercises the signup+home id pair. |
| **D-10** pure Runner-injected | Whole file | Zero `node:fs` imports; `runner.readFile` is the only side-effecting call; caller passes `remainingTokens` as a number; no TokenBudget instance entered the module surface. |

## Wave 0 Test Transition

All 11 tests in `packages/analysis/__tests__/fix-context-ranker.test.ts` transitioned RED → GREEN:

| # | Test | Covers |
|---|---|---|
| 1 | P1 — parses failing-test paths from unit errors | `/(?:Sources|src)\/[^\s:)'"]+/g` regex |
| 2 | P1 — maps semgrep findings to file paths | `failures.security.findings[].file` |
| 3 | P1 — maps Maestro accessibility ids to screen files via inventory | `/id:\s*([A-Za-z_]\w+)/g` + `resolveIdToScreenFile` |
| 4 | P2 — modifiedScreens names resolved to paths via inventory | `inventory.filter(e => e.name === name)` |
| 5 | P3 — nav-graph 1-hop sibling expansion | `neighborScreenFiles` direction (a) |
| 6 | D-09 cold-start — parses ids from flowYaml when modifiedScreens empty | Multi-line regex + prefix capitalization |
| 7 | D-08 budget cap — N = floor(remaining * 0.4 / avgFileTokens) | `floor(3000 * 0.4 / 1000) = 1` |
| 8 | D-08 N=0 edge — empty array when budget exhausted | `floor(100 * 0.4 / 1000) = 0`, returns `files: []` |
| 9 | dedup across tiers — highest-priority slot wins, file appears once | Set-based dedup |
| 10 | empty inputs — no crash, returns `[]` | Defensive defaults + `?? []` on security findings |
| 11 | priority ordering — P1 files precede P2 files | Insertion-order preservation |

Regression check: full `pnpm vitest run packages/analysis` suite passes (8 files / 72 tests, including the 11 new ranker tests).

## Security / Threat Mitigation

| Threat ID | Mitigation in-code |
|---|---|
| T-6-02-a (traversal via `id: "../../../etc/passwd"`) | `extractFlowIds` regex uses `[A-Za-z_]\w+` bounded class — `.`, `/`, `\` cannot appear in captured id. `resolveIdToScreenFile` only returns paths present in trusted `inventory`. |
| T-6-02-b (reading attacker-controlled file) | Single `runner.readFile` call on `candidates[0]`, which came from pipeline-trusted sources. Failure swallowed → fallback constant. No data flow from content to writes. |
| T-6-02-c (regex DoS) | All regexes use bounded character classes (`\w+`, `[^\s:)'"]+`); no catastrophic-backtracking alternation; worst-case O(n). |
| T-6-02-d (scope broadening) | Ranker NARROWS scope (D-07 deletes the first-10-glob fallback). All candidates come from `inventory` (scanner-scoped) or failure-parsed paths. |

## Confirmations

- **`extractFlowIds` handles both multi-line and inline Maestro YAML forms.** Two regexes: multi-line `(?:tapOn|assertVisible):\s*\n\s*id:\s*"?([A-Za-z_]\w+)"?` (matched Test 6) and inline `(?:tapOn|assertVisible):\s*\{\s*id:\s*"?([A-Za-z_]\w+)"?` (belt-and-suspenders for `- tapOn: { id: "foo" }` variant not currently in Wave 0 tests).
- **No direct `node:fs` imports** (`grep -q "from 'node:fs'"` returns no match).
- **No `export default`** — named exports only, per CLAUDE.md module convention.
- **ESM + Node16 compliant** — all relative imports carry `.js` extension; all type imports use `import type`.

## Deviations from Plan

**1. [Rule 3 - blocking] `@appifex/analysis` package.json missing `@appifex/validate` workspace dep**
- **Found during:** Task 1 implementation (before first test run)
- **Issue:** The ranker requires `import type { ValidationResult } from '@appifex/validate'` per the plan, but `packages/analysis/package.json` only declared `@appifex/core` and `@appifex/runner` as deps. Without the workspace dep, Node16 module resolution rejects the import (type-only but still loaded by `tsc`).
- **Fix:** Added `"@appifex/validate": "workspace:*"` to `dependencies` and re-ran `pnpm install`. No circular dependency introduced (`@appifex/validate` does not depend on `@appifex/analysis`).
- **Files modified:** `packages/analysis/package.json`, `pnpm-lock.yaml`
- **Commit:** d31ed7f

**2. [Rule 3 - documentation] Plan referenced `pnpm --filter @appifex/analysis run lint` / `pnpm --filter @appifex/analysis test run` commands**
- **Found during:** Task 1 verification
- **Issue:** The `@appifex/analysis` package has no `lint` or `test` script in its `package.json` — only `build` and `clean`. The repo lints via root `pnpm lint` (eslint at monorepo root) and tests via root `pnpm vitest run <path>`.
- **Fix:** Ran `pnpm vitest run packages/analysis/__tests__/fix-context-ranker.test.ts` directly for verification (the canonical way to scope a vitest run in this monorepo). Did NOT modify the package.json to add scripts (out of scope for this plan).
- **Files modified:** None
- **Commit:** N/A (process-level deviation, not code)

**3. [Rule 1 - behavior] Removed `--bail` flag from the verification command**
- **Found during:** Final verification
- **Issue:** Vitest 4.1.4 (installed via pnpm) requires `--bail <number>` with an explicit integer; the plan's bare `--bail` errors with `CACError: option --bail <number> value is missing`.
- **Fix:** Ran verification without `--bail` — all 11 tests pass anyway, so early-exit semantics are moot.
- **Files modified:** None
- **Commit:** N/A

No auth gates occurred. No architectural (Rule 4) decisions triggered.

## Known Stubs

None. The ranker is fully wired to real types and real logic; it is unconsumed only because Plan 06-05 owns the integration into `default-fix.ts` + `claude-cli-fix.ts`.

## Deferred Issues

None.

## Commits

- `d31ed7f` — `feat(06-02): add rankFixContext pure function (VAL-02 D-07/D-08/D-09/D-10)`
- `26fde30` — `feat(06-02): re-export rankFixContext from @appifex/analysis barrel`

## Self-Check: PASSED

- `packages/analysis/src/fix-context-ranker.ts` exists (218 lines).
- `packages/analysis/src/index.ts` barrel entries for `rankFixContext`, `CHARS_PER_TOKEN`, `FIX_CONTEXT_BUDGET_RATIO`, `RankFixContextInput`, `RankFixContextResult` verified via `grep -c`.
- Commit `d31ed7f` exists in `git log --oneline --all` (Task 1).
- Commit `26fde30` exists in `git log --oneline --all` (Task 2).
- 11/11 Wave 0 ranker tests GREEN; 72/72 analysis suite regression-clean.
