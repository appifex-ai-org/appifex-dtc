---
phase: 6
slug: validation-gate-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-18
audited: 2026-04-19
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> See `06-RESEARCH.md ## Validation Architecture` for requirement-level testable contracts.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (root; workspace aliases for `@appifex/*` at `src/index.ts`) |
| **Quick run command** | `pnpm vitest run <file_or_glob>` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | Full suite ~60-120s; per-file quick run ~2-10s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run <files_touched>` (per-package or per-test-file)
- **After every plan wave:** Run `pnpm test` (full suite) plus `pnpm lint` (`tsc --noEmit`)
- **Before `/gsd-verify-work`:** Full suite green + `pnpm build` green + `pnpm lint` green
- **Max feedback latency:** 15s for single-file vitest runs

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-00-T1 | 06-00 | 0 | VAL-02 / D-07..D-10 | T-6-02-a..d | Regex bounded-class; inventory-scoped; pure function | unit stub | `pnpm vitest run packages/analysis/__tests__/fix-context-ranker.test.ts` | ✅ | ✅ green |
| 6-00-T2 | 06-00 | 0 | VAL-03 / D-11, D-13 | — | Empty-fix envelope when tool_use absent | unit stub | `pnpm vitest run packages/fix/__tests__/structured-outputs-fixture.test.ts` | ✅ | ✅ green |
| 6-00-T3 | 06-00 | 0 | VAL-04 / D-18 | T-6-03-a | Semgrep runs regardless of Maestro/unit state | unit stub | `pnpm vitest run packages/validate/__tests__/validate-all-semgrep-unconditional.test.ts` | ✅ | ✅ green |
| 6-00-T4 | 06-00 | 0 | VAL-01 / D-01 | — | e2e_gate in PHASE_ORDER between deliver and xcode_archive | unit stub | `pnpm vitest run packages/core/__tests__/phase-order-e2e-gate.test.ts` | ✅ | ✅ green |
| 6-00-T5 | 06-00 | 0 | VAL-01 / D-05 | T-6-04-b | signIn_existingAccount affordance in signup template | unit stub | `pnpm vitest run packages/baas/__tests__/signup-template-accessibility.test.ts` | ✅ | ✅ green |
| 6-00-T6 | 06-00 | 0 | VAL-04 / D-16, D-17 | — | --skip-validation-gate parses and bypasses terminal gate only | contract | `pnpm vitest run cli/__tests__/skip-validation-gate-flag.test.ts` | ✅ | ✅ green |
| 6-00-T7 | 06-00 | 0 | VAL-01 / D-01, D-04, D-06 | — | runE2eGatePhase throws E2eGateError on golden-path failure | unit stub | `pnpm vitest run packages/validate/__tests__/e2e-gate.test.ts` | ✅ | ✅ green |
| 6-01-T1 | 06-01 | 1 | VAL-01 / D-06 | — | E2eGateError extends CliError; flowFile + maestroError fields | unit | `pnpm vitest run packages/core/__tests__/phase-order-e2e-gate.test.ts` | ✅ | ✅ green |
| 6-01-T2..4 | 06-01 | 1 | VAL-01 / D-01 | — | e2e_gate PhaseId + CheckpointData branch + PHASE_ORDER slot | unit | `pnpm vitest run packages/core/__tests__/phase-order-e2e-gate.test.ts` | ✅ | ✅ green |
| 6-02-T1..2 | 06-02 | 1 | VAL-02 / D-07..D-10 | T-6-02-a..d | rankFixContext pure function; P1/P2/P3 priority; budget cap; cold-start | unit | `pnpm vitest run packages/analysis/__tests__/fix-context-ranker.test.ts` | ✅ | ✅ green |
| 6-03-T1 | 06-03 | 1 | VAL-04 / D-18 | T-6-03-a | semgrep guard removed in validate-all.ts | unit | `pnpm vitest run packages/validate/__tests__/validate-all-semgrep-unconditional.test.ts` | ✅ | ✅ green |
| 6-04-T1 | 06-04 | 1 | VAL-01 / D-05 | T-6-04-b | signup template emits signIn_existingAccount + 4 signup_* IDs | unit | `pnpm vitest run packages/baas/__tests__/signup-template-accessibility.test.ts` | ✅ | ✅ green |
| 6-04-T2 | 06-04 | 1 | VAL-01 / D-05 | — | login template emits login_* + signUp_navigate a11y IDs | grep | `grep -q '.accessibilityIdentifier("login_email")' packages/baas/src/templates/firebase/login-view.swift.eta` | ✅ | ✅ green |
| 6-05-T1..3 | 06-05 | 1 | VAL-02, VAL-03 / D-07..D-14 | T-6-02-b..c | Tool-use parser; ranker replaces glob; path-traversal guard; D-13 empty-fix | unit | `pnpm vitest run packages/fix/__tests__/structured-outputs-fixture.test.ts` | ✅ | ✅ green |
| 6-06-T1..2 | 06-06 | 2 | VAL-01 / D-01, D-04, D-06 | T-6-06-a | runE2eGatePhase writes golden-path YAML; throws E2eGateError on failure | unit | `pnpm vitest run packages/validate/__tests__/e2e-gate.test.ts` | ✅ | ✅ green |
| 6-07-T1 | 06-07 | 2 | VAL-04 / D-16, D-17 | — | --skip-validation-gate plumbed entry→pipeline; opts.skipValidationGate field wired | contract | `pnpm vitest run cli/__tests__/skip-validation-gate-flag.test.ts` | ✅ | ✅ green |
| 6-07-T2 | 06-07 | 2 | VAL-04 / D-18 | T-6-03-a | Second semgrep call site guard removed in pipeline.ts | grep | `grep -q "// Phase 6 (VAL-04 D-18)" cli/src/pipeline.ts` | ✅ | ✅ green |
| 6-07-T3 | 06-07 | 2 | VAL-01, VAL-04 / D-15, D-16 | — | hardFailPassed / softFailPassed gate split; gatePassed applied to both archive + upload | contract | `pnpm vitest run cli/__tests__/skip-validation-gate-flag.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/analysis/__tests__/fix-context-ranker.test.ts` — stubs for ranker inputs/outputs (VAL-02 / D-07..D-10) — turned GREEN by Plan 06-02
- [x] `packages/fix/__tests__/structured-outputs-fixture.test.ts` — fixture-mode smoke: existing `fix.json` fixture still produces expected envelope after tool-use rewrite (VAL-03 / D-14 + GATE-02 compat) — turned GREEN by Plan 06-05
- [x] `packages/validate/__tests__/validate-all-semgrep-unconditional.test.ts` — semgrep runs even when `ui.failed > 0` or `unit.failed > 0` (VAL-04 / D-18) — turned GREEN by Plan 06-03
- [x] `packages/core/__tests__/phase-order-e2e-gate.test.ts` — `PHASE_ORDER` contains `'e2e_gate'` between `'deliver'` and `'xcode_archive'` (VAL-01 / D-01) — turned GREEN by Plan 06-01
- [x] `packages/baas/__tests__/signup-template-accessibility.test.ts` — rendered signup template emits `.accessibilityIdentifier("signIn_existingAccount")` on the fallback affordance (VAL-01 / D-05) — turned GREEN by Plan 06-04
- [x] `cli/__tests__/skip-validation-gate-flag.test.ts` — `--skip-validation-gate` parses into `opts.skipValidationGate = true` and bypasses the terminal block only (VAL-04 / D-16, D-17) — contract-lock GREEN from Plan 06-00; first-class field wired by Plan 06-07
- [x] `packages/validate/__tests__/e2e-gate.test.ts` — `runE2eGatePhase` throws `E2eGateError` (extends `CliError`) when golden-path fails (VAL-01 / D-06) — turned GREEN by Plan 06-06

*Framework: vitest already installed; no framework setup needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Firebase golden-path simulator run (sign-in + Firestore write + read) | VAL-01 | Requires macOS + iOS Simulator + live Firebase dev project + Xcode build — not reproducible in CI | After `pnpm build`, run `dtc` against a fixture design with a live Firebase project. Expect `e2e_gate` phase to drive simulator through signup → Firestore write → read and exit 0. Expect `testflight_upload` blocked if flow fails (absent `--skip-validation-gate`). |
| Maestro flow rerun idempotency (first-run signup, second-run signIn_existingAccount fallback) | VAL-01 / D-05 | Requires two simulator runs against the same Firebase project | Run `dtc` once against a fresh Firebase project (signup path fires). Re-run `dtc` (signup fails, fallback tap to sign-in fires, flow completes). |
| Anthropic tool-use against live API (not fixture) | VAL-03 | Fixture replay covers GATE-02; live verification requires `ANTHROPIC_API_KEY` | Run fix loop against a seeded failing build with a real API key. Expect `content[].type === 'tool_use'` response parsed by the new path. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (all runs use `vitest run`, not `vitest`)
- [x] Feedback latency < 15s for per-file runs
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-19

---

## Validation Audit 2026-04-19

| Metric | Count |
|--------|-------|
| Test files audited | 7 |
| Total tests | 29 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated to manual-only | 3 (pre-existing) |
| Final status | NYQUIST-COMPLIANT |

All 29 Phase 6 tests run green (`pnpm vitest run` across all 7 test files, 533ms). Wave 0 requirements fully satisfied — every VAL-01..04 requirement has automated coverage. Three manual-only verifications documented above require a live Firebase/Simulator environment and are not automatable in CI.
