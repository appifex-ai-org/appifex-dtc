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
- [x] **Phase 6: Validation Gate Hardening** - Harden the Maestro E2E gate and fix loop so the one-command promise is trustworthy (completed 2026-04-18)
- [x] **Phase 7: Design Parity, MCP Surface & Observability** - Finish adapter parity fixtures, expose new pipeline phases as MCP tools, and add cost/debug visibility (completed 2026-04-18)
- [x] **Phase 8: Formal Verification — Foundation Hardening & Setup** - Write VERIFICATION.md for phases 2 & 3 to formally close FOUND-01..04 and SETUP-01..04 (gap closure) (completed 2026-04-19)
- [x] **Phase 9: Formal Verification — Firebase Integration & Design Parity** - Write VERIFICATION.md for phases 4 & 7 to formally close FIRE-01..05, DESIGN-01..04, MCP-01..03, OBS-01..03 (gap closure) (completed 2026-04-18)
- [ ] **Phase 10: Phase 1 Human Verification — Live Branch Protection** - Execute setup-branch-protection.sh and confirm live branch protection to close FLOW-01 + GATE-03 (gap closure)

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
**Plans**: 8 plans (00 wave-0 stubs + 01-05 core + 06-07 coverage-gap closure)
  - [x] 04-00-PLAN.md — Wave-0 test stubs (Nyquist compliance: firebase-codegen/auth/data/security-lint stubs) (wave 0)
  - [x] 04-01-PLAN.md — Types foundation: ProvisionError/SecurityLintError + PhaseId + CheckpointData + PHASE_ORDER + format label (wave 1)
  - [x] 04-02-PLAN.md — Swift templates: SSO auth + realtime repository + PersistentCacheSettings + patchProjectDependencies with GoogleSignIn (wave 1)
  - [x] 04-03-PLAN.md — Security lint hardening: cross-user read + deny-all patterns (wave 2)
  - [x] 04-04-PLAN.md — firebase-provision.ts module + 5 implemented tests (wave 3)
  - [x] 04-06-PLAN.md — security.rules.eta deny-all default block + render-templates lint assertion (wave 3, gap closure: RESEARCH Pitfall 7 / FIRE-05; depends_on 04-03 for non-vacuous lintSecurityRules assertion)
  - [x] 04-05-PLAN.md — Pipeline wiring: firebase_provision phase handler + human-verify checkpoint (wave 4)
  - [x] 04-07-PLAN.md — UI-SPEC overwrite-confirm prompt: clack confirm before plist overwrite + overwritePlist option in runFirebaseProvision (wave 5, gap closure: UI-SPEC destructive-action contract / FIRE-04)

### Phase 5: Xcode Archive & TestFlight Upload
**Goal**: The pipeline archives the app and uploads it to TestFlight via direct ASC REST calls — no community CLI dependency — with release hygiene applied automatically
**Depends on**: Phase 4
**Requirements**: TF-01, TF-02, TF-03, TF-04
**Success Criteria** (what must be TRUE):
  1. The `testflight_upload` pipeline phase archives the app with `xcodebuild` and uploads to TestFlight using `xcrun altool --upload-package` with ASC JWT auth — the `asc` community CLI is not required
  2. `project.yml` mutations (Firebase SPM deps, entitlements, URL schemes) are performed via `js-yaml` parse/mutate/serialize — no regex patching
  3. Every archive automatically injects `ITSAppUsesNonExemptEncryption=false`, increments build number with collision guard, and sets `DEBUG_INFORMATION_FORMAT=dwarf-with-dsym` for dSYM symbolication
  4. Uploaded builds are assigned to the configured internal testing group and an internal-tester invite is issued without any manual App Store Connect step
**Plans**: 6 plans
  - [x] 05-01-PLAN.md — Shared project-yml js-yaml mutator + swift.ts refactor (TF-02, wave 1)
  - [x] 05-02-PLAN.md — Rewrite swift-archive.ts to js-yaml + stale xcodeproj cleanup (TF-02, wave 2)
  - [x] 05-03-PLAN.md — ASC REST client + ArchiveError/TestFlightError (TF-01, TF-04, wave 1)
  - [x] 05-04-PLAN.md — runXcodeArchivePhase orchestrator + hygiene test (TF-01, TF-03, wave 2)
  - [x] 05-05-PLAN.md — altool driver + polling loop + runTestFlightUploadPhase (TF-01, TF-04, wave 2)
  - [x] 05-06-PLAN.md — Pipeline wiring + PHASE_ORDER + --skip-testflight + wizard testers (TF-01, TF-04, wave 3)

### Phase 6: Validation Gate Hardening
**Goal**: The Maestro E2E gate runs against a real Firebase dev project before any upload is attempted, and the fix loop is more precise and token-efficient
**Depends on**: Phase 5
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04
**Success Criteria** (what must be TRUE):
  1. A TestFlight upload is blocked until Maestro's golden-path flow completes on simulator: sign-in → Firestore write → Firestore read round-trip — against the real dev Firebase project
  2. The fix loop presents context ranked by modified-screen / failing-test locality rather than grabbing the first 20 files indiscriminately
  3. The fix loop uses Anthropic structured outputs for its response schema — no custom delimiter parser needed
  4. Security lint and semgrep failures block the pipeline with no override; Maestro and unit test failures block the pipeline but can be bypassed with `--skip-validation-gate`
