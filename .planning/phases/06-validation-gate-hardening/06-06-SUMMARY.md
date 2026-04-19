---
phase: 06-validation-gate-hardening
plan: 06
subsystem: testing
tags: [maestro, e2e, firebase, validation, swift, ios-simulator, vitest]

# Dependency graph
requires:
  - phase: 06-validation-gate-hardening
    provides: "E2eGateError class + e2e_gate PhaseId + Wave-0 RED tests (Plan 06-01, 06-00)"
  - phase: 06-validation-gate-hardening
    provides: "signIn_existingAccount a11y id in login/signup templates (Plan 06-04)"
provides:
  - "runE2eGatePhase: standalone phase handler writing golden-path Maestro YAML + delegating to runMaestro + throwing E2eGateError on failure"
  - "E2eGatePhaseOpts interface (runner, projectDir, platform, appId?, reportDir)"
  - "Golden-path Maestro flow YAML template (signup OR signIn fall-through -> Firestore write -> Firestore read round-trip)"
  - "@appifex/validate barrel re-exports runE2eGatePhase + E2eGatePhaseOpts"
affects: [06-07 pipeline-wiring, cli/src/pipeline.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase-handler module pattern (mirrors xcode-archive-phase.ts): thin orchestrator that writes inputs, delegates to existing helper, throws typed CliError on failure"
    - "Runner-injected I/O only (no node:fs)"
    - "Single-file Maestro flow with runFlow when:visible for conditional signup-or-signin fallback"

key-files:
  created:
    - "packages/validate/src/e2e-gate.ts"
  modified:
    - "packages/validate/src/index.ts"

key-decisions:
  - "D-04 applied: single-file self-contained flow (no firebase-admin seeding, no preloaded test user)"
  - "D-05 applied: runFlow when:{visible:{id:signIn_existingAccount}} for rerun fall-through (not assertVisibleText)"
  - "D-06 applied: reuse existing runMaestro as-is; no fork, no parallel runner"
  - "Timeout budget: 240_000ms phase cap; 15000ms home_root wait; 20000ms Firestore round-trip (cold-simulator + first-sync tolerance per 06-RESEARCH Pitfall 2)"
  - "Flow isolation: .maestro/e2e/ subdirectory (separates golden-path from test_gen mock flows under .maestro/ root)"

patterns-established:
  - "Phase-handler: module exports runXPhase(opts) -> Result; throws XError on failure; reuses existing domain helpers"
  - "Golden-path YAML template as template literal (no eta, no file I/O for template read) — hardcoded with \\${APP_ID} interpolated at Maestro runtime via -e"

requirements-completed: [VAL-01]

# Metrics
duration: ~15min
completed: 2026-04-18
---

# Phase 06 Plan 06: e2e_gate Phase Handler Summary

**Standalone runE2eGatePhase handler writing a self-contained Maestro golden-path YAML that exercises signup-or-signin-fallback then Firestore round-trip, reusing runMaestro and throwing E2eGateError on failure**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-18T05:50Z (approximate — after worktree base reset)
- **Completed:** 2026-04-18T05:54Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `runE2eGatePhase(opts) -> Promise<MaestroResult>` implemented in `packages/validate/src/e2e-gate.ts` (~140 lines)
- Golden-path Maestro YAML template covers D-04 contract: signup fill/submit -> signIn_existingAccount runFlow when:visible fall-through -> home_root wait -> Firestore write -> Firestore read-back
- E2eGateError thrown with flowFile + maestroError fields on `result.failed > 0`
- Barrel re-export wired through `@appifex/validate` so Plan 06-07 can consume via `import { runE2eGatePhase } from '@appifex/validate'`
- Wave-0 RED test `packages/validate/__tests__/e2e-gate.test.ts` → GREEN (5/5)
- Full `packages/validate` test suite passes (32/32) — no regressions
- `tsc --noEmit` clean on @appifex/validate

## Task Commits

1. **Task 1: Create packages/validate/src/e2e-gate.ts** — `1afce48` (feat)
2. **Task 2: Re-export runE2eGatePhase from @appifex/validate barrel** — `61578c4` (feat)

## Files Created/Modified

- `packages/validate/src/e2e-gate.ts` (CREATED) — runE2eGatePhase handler, E2eGatePhaseOpts interface, buildGoldenPathYaml() helper
- `packages/validate/src/index.ts` (MODIFIED) — appended barrel re-export for runE2eGatePhase + E2eGatePhaseOpts

## Module API Surface

```typescript
export interface E2eGatePhaseOpts {
  runner: Runner
  projectDir: string
  platform: Platform
  /** Bundle ID for the generated app (e.g. 'com.example.App'). Passed to Maestro as APP_ID. */
  appId?: string
  /** Destination for Maestro's JUnit / hierarchy output. */
  reportDir: string
}

export async function runE2eGatePhase(opts: E2eGatePhaseOpts): Promise<MaestroResult>
```

Behavior:
1. Build flow YAML via `buildGoldenPathYaml()` (static template literal).
2. Write to `${projectDir}/.maestro/e2e/e2e-gate.yaml` via `opts.runner.writeFile`.
3. `runMaestro(runner, { projectDir, flowDir: ${projectDir}/.maestro/e2e, reportDir, platform, appId, timeoutMs: 240_000 })`.
4. If `result.failed > 0`: throw `new E2eGateError(message, flowFile, firstFailingResult.error)`.
5. Otherwise return `result` unchanged.

## Golden-Path YAML (audit reference)

```yaml
# Phase 6 (VAL-01): real-Firebase e2e gate. Drives the generated SwiftUI + Firebase app
# through sign-up (first run) OR sign-in-instead (rerun) -> Firestore write -> Firestore read.
# Self-contained: no preloaded test user, no firebase-admin seeding.
appId: ${APP_ID}
env:
  EMAIL: "dtc-gate-test@appifex.dev"
  PASSWORD: "DtcGate!2026"
  DOC_TEXT: "Hello from dtc gate"
---

# Step 1 - Navigate from LoginView to SignupView.
- tapOn: { id: "signUp_navigate" }
- assertVisible: { id: "signup_email" }

# Step 2 - Fill + submit signup form (first-run path).
- tapOn: { id: "signup_email" }
- inputText: ${EMAIL}
- tapOn: { id: "signup_password" }
- inputText: ${PASSWORD}
- tapOn: { id: "signup_confirmPassword" }
- inputText: ${PASSWORD}
- tapOn: { id: "signup_submit" }

# Step 3 - Rerun fall-through: if signup failed ('email already in use'), tap the D-05
# affordance to dismiss back to LoginView, then fill + submit login form.
- runFlow:
    when:
      visible: { id: "signIn_existingAccount" }
    commands:
      - tapOn: { id: "signIn_existingAccount" }
      - tapOn: { id: "login_email" }
      - inputText: ${EMAIL}
      - tapOn: { id: "login_password" }
      - inputText: ${PASSWORD}
      - tapOn: { id: "login_submit" }

# Step 4 - Wait up to 15s for authenticated home screen (cold-simulator tolerant).
- extendedWaitUntil:
    visible: { id: "home_root" }
    timeout: 15000

# Step 5 - Navigate to writable screen, submit Firestore document.
- tapOn: { id: "home_addItem" }
- tapOn: { id: "addItem_textField" }
- inputText: ${DOC_TEXT}
- tapOn: { id: "addItem_submit" }

# Step 6 - Firestore round-trip read-back. 20s timeout absorbs first-sync snapshot latency.
- extendedWaitUntil:
    visible: ${DOC_TEXT}
    timeout: 20000
```

## Decision Trace

| Decision | How This Plan Applies It |
|----------|--------------------------|
| **D-01** Phase ordering: e2e_gate runs between deliver and xcode_archive | Handler is standalone; Plan 06-07 wires it into PHASE_ORDER slot |
| **D-02** Same Firebase project for dev + gate | YAML env block uses dtc-gate-test@appifex.dev — belongs to the same dev Firebase project; no emulator required |
| **D-04** Single-file golden-path flow | Entire flow is one YAML document in `.maestro/e2e/e2e-gate.yaml`; no `runFlow: filename.yaml` chaining |
| **D-05** signIn_existingAccount affordance | Exact id used in `runFlow when:{visible:{id:signIn_existingAccount}}` step — matches Plan 06-04's template a11y id |
| **D-06** E2eGateError extends CliError | Imported from `@appifex/core`; `instanceof CliError` verified by test 4; flowFile + maestroError fields populated |
| **D-16** Soft-fail on --skip-validation-gate | This plan always throws on failure. The skip-gate logic lives in the pipeline caller (Plan 06-07). |

## Timeout Budget Rationale

| Knob | Value | Rationale |
|------|-------|-----------|
| Maestro phase cap (`timeoutMs`) | 240_000 ms (4 min) | Per 06-RESEARCH open-question #2 — bounded budget; Maestro kills stuck flows cleanly on SIGTERM |
| `extendedWaitUntil home_root` | 15000 ms | Cold-simulator first-launch + auth round-trip (Firebase Auth token exchange) — 06-RESEARCH Pitfall 2 |
| `extendedWaitUntil DOC_TEXT` (Firestore read-back) | 20000 ms | First-sync snapshot listener latency; Firestore realtime listener cold path is slower than warm — 06-RESEARCH |

## Wave-0 Test Transition

`packages/validate/__tests__/e2e-gate.test.ts` RED → GREEN (5/5):

- Test 1: `writes e2e-gate YAML to {projectDir}/.maestro/e2e/e2e-gate.yaml` — GREEN
- Test 2: `generated YAML contains signIn_existingAccount fall-through in a runFlow when-block` — GREEN
- Test 3: `YAML uses extendedWaitUntil with timeout >= 15000 for Firestore assertions` — GREEN
- Test 4: `throws E2eGateError (extends CliError) when Maestro fails` — GREEN
- Test 5: `resolves with MaestroResult on success (no throw)` — GREEN

Full `packages/validate` suite: **32/32 passing** — no regressions across maestro, junit-parser, semgrep, unit-tests, or validate-all tests.

## Decisions Made

Followed plan as specified. One minor field-name tightening:
- Plan pseudocode used `.results.find(r => !r.passed)?.name` but `FlowResult` (packages/core/src/types-testing.ts:19) uses `flowName`, not `name`. Corrected to `r.flowName` in the error message and `r.flowName` in `failedNames.join(', ')` to produce meaningful output.

## Deviations from Plan

None - plan executed exactly as written, modulo the `FlowResult.flowName` field-name fix above (internal consistency correction, not a behavioral deviation).

## Issues Encountered

- **Worktree base reset:** Initial merge-base check showed HEAD at main (`eec5bc0`) instead of the target base `408f8f2`. Resolved via `git reset --hard 408f8f22b238bf07dcac5708a39d78433e656731` per the worktree_branch_check protocol.
- **Missing node_modules:** First `pnpm exec vitest` failed because node_modules weren't installed in the worktree. Resolved with `pnpm install --prefer-offline` (4.3s).
- **Stale `dist/` typecheck noise:** `tsc --noEmit` initially reported `Cannot find module '@appifex/core'` errors in ALL validate source files (pre-existing issue, not specific to e2e-gate.ts). Resolved by running `pnpm build` to emit workspace package `dist/` outputs. Typecheck clean after build.

## User Setup Required

None - no external service configuration required for this plan. The generated YAML embeds a throwaway dev-project test account (D-02 / D-03 per 06-CONTEXT §"Runtime State Inventory"). Plan 06-07 (pipeline wiring) and downstream plans handle runtime credential plumbing.

## Note for Plan 06-07 (Pipeline Wiring)

`runE2eGatePhase` expects `opts.reportDir` from the caller. Per 06-CONTEXT and the Phase 5 precedent, the pipeline should pass `${projectDir}/.dtc-report` (mirrors how xcode-archive-phase.ts passes its report location). The handler does NOT create `reportDir` itself — `runMaestro` already does `await runner.exec('mkdir', ['-p', opts.reportDir])` before test execution (see packages/validate/src/maestro.ts:166).

Signature for the pipeline call site:
```typescript
const result = await runE2eGatePhase({
  runner,
  projectDir: ctx.projectDir,
  platform: ctx.platform,
  appId: ctx.bundleId, // or derived equivalent
  reportDir: `${ctx.projectDir}/.dtc-report`,
})
```

D-16 soft-fail handling lives in the pipeline: wrap `runE2eGatePhase` in try/catch, rethrow on `!opts.skipValidationGate`, record+continue otherwise.

## Next Plan Readiness

- `runE2eGatePhase` + barrel export ready for consumption by Plan 06-07.
- No blockers. Golden-path YAML is self-contained and deterministic across runs (`runner.writeFile` overwrites every invocation per T-6-06-b mitigation).

## Self-Check: PASSED

- File `packages/validate/src/e2e-gate.ts` exists: FOUND
- File `packages/validate/src/index.ts` modified: FOUND (grep `runE2eGatePhase` returns 1 match)
- Commit `1afce48` (Task 1): FOUND in `git log --oneline`
- Commit `61578c4` (Task 2): FOUND in `git log --oneline`
- Wave-0 test `packages/validate/__tests__/e2e-gate.test.ts`: 5/5 GREEN
- Full `packages/validate` suite: 32/32 passing (no regressions)
- `tsc --noEmit` on @appifex/validate: exit 0 after `pnpm build`
- Runtime import of `@appifex/validate` from cli/ package: `typeof runE2eGatePhase === 'function'` OK

---
*Phase: 06-validation-gate-hardening*
*Plan: 06*
*Completed: 2026-04-18*
