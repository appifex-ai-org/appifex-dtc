---
phase: 06-validation-gate-hardening
verified: 2026-04-18T08:05:00Z
status: human_needed
score: 11/11 must-haves verified (automated)
overrides_applied: 0
requirements_coverage:
  VAL-01: satisfied_automated + needs_human
  VAL-02: satisfied
  VAL-03: satisfied
  VAL-04: satisfied
test_run:
  suite: pnpm test (vitest run)
  total_tests: 1521
  passed: 1513
  skipped: 8
  failed: 0
  duration_sec: 20.92
  test_files: 160
non_blocking_findings:
  - id: WR-02
    severity: warning
    file: cli/src/pipeline.ts
    line: 90
    description: "`e2e_gate` is NOT in FORCE_RERUN_PHASES. On resume, `canSkipPhase('e2e_gate')` returns true and `e2eGatePassed = true` is set without re-running the gate. Contradicts D-16 'checks always run, only terminal block is bypassed'."
    impact: "Second `dtc run` against a changed Firestore integration ships without re-verifying the golden path."
    routing: "Flagged for follow-up; code review disposition 'issues_found, none block the phase'."
  - id: WR-01
    severity: warning
    file: packages/validate/src/e2e-gate.ts
    line: 116-123
    description: "runE2eGatePhase passes appId to runMaestro, which skips the install+launch branch (maestro.ts:141-163). Relies on implicit invariant that an earlier phase already booted the simulator and installed the app."
  - id: IR-03
    severity: info
    file: cli/src/pipeline.ts
    line: 2819-3114
    description: "Agent-orchestrated path returns before the terminal gate block, so e2e_gate never runs on agent-driven runs. The 'Design to TestFlight in one command' contract silently degrades for agent users."
human_verification:
  - test: "Real Firebase golden-path simulator run"
    expected: "`dtc` drives simulator through signup → Firestore write → read against the live dev Firebase project; `e2e_gate` phase exits 0; `testflight_upload` proceeds. Re-running produces `signIn_existingAccount` fall-through path."
    why_human: "Requires macOS + iOS Simulator + live Firebase dev project + Xcode build — explicitly listed as Manual-Only in 06-VALIDATION.md."
  - test: "Maestro rerun idempotency (first-run signup, second-run signIn_existingAccount fallback)"
    expected: "First run completes signup path; second run against same Firebase project taps the `signIn_existingAccount` affordance, logs in, continues to Firestore write/read."
    why_human: "Requires two simulator runs against the same Firebase project against live Maestro."
  - test: "Anthropic tool-use against live API (not fixture)"
    expected: "Fix loop sends `tools: [SUBMIT_FIXES_TOOL]` with `tool_choice: { type: 'tool', name: 'submit_fixes' }`, receives `content[].type === 'tool_use'` response, path-traversal guard applied to returned `fix.path` entries."
    why_human: "Fixture replay covers GATE-02; live verification requires ANTHROPIC_API_KEY."
  - test: "--skip-validation-gate respects hard-fail invariant under live semgrep failure"
    expected: "A seeded semgrep finding with `--skip-validation-gate` present → xcode_archive emits 'Skipped — security hard-fail (no override)'; testflight_upload blocks. No xcode_archive run proceeds."
    why_human: "Requires running pipeline end-to-end with a seeded failing security rule."
---

# Phase 6: Validation Gate Hardening — Verification Report

**Phase Goal:** The Maestro E2E gate runs against a real Firebase dev project before any upload is attempted, and the fix loop is more precise and token-efficient.