**Plans**: 8 plans
  - [x] 06-00-PLAN.md — Wave 0 RED test stubs (Nyquist compliance: ranker/fixture/semgrep/PHASE_ORDER/signup-template/skip-flag/e2e-gate stubs) (wave 0)
  - [x] 06-01-PLAN.md — Types foundation: E2eGateError + PhaseId + CheckpointData + PHASE_ORDER + PHASE_LABELS (VAL-01, wave 1)
  - [x] 06-02-PLAN.md — fix-context-ranker.ts pure function + @appifex/analysis barrel re-export (VAL-02, wave 1)
  - [x] 06-03-PLAN.md — Unconditional semgrep: validate-all.ts:62 baseTestsPassed guard removal (VAL-04 D-18, wave 1)
  - [x] 06-04-PLAN.md — Signup/Login template accessibility IDs + signIn_existingAccount fall-through affordance (VAL-01 D-05, wave 1)
  - [x] 06-05-PLAN.md — SDK bump to ^0.90.0 + default-fix.ts tool-use rewrite + D-12 deletions + D-13 fallback + path guard + claude-cli-fix ranker hint (VAL-02, VAL-03, wave 2)
  - [x] 06-06-PLAN.md — e2e-gate.ts handler + golden-path Maestro YAML + barrel export (VAL-01, wave 2)
  - [x] 06-07-PLAN.md — Pipeline wiring: runE2eGatePhase block + --skip-validation-gate flag + terminal gate split (hard-fail/soft-fail) + second-site semgrep guard removal (VAL-01, VAL-04, wave 3)

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
**Plans**: 7 plans
  - [x] 07-00-PLAN.md — Wave 0 RED test stubs (12 test files + parity fixture dir placeholder) (wave 0)
  - [x] 07-01-PLAN.md — Shared sanitizeLayerName module + wire into @appifex/spec extractors + figma-rest-client (wave 1)
  - [x] 07-02-PLAN.md — pricing.ts (verified 2026-04-18 rates) + TokenBudget input/output split + cost getters (wave 1)
  - [x] 07-03-PLAN.md — .dtc-manifest.json read/write/diff module + --overwrite-user-edits + --export-debug-bundle flag parsing (wave 1)
  - [x] 07-04a-PLAN.md — MCP tools (firebase_provision, testflight_upload, get_pipeline_status) (wave 2)
  - [x] 07-04b-PLAN.md — Parity fixture harness + adapter-parity test (wave 2)
  - [x] 07-05-PLAN.md — debug-bundle (archiver + secret scrubber) + PipelineView USD column + PHASE_ORDER drift fix + report formatters cost/remediation extensions (wave 2)
  - [x] 07-06a-PLAN.md — Pipeline integration: manifest gate + write + fix-loop in-place refresh (wave 3)
  - [x] 07-06b-PLAN.md — .dtc-report/{report.json,report.md} + debug-bundle trigger + help-text (wave 3)
**UI hint**: yes

### Phase 8: Formal Verification — Foundation Hardening & Setup (Gap Closure)
**Goal**: Produce VERIFICATION.md for Phase 2 and Phase 3 — formally document that all executed plans satisfy their success criteria
**Depends on**: Phase 2 (plans executed), Phase 3 (plans executed)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, SETUP-01, SETUP-02, SETUP-03, SETUP-04
**Gap Closure**: Closes gaps from v1-MILESTONE-AUDIT.md — PHASES-2-3-4-7-UNVERIFIED (phases 2 & 3)
**Success Criteria** (what must be TRUE):
  1. `02-VERIFICATION.md` exists with confirmed truths for FOUND-01..04: bin/dtc shim, CHARS_PER_TOKEN=3 + 30% budget guard, EpipeError at 4 LLM stdin sites, wrapToolHandler MCP process.exit guard
  2. `03-VERIFICATION.md` exists with confirmed truths for SETUP-01..04: setup wizard sections, CredentialRegistry preflight wiring, dtc doctor --deep, Firebase project creation flow
  3. REQUIREMENTS.md traceability updated: FOUND-01..04 and SETUP-01..04 marked Verified
**Plans**: 3 plans
  - [x] 08-01-PLAN.md — Write 02-VERIFICATION.md for Phase 2 Foundation Hardening (FOUND-01..04, wave 1)
  - [x] 08-02-PLAN.md — Write 03-VERIFICATION.md for Phase 3 Setup & Diagnostics (SETUP-01..04, wave 1)
  - [x] 08-03-PLAN.md — Update REQUIREMENTS.md traceability table (FOUND-01..04, SETUP-01..04, wave 2)

