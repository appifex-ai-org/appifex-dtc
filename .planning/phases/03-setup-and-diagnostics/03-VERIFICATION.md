---
phase: 03-setup-and-diagnostics
verified: 2026-04-19T10:50:00Z
status: human_needed
score: 4/4 requirements verified in code + 0/1 human checkpoint pending
overrides_applied: 0
human_verification:
  - test: "Run `dtc setup firebase` 'create new project' branch with a real Google account + real GCP billing account"
    expected: "New Firebase project created, iOS app registered, GoogleService-Info.plist downloaded to project tree, config saved to ~/.dtc/config.json with firebaseProjectId. Subprocess errors surface verbatim on conflict."
    why_human: "Requires live firebase CLI login and real GCP billing account. Task 03-04-T2 was explicitly designated as a human-verify checkpoint — cannot be automated in CI."
---

# Phase 3: Setup & Diagnostics Verification Report

**Phase Goal:** A first-time user can configure all required credentials in one guided flow and the pipeline fails fast with actionable status before any LLM spend.
**Verified:** 2026-04-19T10:50:00Z
**Status:** human_needed (all code-level requirements PASS; Firebase live-project creation deferred to user)

## Goal Achievement

### Requirements Coverage

| # | REQ-ID | Description | Status | Evidence |
|---|--------|-------------|--------|----------|
| 1 | SETUP-01 | `dtc setup --full` wizard — first-time user configures all credentials in one guided flow | PASS | `cli/__tests__/setup-wizard.test.ts` (3 tests: full wizard runs, section routing, single-section runs) + `cli/__tests__/setup-sections.test.ts` (11 tests: SECTION_ORDER ordering, section invocations, unknown-section CliError). Source: `cli/src/setup/index.ts` exports `SECTION_ORDER` (project, llm, design, runner, firebase, apple, android, deliver, budget, oauth — 10 entries) + 9 per-section modules. `--full` flag plumbed through `ParsedArgs` + `entry.ts` → `setupWizard({ full })`. Commits: `b239c23` (split monolith, 14 files), `9032ba2` (oauth section + dtc setup command surface). |
| 2 | SETUP-02 | CredentialRegistry fires before LLM spend — pipeline fails fast with actionable status | PASS | `cli/__tests__/preflight-credential-gate.test.ts` (5 integration tests: MISSING LLM key exits before pipeline, MISSING ASC key, all-OK proceeds, INVALID path, EXPIRED JWT). `packages/core/__tests__/credential-registry.test.ts` (23 tests: probeLlm/probeAsc/probeFirebase/probeGoogleOauth/probeAppleOauth all paths). `packages/core/__tests__/asc-jwt.test.ts` (8 tests: ES256 sign, aud/iss/kid, probeAscOffline OK/INVALID). `packages/core/__tests__/config-permissions.test.ts` (3 tests: chmod 0600 after saveConfig). Key structural check: `grep -n 'runCredentialChecks' cli/src/preflight.ts` → line 78 — called before any LLM spend; sentinel comment at call site: "SOLE LLM-spend gate — it MUST run before any generate/agent invocation." Source: `packages/core/src/credential-registry.ts`, `packages/core/src/asc-jwt.ts` (jose ^6.2.2, ES256 JWT, 19m expiry), `cli/src/preflight.ts` (async, throws PreflightError — never process.exit). Commits: `e65ee77` (wave-0 stubs + types), `10c8162` (CredentialRegistry + asc-jwt), `be8a52c` (chmod 0600), `b66609f` (TDD RED), `6ac0bb4` (GREEN probes), `4a38e52` (RED preflight), `2bc677a` (GREEN preflight wiring in pipeline.ts). |
| 3 | SETUP-03 | `dtc doctor` enhanced checks — firebase-tools, service-account JSON, ASC key file; --deep tier reuses credential probes | PASS | `cli/__tests__/doctor.test.ts` (8 tests: shallow calls check functions not fetch; --deep calls shallow + runCredentialChecks; output contains firebase CLI/service-account/ASC key lines; Pitfall 4 — deep uses runCredentialChecks with deep:true; fixture mode short-circuits; no process.exit; parseArgs(['doctor','--deep']) → deep:true; critical failure throws CliError). Source: `cli/src/doctor.ts` (shallow + deep tiers, fixture guard, never process.exit — throws CliError(msg, 4)); `packages/core/src/prerequisites.ts` exports `checkFirebaseTools` (which firebase CLI), `checkServiceAccountJson` (validates service_account type/fields), `checkAscP8` (node:crypto createPrivateKey offline validation). Shared `runCredentialChecks` between doctor --deep and preflight enforces Pitfall 4 parity. Commits: `1f6c807` (checkFirebaseTools/checkServiceAccountJson/checkAscP8), `42ee685` (doctor.ts shallow+deep tiers + --deep flag). |
| 4 | SETUP-04 | Wizard creates new Firebase project — `dtc setup firebase` automates full provisioning flow | PASS (code-level) | `cli/__tests__/setup-firebase.test.ts` (11 unit tests with mocked subprocess: happy path full provisioning flow + config persisted; BaaS skip for non-Firebase provider; missing CLI throws ConfigError with install hint; project conflict surfaces verbatim stderr; ordering — apps:create before apps:sdkconfig; login flow — --no-localhost + stdio:inherit; login detection). `packages/baas/__tests__/firebase-provision.test.ts` (wave-0 stub: 6 tests, placeholder for Phase 4 firebase_provision pipeline phase). Key structural checks: `grep 'shell:' cli/src/setup/firebase.ts` → no match (spawnSync uses argv arrays, never shell:true — T-03-04-01); `grep 'MyApp' cli/src/setup/firebase.ts` → no match (D-02 guard). Source: `cli/src/setup/firebase.ts` (hard-fail on missing firebase-tools; login gate via firebase login:list; prompts for project ID + bundle ID; firebase projects:create → apps:create IOS → apps:sdkconfig IOS; persists firebase.{projectId,iosAppId,iosBundleId,plistPath} + baas.provider=firebase). Commits: `a6b07d9` (runFirebaseSection + unit tests), `b775f7a` (post-merge test fixes). Live Google OAuth flow deferred — see human_verification. |