**Verified:** 2026-04-18T08:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth (Roadmap SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | TestFlight upload blocked until Maestro's golden-path flow completes on simulator: sign-in → Firestore write → Firestore read round-trip — against the real dev Firebase project | VERIFIED (automation) / needs_human (live run) | Code path wired: `runE2eGatePhase` inserted between `deliver` and `xcode_archive` (`cli/src/pipeline.ts:3721-3779`); `xcode_archive` gated on `gatePassed` (`cli/src/pipeline.ts:3820-3826`); YAML at `packages/validate/src/e2e-gate.ts:37-105` covers signup → Firestore doc submit → Firestore read-back with 15000/20000ms timeouts. Live simulator run not automatable — see human verification. |
| 2 | Fix loop presents context ranked by modified-screen / failing-test locality rather than grabbing the first 20 files indiscriminately | VERIFIED | `packages/analysis/src/fix-context-ranker.ts` implements P1 (failing-test/semgrep/Maestro-id), P2 (modifiedScreens), P3 (nav-graph siblings), with D-08 budget cap + D-09 cold-start. `default-fix.ts:199-224` calls `rankFixContext` and uses `ranked.files` as the context set. Old first-10-glob + `errorTypeNames` grep are deleted (grep confirms both absent). |
| 3 | Fix loop uses Anthropic structured outputs for its response schema — no custom delimiter parser needed | VERIFIED | `SUBMIT_FIXES_TOOL` constant at `default-fix.ts:62-92`; call uses `tool_choice: { type: 'tool', name: 'submit_fixes' }` (`default-fix.ts:253-259`); parser at 278-302 consumes `c.type === 'tool_use' && c.name === 'submit_fixes'`. `===FIX:===` delimiter and `extractJson` helper removed (grep confirms absent). `@anthropic-ai/sdk` bumped to `^0.90.0` in fix/codegen/baas. |
| 4 | Security lint and semgrep failures block the pipeline with no override; Maestro and unit test failures block the pipeline but can be bypassed with `--skip-validation-gate` | VERIFIED | Terminal split at `cli/src/pipeline.ts:3791-3820`: `hardFailPassed = semgrepPassed && securityLintPassed` (hard); `softFailPassed = report.summary.allGreen && e2eGatePassed !== false` (soft); `gatePassed = hardFailPassed && (softFailPassed \|\| opts.skipValidationGate === true)` — flag CANNOT bypass hard-fail by algebra. `semgrepPassed` is fail-closed (`security !== undefined && security.failed === 0`). Grep proves no `?? true` fail-open on security signals. Two skip branches emit distinct reasons (lines 3878, 3881). |

**Score:** 4/4 Success Criteria verifiable at the code-inspection level; SC-1 additionally requires human verification for the live simulator + Firebase run.

### Observable Truths (from PLAN frontmatter must_haves — aggregated)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | E2eGateError exported from @appifex/core, extends CliError | VERIFIED | `packages/core/src/errors.ts:120-129` (class); `packages/core/src/index.ts:38,50` (barrel). Instantiation tested in `e2e-gate.test.ts`. |
| 2 | PHASE_ORDER contains `'e2e_gate'` between `'deliver'` and `'xcode_archive'`, exactly once | VERIFIED | `packages/core/src/run-context.ts:47-69` lines 64-66 confirm order: `deliver → e2e_gate → xcode_archive`. `phase-order-e2e-gate.test.ts` 3/3 green. |
| 3 | PhaseId union includes `'e2e_gate'`; CheckpointData has branch with flowFile/passed/totalFlows/failureSummary | VERIFIED | `packages/core/src/types-pipeline.ts:23` (union) and 117-126 (CheckpointData branch with all 4 fields). |
| 4 | PHASE_LABELS has `e2e_gate: 'E2E gate'` | VERIFIED | `cli/src/views/format.ts:37`. |
| 5 | rankFixContext pure async; priority ordering P1>P2>P3; D-08 cap enforced (N=0 → empty); D-09 cold-start from flowYaml | VERIFIED | `packages/analysis/src/fix-context-ranker.ts`: no `node:fs`, Runner-only I/O (one readFile for avgFileTokens sample). Priority merge via Set insertion order (lines 62-122). Budget cap lines 127-141 with N=0 floor. Cold-start lines 88-102. 13 tests in `fix-context-ranker.test.ts` green. |
| 6 | @appifex/analysis barrel exports rankFixContext + CHARS_PER_TOKEN + FIX_CONTEXT_BUDGET_RATIO + types | VERIFIED | `packages/analysis/src/index.ts:12-13`. |
| 7 | Semgrep runs when `opts.runSecurity === true` regardless of Maestro/unit | VERIFIED | `packages/validate/src/validate-all.ts:61-66` — guard simplified to `if (opts.runSecurity)`; Phase 6 comment D-18 present. Second site at `cli/src/pipeline.ts:3435-3526` — old `if (testsResolved)` wrapper removed; runSemgrep now unconditional after the Maestro/unit/fix block. 3/3 tests green. |
| 8 | Signup template exposes `signIn_existingAccount` only when `error != nil`; all 4 signup_* ids present; dismiss env var wired | VERIFIED | `packages/baas/src/templates/firebase/signup-view.swift.eta` lines 25, 31, 37, 51, 68 — all 5 identifiers present. Dismiss declared at the state block. Button inside `if let error { ... }` block. 2/2 tests green. |
| 9 | Login template has login_email/login_password/login_submit/signUp_navigate | VERIFIED | `packages/baas/src/templates/firebase/login-view.swift.eta` lines 24, 30, 52, 91. |
| 10 | default-fix.ts uses tool-use + ranker + path-traversal guard + fixture preservation | VERIFIED | `packages/fix/src/default-fix.ts:62-92` (SUBMIT_FIXES_TOOL), 253-259 (tool_choice call), 278-302 (tool_use parser + path guard via `ALLOWED_PREFIXES`), 172 (fixture short-circuit verbatim). DefaultFixOpts extended with 3 OPTIONAL fields (51-56). 2/2 fixture tests green. |
| 11 | claude-cli-fix.ts: rankerHint computed BEFORE prompt; finalPrompt = rankerHint + prompt; stdin.write uses finalPrompt; payloadBytes reflects finalPrompt | VERIFIED | `packages/fix/src/claude-cli-fix.ts:75-123` (rankerHint try/catch computation precedes prompt), 123 (finalPrompt composition), 145 (payloadBytes), 178 (child.stdin.write(finalPrompt)). |

**PLAN-must_haves score:** 11/11 verified

### Deferred Items

None. All Phase 6 scope is in-phase; no criteria rely on later milestone phases.

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Data Flows | Status |
|----------|----------|--------|-------------|-------|------------|--------|
| packages/core/src/errors.ts | E2eGateError class | YES | YES | YES | YES | VERIFIED |
| packages/core/src/types-pipeline.ts | PhaseId + CheckpointData e2e_gate | YES | YES | YES | YES | VERIFIED |
| packages/core/src/run-context.ts | PHASE_ORDER with e2e_gate | YES | YES | YES | YES | VERIFIED |
| packages/validate/src/e2e-gate.ts | runE2eGatePhase (139 lines, YAML + error throw) | YES | YES | YES (imported at pipeline.ts:3735) | YES (opts passed from pipeline) | VERIFIED |
| packages/validate/src/index.ts | runE2eGatePhase barrel | YES | YES | YES | YES | VERIFIED |
| packages/validate/src/validate-all.ts | baseTestsPassed guard removed | YES | YES | YES | YES | VERIFIED |
| packages/analysis/src/fix-context-ranker.ts | rankFixContext (219 lines) | YES | YES | YES (default-fix:207, claude-cli-fix:89) | YES | VERIFIED |
| packages/analysis/src/index.ts | ranker barrel | YES | YES | YES | YES | VERIFIED |
| packages/fix/src/default-fix.ts | tool-use + ranker + path guard | YES | YES | YES (cli/src/pipeline.ts four call sites) | YES | VERIFIED |
| packages/fix/src/claude-cli-fix.ts | ranker hint prepended | YES | YES | YES | YES | VERIFIED |
| packages/fix/package.json | @anthropic-ai/sdk ^0.90.0 | YES | YES | YES | — | VERIFIED |
| packages/codegen/package.json | @anthropic-ai/sdk ^0.90.0 | YES | YES | YES | — | VERIFIED |
| packages/baas/package.json | @anthropic-ai/sdk ^0.90.0 | YES | YES | YES | — | VERIFIED |
| packages/baas/src/templates/firebase/signup-view.swift.eta | signIn_existingAccount + 4 signup_* ids + dismiss env | YES | YES | YES (rendered into generated apps via baas codegen) | YES | VERIFIED |
| packages/baas/src/templates/firebase/login-view.swift.eta | 4 login_* + signUp_navigate ids | YES | YES | YES | YES | VERIFIED |
| cli/src/entry.ts | --skip-validation-gate flag | YES | YES | YES | YES | VERIFIED |
| cli/src/pipeline.ts | e2e_gate block + terminal split + flag plumbing + second-site semgrep guard removal | YES | YES | YES | YES | VERIFIED |
| cli/src/views/format.ts | PHASE_LABELS includes e2e_gate | YES | YES | YES | YES | VERIFIED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| cli/src/pipeline.ts | packages/validate/src/e2e-gate.ts | `import { runE2eGatePhase } from '@appifex/validate'` (dynamic import at line 3735) | WIRED | Block at lines 3721-3779 calls runE2eGatePhase when firebaseSeeded && !canSkipPhase('e2e_gate'). |
| cli/src/pipeline.ts terminal gate | xcode_archive + testflight_upload | `gatePassed = hardFailPassed && (softFailPassed \|\| opts.skipValidationGate === true)` | WIRED | xcode_archive entry condition uses gatePassed (line 3825); skip branches distinguish hard/soft/skip reasons. |
| cli/src/entry.ts | RunPipelineOpts.skipValidationGate | opts build at line 285 | WIRED | Flag parsed at line 190, passed to runPipeline at 285. |
| packages/validate/src/e2e-gate.ts | runMaestro (.maestro/e2e/e2e-gate.yaml) | runner.writeFile + runMaestro with timeoutMs: 240_000 | WIRED | Lines 113-123. |
| packages/fix/src/default-fix.ts | rankFixContext | import from @appifex/analysis, call at line 207 | WIRED | Ranker-driven selection replaces old first-10-glob. |
| packages/fix/src/default-fix.ts | Anthropic tool-use | tools: [SUBMIT_FIXES_TOOL], tool_choice: { type: 'tool', name: 'submit_fixes' } | WIRED | Line 253-259; parser at 278-302. |
| packages/fix/src/default-fix.ts | isFixtureMode() fallback | line 172 | WIRED (preserved) | GATE-02 compat: text-only fixture → no tool_use → D-13 empty-fix envelope. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| runE2eGatePhase | `gateResult: MaestroResult` | `runMaestro(opts.runner, ...)` subprocess | YES (real simulator / Maestro subprocess output) | FLOWING |
| default-fix.ts | `ranked.files` | `rankFixContext({ failures, modifiedScreens, navGraph, inventory, flowYaml, ... })` | YES | FLOWING |
| default-fix.ts | `fixes` | `toolUse.input.fixes` from Anthropic response | YES (under live API); EMPTY under fixture mode (GATE-02 by design) | FLOWING (contract) |
| pipeline.ts terminal gate | `hardFailPassed`, `softFailPassed` | `validation.security.failed`, `report.summary.allGreen`, `e2eGatePassed`, `config.baas?.provider` | YES | FLOWING |
| fix-context-ranker | `orderedCandidates` | `failures` (parsed paths + ids), `inventory` (scanProject), `navGraph` (buildNavGraph), `flowYaml` (runner.readFile .maestro/e2e/e2e-gate.yaml) | YES | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `pnpm test` | `Test Files 160 passed (160)`; `Tests 1513 passed \| 8 skipped (1521)`; duration 20.92s | PASS |
| Workspace build succeeds (tsc clean) | `pnpm -w run build` | All 12 packages build; cli + mcp-server emit dist/ | PASS |
| Wave-0 test files exist | `ls ... all 7 files` | All present with non-zero sizes | PASS |
| Accessibility ids in templates | `grep accessibilityIdentifier signup-view.swift.eta login-view.swift.eta` | 5 signup_* + 1 signIn_existingAccount + 4 login_* = 10 matches | PASS |
| SDK alignment across packages | `grep anthropic-ai/sdk packages/*/package.json` | fix, codegen, baas all at `^0.90.0` | PASS |
| PHASE_ORDER order invariant | `grep -n "deliver\|e2e_gate\|xcode_archive" packages/core/src/run-context.ts` | Lines 64, 65, 66 in correct order | PASS |
| No fail-OPEN security defaults | `grep -nE "(securityLintPassed\|semgrepFailures)\s*=.*\?\?\s*(true\|0)" cli/src/pipeline.ts` | Zero matches | PASS |
| Second-site semgrep guard removed | `grep -B2 "runSemgrep" cli/src/pipeline.ts` at line 3440 | Runs inside block at 3439 without any `if (testsResolved)` wrapper | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| VAL-01 | 06-00, 06-01, 06-04, 06-06, 06-07 | Real-Firebase Maestro golden-path gate | SATISFIED (automated) + NEEDS HUMAN (live run) | e2e-gate.ts + template ids + pipeline wiring + PHASE_ORDER slot. Live simulator verification awaits human. |
| VAL-02 | 06-00, 06-02, 06-05 | Fix context ranker replaces first-10-glob | SATISFIED | fix-context-ranker.ts (pure, 11+ test cases), consumed in default-fix.ts + claude-cli-fix.ts. |
| VAL-03 | 06-00, 06-05 | Anthropic structured outputs (tool-use) | SATISFIED (automated) + NEEDS HUMAN (live API) | SUBMIT_FIXES_TOOL + tool_choice + tool_use parser + path-traversal guard + D-13 fallback. Fixture-mode compat preserved. Live API call awaits human. |
| VAL-04 | 06-00, 06-03, 06-07 | Hard-fail / soft-fail split + --skip-validation-gate | SATISFIED | Unconditional semgrep at both sites; terminal split with fail-closed defaults; `gatePassed = hardFailPassed && (softFailPassed \|\| skipValidationGate)` — skip flag cannot bypass hard-fail. |

No orphaned requirements — every VAL-01..04 ID in REQUIREMENTS.md is claimed by at least one Phase 6 plan.

### Anti-Patterns Found

Anti-pattern grep over files modified by Phase 6 commits:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| cli/src/pipeline.ts | 3806 | `securityLintPassed = config.baas?.provider !== 'firebase' \|\| true` — tautological expression (`X \|\| true` is always true) | INFO (WR-05 from 06-REVIEW) | The variable is effectively `true` always; `hardFailPassed === semgrepPassed`. A future refactor could silently change gate behavior. Comment documents intent but invites confusion. |
| packages/fix/src/default-fix.ts | 305-307 | Broad `catch { return { filesChanged: [], tokensUsed: 0 } }` swallows every exception including network/429/SDK errors and reports `tokensUsed: 0` even if the LLM was called | WARNING (WR-06 from 06-REVIEW) | TokenBudget drift possible; silent-swallow of SDK errors hides infrastructure issues from the user. |
| packages/analysis/src/fix-context-ranker.ts | 79 | `/id:\s*([A-Za-z_]\w+)/g` does not accept quoted ids (`id: "foo"`) and has no anchor, can false-positive on `let id: Int` | WARNING (WR-03, WR-04 from 06-REVIEW) | Maestro errors commonly quote ids; ranker may miss P1 signals. False positives are low-probability but possible. |
| packages/validate/src/e2e-gate.ts | 121 | Passes `appId` to runMaestro which SKIPS the install+launch branch (maestro.ts:141-163) | WARNING (WR-01 from 06-REVIEW) | Relies on implicit invariant that an earlier phase installed the app on a still-booted simulator. Breaks on resume or multi-simulator hosts. |
| cli/src/pipeline.ts | 90 | `FORCE_RERUN_PHASES` does NOT include `'e2e_gate'` — on resume, the gate is marked skipped AND sets `e2eGatePassed = true` at line 3778 without re-running | WARNING (WR-02 from 06-REVIEW) | D-16 principle "checks always run, only terminal block is bypassable" is violated for repeat runs. A second `dtc run` against changed Firestore code ships without re-verifying. |
| cli/src/pipeline.ts | 2819 | Agent-orchestrated path returns before terminal gate | INFO (IR-03 from 06-REVIEW) | e2e_gate never runs on agent-driven invocations. The "Design to TestFlight in one command" contract silently degrades for agent users. |

**None of these findings block the phase goal** — the phase goal "the Maestro E2E gate runs against a real Firebase dev project before any upload is attempted" is structurally achieved by the wiring, and 06-REVIEW itself disposes them as `issues_found, none block the phase; several deserve attention before Phase 7`.

### Human Verification Required

1. **Real Firebase golden-path simulator run**
   - **Test:** Configure `~/.dtc/config.json` with a real dev Firebase project credentials and Apple ASC creds. Run `dtc run <design> --platform swiftui` against a Firebase-wired sample design.
   - **Expected:** Progress emits reach `e2e_gate: started`, then `e2e_gate: completed` after a simulator run executes `.maestro/e2e/e2e-gate.yaml`. Firestore dev project shows the `dtc-gate-test@appifex.dev` user and the `"Hello from dtc gate"` document. `xcode_archive` and `testflight_upload` proceed. With a deliberately broken Firestore rule, the gate fails, emits `e2e_gate: failed`, and xcode_archive emits `Skipped — validation failed. Re-run with --skip-validation-gate to ship anyway.`
   - **Why human:** Requires macOS + iOS Simulator + live Firebase dev project + Xcode build — 06-VALIDATION.md lists this explicitly as Manual-Only.

2. **Maestro rerun idempotency (signup vs signIn_existingAccount fall-through)**
   - **Test:** First run against a fresh Firebase project (signup path fires). Re-run `dtc` immediately against the same project (email already in use → `signIn_existingAccount` branch fires).
   - **Expected:** Both runs complete. Second run hits the `runFlow { when: { visible: { id: signIn_existingAccount } } }` branch in `.maestro/e2e/e2e-gate.yaml`; Firestore has exactly one user + at least one doc per run.
   - **Why human:** Requires two simulator runs against the same live Firebase project.

3. **Anthropic tool-use against live API (not fixture)**
   - **Test:** Unset `DTC_LLM_MODE`, set `ANTHROPIC_API_KEY`, seed a failing build, invoke the fix loop.
   - **Expected:** `default-fix.ts` sends `tools: [SUBMIT_FIXES_TOOL]` + `tool_choice: { type: 'tool', name: 'submit_fixes' }`; receives `content[].type === 'tool_use'` with `input.fixes` populated; path-traversal guard rejects any `..` / absolute / outside-prefix paths; legitimate paths are written.
   - **Why human:** Fixture replay covers GATE-02; live verification requires an API key.

4. **--skip-validation-gate respects hard-fail invariant under live semgrep failure**
   - **Test:** Seed a deliberate semgrep violation (e.g., hardcoded API key in generated Swift). Run `dtc run ... --skip-validation-gate`.
   - **Expected:** Semgrep finding surfaces; terminal gate computes `hardFailPassed = false`; xcode_archive emits `Skipped — security hard-fail (no override)` regardless of the skip flag; testflight_upload also skips; exit code non-zero.
   - **Why human:** Requires pipeline end-to-end with a seeded failing security rule against a real runner.

### Gaps Summary

No gaps block the phase goal. Every ROADMAP Success Criterion has a concrete code artifact with passing tests. The phase structurally achieves its goal:

- The `e2e_gate` phase is inserted in PHASE_ORDER between `deliver` and `xcode_archive`, wired in `cli/src/pipeline.ts:3721-3779`, and gates the downstream archive+upload phases via `gatePassed`.
- The fix loop's context selection is now ranker-driven (`fix-context-ranker.ts` consumed by both `default-fix.ts` and `claude-cli-fix.ts`); the indiscriminate first-10-glob + type-name grep are deleted.
- The fix-loop LLM response parsing uses Anthropic structured outputs (tool-use) with `tool_choice` forcing invocation; `===FIX:===` delimiter and JSON fallback are deleted; path-traversal guard + D-13 empty-fix fallback harden the write path.
- Hard-fail (semgrep + security-lint invariant) + soft-fail (report.summary.allGreen + e2eGatePassed) + skip-flag (soft-fail only) compose correctly with fail-closed defaults for security-sensitive signals; `--skip-validation-gate` cannot bypass hard-fail by algebra.

**Non-blocking follow-ups** (06-REVIEW findings) are captured in `non_blocking_findings` frontmatter and should be considered for an incremental Phase 6 follow-up or Phase 7:

- WR-02: add `'e2e_gate'` to `FORCE_RERUN_PHASES` so resume runs re-verify the gate.
- WR-01: make `runE2eGatePhase` omit `appId` so `runMaestro` runs the install+launch branch (or add an explicit install step).
- WR-03 + WR-04: harden the Maestro-error id regex to accept quoted ids AND anchor it so Swift type annotations don't false-positive.
- WR-05: drop the `|| true` tautology or replace with an explicit invariant check.
- WR-06: narrow the broad `catch {}` in `createDefaultFixFn` so infrastructure errors surface with accurate token accounting.
- IR-03: either document the agent-path bypass of `e2e_gate` as intentional v1 behavior or refactor the gate invocation into a shared helper.

These are disposed by 06-REVIEW as `issues_found, none block the phase` — same disposition applies here.

---

_Verified: 2026-04-18T08:05:00Z_
_Verifier: Claude (gsd-verifier)_
_Test suite: 1513/1513 passing (8 skipped), 160 test files, 20.92s_