### Phase 9: Formal Verification — Firebase Integration & Design Parity (Gap Closure)
**Goal**: Produce VERIFICATION.md for Phase 4 and Phase 7 — formally document that all executed plans satisfy their success criteria
**Depends on**: Phase 4 (plans executed), Phase 7 (plans executed)
**Requirements**: FIRE-01, FIRE-02, FIRE-03, FIRE-04, FIRE-05, DESIGN-01, DESIGN-02, DESIGN-03, DESIGN-04, MCP-01, MCP-02, MCP-03, OBS-01, OBS-02, OBS-03
**Gap Closure**: Closes gaps from v1-MILESTONE-AUDIT.md — PHASES-2-3-4-7-UNVERIFIED (phases 4 & 7)
**Success Criteria** (what must be TRUE):
  1. `04-VERIFICATION.md` exists with confirmed truths for FIRE-01..05: AppDelegate + SPM, auth templates (hashed-nonce + REVERSED_CLIENT_ID), data service (Codable + realtime + offline), firebase_provision (idempotent + checkpointed), security lint (hard-fail)
  2. `07-VERIFICATION.md` exists with confirmed truths for DESIGN-01..04, MCP-01..03, OBS-01..03: sanitizeLayerName across 4 adapters, adapter-parity test passing, MCP tools dispatching correctly, manifest gate, cost/debug observability
  3. REQUIREMENTS.md traceability updated: FIRE-01..05, DESIGN-01..04, MCP-01..03, OBS-01..03 marked Verified
**Plans**: 3 plans
  - [x] 09-01-PLAN.md — Write 04-VERIFICATION.md for Phase 4 Firebase Integration (FIRE-01..05, wave 1)
  - [x] 09-02-PLAN.md — Write 07-VERIFICATION.md for Phase 7 Design Parity & Observability (DESIGN-01..04, MCP-01..03, OBS-01..03, wave 1)
  - [x] 09-03-PLAN.md — Update REQUIREMENTS.md traceability table (all 15 REQ-IDs, wave 2)

### Phase 10: Phase 1 Human Verification — Live Branch Protection (Gap Closure)
**Goal**: Execute live branch protection setup and formally close the human_needed items in 01-VERIFICATION.md
**Depends on**: Phase 1 (scripts/setup-branch-protection.sh shipped), repo-admin GitHub auth
**Requirements**: FLOW-01, GATE-02, GATE-03, GATE-04
**Gap Closure**: Closes gaps from v1-MILESTONE-AUDIT.md — FLOW-01 + GATE-03 live confirmation pending
**Success Criteria** (what must be TRUE):
  1. `scripts/setup-branch-protection.sh` run successfully against the authenticated org; main and develop branch protection rules are live (PR required, required status checks: lint/typecheck/vitest + e2e-build + changeset-check, ≥1 code-owner review)
  2. CODEOWNERS confirmed: @rayliu-factory (not @appifex/maintainers placeholder) is the active code owner; branch protection requires_code_owner_reviews=true confirmed via `gh api`
  3. Scratch PR created without a changeset entry → changeset-check fails; changeset added → check passes
  4. `01-VERIFICATION.md` human_verification section updated to `done` for all 4 human_needed items
  5. REQUIREMENTS.md traceability: FLOW-01 and GATE-03 marked Verified
**Plans**: 3 plans
  - [ ] 10-01-PLAN.md — Live branch protection execution: run setup-branch-protection.sh + gh api verification (FLOW-01, GATE-02, GATE-03, wave 1)
  - [ ] 10-02-PLAN.md — Scratch PR gate proof: changeset-check bites + e2e-build hermetic run (GATE-02, GATE-04, wave 1)
  - [ ] 10-03-PLAN.md — Document closure: update 01-VERIFICATION.md + REQUIREMENTS.md traceability (FLOW-01, GATE-02, GATE-03, GATE-04, wave 2)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Open-Source Release Readiness | 11/11 | Complete (human verification pending) | 2026-04-18 |
| 2. Foundation Hardening | 5/5 | Complete (VERIFICATION.md pending — Phase 8) | 2026-04-18 |
| 3. Setup & Diagnostics | 5/5 | Complete (VERIFICATION.md pending — Phase 8) | 2026-04-18 |
| 4. Firebase Integration | 8/8 | Complete (VERIFICATION.md pending — Phase 9) | 2026-04-18 |
| 5. Xcode Archive & TestFlight Upload | 6/6 | Complete | 2026-04-18 |
| 6. Validation Gate Hardening | 8/8 | Complete | 2026-04-18 |
| 7. Design Parity, MCP Surface & Observability | 9/9 | Complete (VERIFICATION.md pending — Phase 9) | 2026-04-18 |
| 8. Formal Verification — Foundation & Setup | 3/3 | Complete (human_needed: Firebase live step inherited from Phase 3) | 2026-04-19 |
| 9. Formal Verification — Firebase & Design Parity | 3/3 | Complete   | 2026-04-18 |
| 10. Phase 1 Human Verification — Live Branch Protection | 0/3 | Not started | - |
