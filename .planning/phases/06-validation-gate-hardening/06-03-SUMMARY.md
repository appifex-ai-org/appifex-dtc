---
phase: 06-validation-gate-hardening
plan: 3
subsystem: testing

tags: [semgrep, security, validation-gate, hard-fail, guard-removal]

# Dependency graph
requires:
  - phase: 06-validation-gate-hardening
    provides: Wave 0 RED test (validate-all-semgrep-unconditional.test.ts) from Plan 06-00 commit 564dd92
provides:
  - Unconditional semgrep invocation in `validateAll` when `opts.runSecurity === true`
  - D-18 guard removal at `packages/validate/src/validate-all.ts:62` (now line 64)
affects:
  - 06-07 (pipeline rewire: second call-site `cli/src/pipeline.ts:3433` still needs same D-18 treatment)
  - 05-xcode-archive-testflight-upload (hard-fail semgrep now blocks archive/upload independently of Maestro/unit flakes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 6 (VAL-04 D-18) comment convention — anchors non-obvious guard change to .planning/phases/06"
    - "Hard-fail gate orthogonality: semgrep no longer transitively skipped by soft-fail state"

key-files:
  created: []
  modified:
    - packages/validate/src/validate-all.ts

key-decisions:
  - "Kept `baseTestsPassed` declaration (line 59) — still consumed by `allPassed` computation at line 93. Removing it would have broken the return value."
  - "Did NOT touch `packages/validate/src/semgrep.ts` or `runSemgrep` itself — D-15 explicitly reuses this module as-is."
  - "Did NOT touch the second call-site at `cli/src/pipeline.ts:3433` — Plan 06-07 explicitly owns that site per this plan's objective."

patterns-established:
  - "Guard removal pattern: drop the conjunction (`&& baseTestsPassed`), keep the declaration if downstream references exist, add a Phase-N comment that names the decision ID (D-18) and the specific hole being closed."

requirements-completed: [VAL-04]

# Metrics
duration: ~10min
completed: 2026-04-18
---

# Phase 06 Plan 03: Unconditional Semgrep Summary

**D-18 guard removal: `validate-all.ts` now runs `runSemgrep` whenever `opts.runSecurity === true`, closing the hole where a Maestro or unit-test flake silently skipped the security scan.**

## Performance

- **Duration:** ~10 min (including `pnpm install`, dependency builds, and verification)
- **Started:** 2026-04-18T05:29Z (approx.)
- **Completed:** 2026-04-18T05:39Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed the `&& baseTestsPassed` conjunction from the semgrep guard at `packages/validate/src/validate-all.ts:62`.
- Added a two-line Phase 6 (VAL-04 D-18) comment documenting the rationale directly above the new guard.
- Preserved `baseTestsPassed` declaration and its downstream use in the `allPassed` computation.
- Wave 0 test suite `validate-all-semgrep-unconditional.test.ts` transitioned RED → GREEN (3/3 passing).
- No regression in the 27 existing `@appifex/validate` tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove baseTestsPassed guard on semgrep invocation in validate-all.ts** — `cab7045` (refactor)

_Single-task plan; no TDD RED/GREEN split needed because the RED test already existed from Plan 06-00._

## Files Created/Modified

- `packages/validate/src/validate-all.ts` — One-line guard change + two-line comment. Before/after diff:

  **Before:**
  ```ts
  const baseTestsPassed = ui.failed === 0 && unit.failed === 0

  let security: SemgrepResult | undefined
  if (opts.runSecurity && baseTestsPassed) {
    security = await runSemgrep(runner, { projectDir: opts.projectDir, platform: opts.platform })
  }
  ```

  **After:**
  ```ts
  const baseTestsPassed = ui.failed === 0 && unit.failed === 0

  // Phase 6 (VAL-04 D-18): semgrep runs unconditionally when runSecurity is enabled.
  // Removes the baseTestsPassed hole where a Maestro flake silently skipped the security scan.
  let security: SemgrepResult | undefined
  if (opts.runSecurity) {
    security = await runSemgrep(runner, { projectDir: opts.projectDir, platform: opts.platform })
  }
  ```

## Decisions Made

- **Kept `baseTestsPassed` declaration.** The plan's safety check (Task 1 `<action>` step) required verifying downstream consumers. Grep showed 3 references: line 59 (declaration), line 62 (the removed conjunction), and **line 91** inside the `allPassed` return value. Because line 91 still reads it, the declaration is live and MUST stay.
- **Did NOT modify the second call-site at `cli/src/pipeline.ts:3433`.** Plan 06-03's objective explicitly scopes that site to Plan 06-07 ("the secondary call site in `cli/src/pipeline.ts:3433` is addressed in Plan 06-07 where the pipeline rewire happens anyway"). Touching it now would race with the sibling 06-07 executor and create a merge conflict in the parallel wave.

## Deviations from Plan

None — plan executed exactly as written.

The plan's conditional instruction ("if `baseTestsPassed` has no other consumer, ALSO remove the declaration") required a branch decision, and the grep check determined the declaration had a live consumer. The plan anticipated and documented both branches; choosing the "keep declaration" branch is following the plan, not deviating from it.

## Issues Encountered

- **Worktree base drift:** The worktree initially pointed at `eec5bc03` (an old commit lacking the Wave 0 test files from Plan 06-00). Per the `<worktree_branch_check>` directive, executed `git reset --hard c80f22bf70591d66323047d7f33a017233cefb60` to align with the expected base. Post-reset, HEAD matched the expected hash and all Wave 0 test files (including `validate-all-semgrep-unconditional.test.ts`) were present. No planning data was at risk because the reset was pure rewind-to-baseline.
- **`--bail` syntax change in vitest 4:** Initial verification command `--bail` required a value (`--bail=1`) under vitest 4.1.4. Not a blocker — re-ran without `--bail` for full test counts.

## Verification Evidence

- `pnpm vitest run packages/validate/__tests__/validate-all-semgrep-unconditional.test.ts` — **3/3 GREEN** (Tests 1 & 2 transitioned RED → GREEN; Test 3 stayed GREEN as regression guard).
- `pnpm vitest run packages/validate/` — 27 existing tests pass; only `e2e-gate.test.ts` remains RED (pre-existing Plan 06-00 stub for Plan 06-06's NEW `e2e-gate.ts` module, unrelated to this plan's change).
- `grep -q "if (opts.runSecurity)" packages/validate/src/validate-all.ts` — PASS (match at line 64).
- `! grep -qE "opts\.runSecurity\s*&&\s*baseTestsPassed" packages/validate/src/validate-all.ts` — PASS (no matches; combined guard gone).
- `grep -q "// Phase 6 (VAL-04 D-18)" packages/validate/src/validate-all.ts` — PASS (match at line 61).
- `cd packages/validate && pnpm exec tsc --noEmit` (after building `@appifex/core`, `@appifex/runner`, `@appifex/baas-check`, `@appifex/mock-check`, `@appifex/mock`, `@appifex/provision`, `@appifex/build`) — PASS (no type errors reported).

## Threat Flags

None. The only surface change is REMOVING a soft-fail-shadowed skip of the security scan — strictly increases security coverage; introduces no new trust boundary.

## Next Phase / Plan Readiness

- **For Plan 06-07:** The second D-18 site at `cli/src/pipeline.ts:3433` (`if (testsResolved)`) still gates semgrep. 06-07 must remove this guard as part of the pipeline rewire. The pattern used here (keep variable, drop conjunction, add Phase-6 comment) is the template.
- **For Plan 06-05 (skip-validation-gate):** Any new `--skip-validation-gate` plumbing MUST NOT reintroduce a gate on semgrep — semgrep is hard-fail per D-15.
- **No blockers** for downstream plans.

## Self-Check: PASSED

Claims verified:

- `packages/validate/src/validate-all.ts` exists and contains the edit — FOUND (line 61 comment, line 64 guard).
- Task 1 commit `cab7045` — FOUND in `git log` (`refactor(06-03): remove baseTestsPassed guard on semgrep (VAL-04 D-18)`).
- Wave 0 test file `packages/validate/__tests__/validate-all-semgrep-unconditional.test.ts` — FOUND (from Plan 06-00 commit 564dd92).
- All 3 Wave 0 tests GREEN — CONFIRMED via vitest output.
- No existing `@appifex/validate` tests regressed — CONFIRMED (27 passed; `e2e-gate.test.ts` failure is pre-existing and owned by Plan 06-06).

---
*Phase: 06-validation-gate-hardening*
*Completed: 2026-04-18*
