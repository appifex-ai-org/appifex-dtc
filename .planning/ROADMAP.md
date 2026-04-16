# Roadmap: appifex-dtc v1

## Overview

Brownfield hardening milestone. The pipeline architecture, design adapters, SwiftUI/Kotlin codegen, Firebase templates, LLM fix loop, and MCP server already exist. This milestone first makes the repo open-source-ready (Phase 1), then integrates and hardens the SwiftUI + Firebase path end-to-end so a solo founder can run one command and get a TestFlight build from a design file — no manual Xcode or Firebase console steps. Phases flow in strict dependency order: open-source release readiness first, then fix the broken foundation, credential-gate third, wire Firebase fourth (its plist is a build input), archive and upload fifth, harden the validation loop sixth, then finish adapter parity and surface polish in parallel.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Open-Source Release Readiness** - Make the repo publishable to npm under @appifex/* with git-flow + PR gates so external contributors can work on the project safely
- [x] **Phase 2: Foundation Hardening** - Fix pre-existing bugs that block the entire pipeline
- [ ] **Phase 3: Setup & Diagnostics** - Credential wizard and doctor so the pipeline fails fast before any LLM spend
- [ ] **Phase 4: Firebase Integration** - Wire Firebase auth/data/rules and provision the plist that the Xcode archive depends on
- [ ] **Phase 5: Xcode Archive & TestFlight Upload** - Archive the app and upload to TestFlight via ASC REST — the core product promise
- [ ] **Phase 6: Validation Gate Hardening** - Harden the Maestro E2E gate and fix loop so the one-command promise is trustworthy
- [ ] **Phase 7: Design Parity, MCP Surface & Observability** - Finish adapter parity fixtures, expose new pipeline phases as MCP tools, and add cost/debug visibility

## Phase Details

### Phase 1: Open-Source Release Readiness
**Goal**: Make the repo publishable to npm under @appifex/* with git-flow + PR gates so external contributors can work on the project safely
**Depends on**: Nothing (first phase)
**Requirements**: REPO-01, REPO-02, REPO-03, REPO-04, NPM-01, NPM-02, FLOW-01, GATE-01, GATE-02, GATE-03, GATE-04
**Success Criteria** (what must be TRUE):
  1. `npm publish --dry-run` succeeds for every workspace package under the `@appifex/*` scope with correct `publishConfig`, license, and repository metadata
  2. Opening a PR without a changeset entry fails the `changesets/action` PR check; adding one makes the check green
  3. `gitleaks` pre-commit hook and CI scan both pass with a clean history (no secrets found)
  4. `main` and `develop` branches have protection rules enforced: PR + required CI checks (lint/typecheck/vitest + E2E smoke) + ≥1 code-owner review before merge
  5. `feature/*` → `develop` → `release/*` → `main` branching flow is navigable from the CONTRIBUTING.md and `git-flow` conventions are documented
**Plans**: 11 plans
  - [x] 01-01-PLAN.md — Workspace rebrand: @dtc/* → @appifex/* (atomic, wave 1)
  - [x] 01-02-PLAN.md — Repo hygiene files + /docs scaffolding + CODEOWNERS (wave 2)
  - [x] 01-03-PLAN.md — ESLint flat config + Prettier + commitlint + rewritten scripts (wave 2)
  - [x] 01-04-PLAN.md — lefthook hooks + .gitleaks.toml + history scan (wave 3)
  - [x] 01-05-PLAN.md — Changesets init + release.yml + NPM-01 publishConfig metadata (wave 3)
  - [x] 01-06-PLAN.md — CI workflow: lint/typecheck/test/commitlint/gitleaks (wave 4)
  - [x] 01-07-PLAN.md — Two-tier E2E gate + tiny-mock fixture + Pencil offline spike (wave 4)
  - [x] 01-08-PLAN.md — publish-metadata guard test + npm publish --dry-run CI job (wave 4)
  - [x] 01-09-PLAN.md — Branch protection + develop branch + signed-commits guide (wave 5)
  - [x] 01-10-PLAN.md — GATE-02 gap closure: wire ANTHROPIC_API_KEY into e2e.yml + promote e2e-build to required status check (wave 1, gap_closure)
  - [x] 01-11-PLAN.md — GATE-04 gap closure: in-repo changeset-check CI job + promote to required status check (wave 2, gap_closure)

### Phase 2: Foundation Hardening
**Goal**: All pre-existing pipeline bugs are fixed and the CLI works correctly on any install
**Depends on**: Phase 1
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. `dtc` resolves and executes on a machine that is not the development machine (no broken absolute symlink)
  2. The token estimator uses the corrected Swift token density and the fix loop never starts with less than 30% budget remaining for remediation
  3. A pipeline run with a large prompt does not silently truncate — EPIPE causes a hard failure with a clear error message
  4. Running the pipeline via the MCP server does not kill the MCP host process when any pipeline phase calls `process.exit`
**Plans**: 5 plans
  - [x] 02-01-PLAN.md — CliError hierarchy + non-entry exit refactor + MCP tool wrapper (FOUND-04, wave 1)
  - [x] 02-02-PLAN.md — Swift token density + 30%% fix-loop budget guard (FOUND-02, wave 2)
  - [x] 02-03-PLAN.md — EpipeError at 4 LLM CLI stdin sites (FOUND-03, wave 2)
  - [x] 02-04-PLAN.md — bin/dtc launcher replacing broken symlink (FOUND-01, wave 1)
  - [x] 02-05-PLAN.md — Guard root prepare script against local core.hooksPath (FOUND-01 gap closure, wave 1)

### Phase 3: Setup & Diagnostics
**Goal**: A first-time user can configure all required credentials in one guided flow and the pipeline fails fast with actionable status before any LLM spend
**Depends on**: Phase 2
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04
**Success Criteria** (what must be TRUE):
  1. `dtc setup --full` completes end-to-end: captures Apple ASC key, Firebase project selection or creation, LLM provider key, and Google/Apple OAuth client IDs without leaving the terminal
  2. A run with a missing or expired credential exits before any LLM call with a per-credential `[OK / MISSING / INVALID / EXPIRED]` status line
  3. `dtc doctor` reports pass/fail for firebase-tools CLI, service-account JSON, and ASC key file (in addition to existing checks)
  4. The wizard can create a new Firebase project, register the iOS app, and download `GoogleService-Info.plist` into the project tree without any manual Firebase Console step
**Plans**: 5 plans
  - [x] 03-01-credential-foundation-PLAN.md — DtcConfig extensions + CredentialRegistry scaffold + asc-jwt + config chmod 0600 + wave-0 test stubs (wave 1)
  - [x] 03-02-credential-probes-preflight-PLAN.md — Implement probes (llm/asc/firebase/google-oauth/apple-oauth) + wire runPreflight to fail before LLM spend (wave 2)
  - [x] 03-03-wizard-sectioning-PLAN.md — Split setup-wizard.ts monolith into cli/src/setup/<section>.ts + oauth.ts + dtc setup [section] [--full] command surface (wave 1)
  - [x] 03-04-firebase-section-PLAN.md — runFirebaseSection subprocess orchestration (firebase projects:create + apps:create + apps:sdkconfig) with human-verify checkpoint (wave 2)
  - [x] 03-05-doctor-deep-PLAN.md — dtc doctor shallow + --deep tiers; shared runCredentialChecks with preflight (wave 3)

### Phase 4: Firebase Integration
**Goal**: Generated SwiftUI apps have fully wired Firebase auth (email, Apple, Google), typed Firestore data layer, and security rules deployed — and `GoogleService-Info.plist` exists in the project tree before archive is attempted
**Depends on**: Phase 3
**Requirements**: FIRE-01, FIRE-02, FIRE-03, FIRE-04, FIRE-05
**Success Criteria** (what must be TRUE):
  1. A generated app builds with Firebase SDK pulled via SPM and `FirebaseApp.configure()` called in an `AppDelegate` (not `App.init`) — no CocoaPods, no manual SPM step
  2. The generated auth layer supports email/password, Sign In with Apple (correct hashed-nonce), and Google Sign In with `REVERSED_CLIENT_ID` URL scheme auto-injected into `project.yml`
  3. Generated data layer exposes typed `Codable` Firestore models with realtime listeners and offline caching derived from the inferred schema
  4. The `firebase_provision` pipeline phase runs idempotently: Firebase project exists or is created, `GoogleService-Info.plist` is present, Firestore security rules are deployed, and the phase is skipped on resume if its checkpoint is complete
  5. Security lint blocks the pipeline (hard-fail, no override) when generated rules allow cross-user reads or are missing a deny-all default
**Plans**: 5 plans
  - [ ] 04-01-PLAN.md — Types foundation: ProvisionError/SecurityLintError + PhaseId + CheckpointData + PHASE_ORDER + format label (wave 1)
  - [ ] 04-02-PLAN.md — Swift templates: SSO auth + realtime repository + PersistentCacheSettings + patchProjectDependencies with GoogleSignIn (wave 1)
  - [ ] 04-03-PLAN.md — Security lint hardening: cross-user read + deny-all patterns (wave 2)
  - [ ] 04-04-PLAN.md — firebase-provision.ts module + 5 implemented tests (wave 3)
  - [ ] 04-05-PLAN.md — Pipeline wiring: firebase_provision phase handler + human-verify checkpoint (wave 4)

### Phase 5: Xcode Archive & TestFlight Upload
**Goal**: The pipeline archives the app and uploads it to TestFlight via direct ASC REST calls — no community CLI dependency — with release hygiene applied automatically
**Depends on**: Phase 4
**Requirements**: TF-01, TF-02, TF-03, TF-04
**Success Criteria** (what must be TRUE):
  1. The `testflight_upload` pipeline phase archives the app with `xcodebuild` and uploads to TestFlight using `xcrun altool --upload-package` with ASC JWT auth — the `asc` community CLI is not required
  2. `project.yml` mutations (Firebase SPM deps, entitlements, URL schemes) are performed via `js-yaml` parse/mutate/serialize — no regex patching
  3. Every archive automatically injects `ITSAppUsesNonExemptEncryption=false`, increments build number with collision guard, and sets `DEBUG_INFORMATION_FORMAT=dwarf-with-dsym` for dSYM symbolication
  4. Uploaded builds are assigned to the configured internal testing group and an internal-tester invite is issued without any manual App Store Connect step
**Plans**: TBD

### Phase 6: Validation Gate Hardening
**Goal**: The Maestro E2E gate runs against a real Firebase dev project before any upload is attempted, and the fix loop is more precise and token-efficient
**Depends on**: Phase 5
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04
**Success Criteria** (what must be TRUE):
  1. A TestFlight upload is blocked until Maestro's golden-path flow completes on simulator: sign-in → Firestore write → Firestore read round-trip — against the real dev Firebase project
  2. The fix loop presents context ranked by modified-screen / failing-test locality rather than grabbing the first 20 files indiscriminately
  3. The fix loop uses Anthropic structured outputs for its response schema — no custom delimiter parser needed
  4. Security lint and semgrep failures block the pipeline with no override; Maestro and unit test failures block the pipeline but can be bypassed with `--skip-validation-gate`
**Plans**: TBD

### Phase 7: Design Parity, MCP Surface & Observability
**Goal**: All four design adapters produce equivalent IR verified by fixture tests, the MCP server exposes the two new pipeline phases, and users can see token cost and access debug bundles
**Depends on**: Phase 4 (for MCP tools referencing new phases), Phase 6 (for full pipeline stability)
**Requirements**: DESIGN-01, DESIGN-02, DESIGN-03, DESIGN-04, MCP-01, MCP-02, MCP-03, OBS-01, OBS-02, OBS-03
**Success Criteria** (what must be TRUE):
  1. All four adapters (Pencil, Figma REST, Figma-Make, Stitch) pass the same layer-name sanitization fixtures (whitespace, emoji, duplicates, reserved words) and a single reference design round-trips through all four adapters producing structurally equivalent `PlatformSpec` + `DesignTokens`
  2. MCP clients can invoke `dtc_firebase_provision` and `dtc_testflight_upload` tools and receive `dtc_get_pipeline_status` with checkpoint + phase state
  3. Subsequent pipeline runs detect user-edited generated files (via `.dtc-manifest.json` hashes) and preserve them rather than overwriting
  4. The terminal UI shows live token count and USD cost per phase plus a run-total summary
  5. A failed run produces a `.dtc-report` with per-phase status and a zippable `.dtc-debug/bundle-<ts>.zip` with logs, LLM prompts, outputs, and checkpoint snapshot
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Open-Source Release Readiness | 0/9 | Not started | - |
| 2. Foundation Hardening | 0/TBD | Not started | - |
| 3. Setup & Diagnostics | 0/TBD | Not started | - |
| 4. Firebase Integration | 0/TBD | Not started | - |
| 5. Xcode Archive & TestFlight Upload | 0/TBD | Not started | - |
| 6. Validation Gate Hardening | 0/TBD | Not started | - |
| 7. Design Parity, MCP Surface & Observability | 0/TBD | Not started | - |