**Score:** 4/4 requirements PASS at the code level. One item (SETUP-04) has a live Firebase CLI / GCP billing account step that requires human action and cannot be performed by the worker.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/core/src/credential-registry.ts` | VERIFIED | `CredentialRegistry` contract (OK/MISSING/INVALID/EXPIRED), `runCredentialChecks`, 5 probes (llm/asc/firebase/google-oauth/apple-oauth), fixture mode short-circuit |
| `packages/core/src/asc-jwt.ts` | VERIFIED | `signAscJwt` (ES256, 19m expiry, appstoreconnect-v1 aud), `probeAscOffline` (never leaks key material), `probeAscLive` (GET /v1/apps with 401/403/5xx discrimination) |
| `packages/core/src/config.ts` | VERIFIED | `saveConfig` calls `chmod(p, 0o600)` after writeFile; soft-fail on exotic filesystems |
| `packages/core/src/types-config.ts` | VERIFIED | `FirebaseConfig`, `OAuthConfig`, `ProjectConfig` added; `firebase?`, `oauth?`, `project?` fields on `DtcConfig` |
| `packages/core/src/prerequisites.ts` | VERIFIED | `checkFirebaseTools` (which firebase CLI), `checkServiceAccountJson` (service_account shape validation), `checkAscP8` (node:crypto createPrivateKey offline EC key validation) |
| `cli/src/preflight.ts` | VERIFIED | Async `runPreflight`; fixture-mode guard; `runCredentialChecks` before any LLM call; throws `PreflightError` — never process.exit |
| `cli/src/pipeline.ts` | VERIFIED | `runPreflight` wired at line 748, immediately after `loadConfig` (line 742), before `buildCreateMessageFn` (~line 789); sentinel comment guards ordering |
| `cli/src/doctor.ts` | VERIFIED | Shallow tier (checkPrerequisites + checkFirebaseTools + checkServiceAccountJson + checkAscP8) + deep tier (adds runCredentialChecks with deep:true); fixture guard; throws CliError — never process.exit |
| `cli/src/cli.ts` | VERIFIED | `VALID_SETUP_SECTIONS` validates section arg; `deep?: boolean` in ParsedArgs; CliError on unknown section |
| `cli/src/setup/index.ts` | VERIFIED | `setupWizard` composer, `SECTIONS` registry, `SECTION_ORDER` (10 entries, project first), `runSection` |
| `cli/src/setup/project.ts` | VERIFIED | First section in SECTION_ORDER; captures appName + projectDir |
| `cli/src/setup/firebase.ts` | VERIFIED | `runFirebaseSection`; spawnSync argv-arrays (no shell:true); login gate; projects:create → apps:create → apps:sdkconfig; persists to DtcConfig |
| `cli/src/setup/` (8 other sections) | VERIFIED | `shared.ts`, `llm.ts`, `design.ts`, `runner.ts`, `apple.ts`, `android.ts`, `deliver.ts`, `budget.ts`, `oauth.ts` — all fully implemented |
| `cli/__tests__/setup-wizard.test.ts` | VERIFIED | 3 tests passing |
| `cli/__tests__/setup-sections.test.ts` | VERIFIED | 11 tests passing |
| `cli/__tests__/preflight-credential-gate.test.ts` | VERIFIED | 5 integration tests passing |
| `packages/core/__tests__/credential-registry.test.ts` | VERIFIED | 23 tests passing |
| `packages/core/__tests__/asc-jwt.test.ts` | VERIFIED | 8 tests passing |
| `packages/core/__tests__/config-permissions.test.ts` | VERIFIED | 3 tests passing |
| `cli/__tests__/doctor.test.ts` | VERIFIED | 8 tests passing |
| `cli/__tests__/setup-firebase.test.ts` | VERIFIED | 11 tests passing |
| `packages/baas/__tests__/firebase-provision.test.ts` | VERIFIED | Wave-0 stub; 6 tests passing (Phase 4 owns the firebase_provision pipeline phase) |
| `cli/__tests__/helpers/fake-home.ts` | VERIFIED | `createFakeHome()` temp dir factory used by downstream tests |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (live) | `pnpm test` | 175 files / 1612 passed / 8 skipped / 20.83s | PASS |
| Phase 3 targeted tests | `pnpm vitest run cli/__tests__/setup-wizard.test.ts cli/__tests__/preflight-credential-gate.test.ts packages/core/__tests__/credential-registry.test.ts packages/core/__tests__/asc-jwt.test.ts packages/core/__tests__/config-permissions.test.ts cli/__tests__/doctor.test.ts cli/__tests__/setup-firebase.test.ts packages/baas/__tests__/firebase-provision.test.ts` | 8 files / 68 passed / 0 failed | PASS |
| runCredentialChecks shared between preflight and doctor | `grep -l 'runCredentialChecks' cli/src/preflight.ts cli/src/doctor.ts` | both files | PASS |
| firebase.ts uses no shell:true | `grep 'shell:' cli/src/setup/firebase.ts` | no match — only comment explaining argv-array pattern | PASS |
| No MyApp literal in firebase.ts | `grep 'MyApp' cli/src/setup/firebase.ts` | no match | PASS |
| SECTION_ORDER exported from setup/index.ts | `grep 'SECTION_ORDER' cli/src/setup/index.ts` | SECTION_ORDER exported at line 34 with 10-entry array | PASS |
| runPreflight placed before LLM spend in pipeline.ts | `grep -n 'runPreflight' cli/src/pipeline.ts` | wired at line 748, after loadConfig (line 742), before buildCreateMessageFn (~line 789) | PASS |
| UAT results (03-UAT.md) | Manual UAT session (2026-04-16) | 7 passed / 1 skipped (test 5: Firebase live — manual-only per plan) | PASS (with 1 deferred) |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `cli/src/entry.ts` | Missing `await` before `runPreflight` call (lines 244, 246) — async rejection escaped `main().catch(handleCliError)`, showing raw unhandled rejection with stack trace | Minor | Fixed inline during UAT — commit `976cfe7`. Both call sites now correctly await the async function. |
| `cli/__tests__/pipeline-baas.test.ts`, `cli/__tests__/pipeline-baas-wiring.test.ts` | Pre-existing `it.skip` annotations (8 total) | Info | Pre-existing WIRE-01 deferral (Phase 4). Not a Phase 3 gap. |
| `packages/baas/__tests__/firebase-provision.test.ts` | Wave-0 stub — all tests are structural stubs pending Phase 4 `firebase_provision` pipeline phase | Info | Intentional — 03-VALIDATION.md explicitly designates this as "remains stub-only through Phase 3; Phase 4 owns firebase_provision pipeline phase". |

### Human Verification Required

All items relate to live Firebase CLI login and real GCP billing account — cannot be automated in CI.

1. **Real Firebase project creation via `dtc setup firebase`**
   - Test: Run `dtc setup firebase` "create new project" branch with a real Google account (logged in via `firebase login --no-localhost`). Provide a unique project ID derived from the app name slug.
   - Expected: New Firebase project appears in Firebase Console; iOS app registered; `GoogleService-Info.plist` downloaded into the project tree at the configured project directory; `~/.dtc/config.json` updated with `firebase.projectId`, `firebase.iosAppId`, `firebase.iosBundleId`, `firebase.plistPath`, and `baas.provider = 'firebase'`. On conflict, subprocess stderr surfaces verbatim (not swallowed).
   - Why human: Requires live Firebase CLI login and real GCP billing account. Task 03-04-T2 was explicitly designated as a human-verify checkpoint in the 03-04 plan — running `firebase projects:create` against a live GCP account cannot be automated in CI.

### Gaps Summary

**Zero code-level gaps remain.** All 4 requirements are satisfied in the repository as committed. One human checkpoint (SETUP-04 live Firebase project creation) remains outstanding.

### Verdict

**GOAL_ACHIEVED in code** — all 4 requirements are satisfied in the repository as committed. The setup wizard, credential gate (runCredentialChecks firing before LLM spend), doctor enhanced checks, and firebase provisioning tooling all ship in the codebase with full unit and integration test coverage.

**GAPS_REMAIN for live Firebase confirmation** — the Firebase project creation flow requires a real GCP billing account and a logged-in firebase CLI. The tooling ships in `cli/src/setup/firebase.ts`; only the human action of running it against a live Google account is outstanding.

Status is `human_needed` rather than `passed` because SETUP-04's live Firebase project creation step (task 03-04-T2) cannot be completed without a real GCP billing account, and that step was explicitly designated as a human-verify checkpoint in the 03-04 plan.

**UAT note:** UAT (03-UAT.md) ran on 2026-04-16 — 7/8 tests passed, 1 skipped (test 5: Firebase live project creation, manual-only per plan). Inline fix applied during UAT: `cli/src/entry.ts` lines 244 and 246 were missing `await` before `runPreflight` calls — async rejection escaped `main().catch(handleCliError)` and surfaced as a raw unhandled Node.js rejection with stack trace. Fixed in commit `976cfe7`.

---

_Verified: 2026-04-19T10:50:00Z_
_Verifier: Claude (gsd-verifier)_
