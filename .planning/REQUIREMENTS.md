# Requirements — appifex-dtc v1

**Milestone goal:** Design to TestFlight in one command — SwiftUI + Firebase.

## v1 Requirements

### Open-Source Release Readiness

- [ ] **REPO-01**: Repo hygiene landed — `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and GitHub issue/PR templates under `.github/`
- [x] **REPO-02**: Secret scanning clean — `gitleaks` runs in pre-commit (via husky/lefthook) and in CI; historical repo scanned, any findings remediated
- [x] **REPO-03**: Conventional Commits + Changesets — `@changesets/cli` configured, commitlint enforces Conventional Commits, every PR requires a changeset entry
- [ ] **REPO-04**: Public documentation — README with install + quickstart; `docs/` with getting-started, CLI reference, and contributing guide (no hosted docs site in v1)
- [ ] **NPM-01**: Workspace packages rebranded under `@appifex/*` scope; `package.json` publish metadata (`publishConfig.access=public`, repository, homepage, keywords, license) set for every published package
- [x] **NPM-02**: GitHub Actions release workflow publishes to npm via `changesets/action` on merge to `main` (provenance enabled, `NPM_TOKEN` from secrets)
- [x] **FLOW-01**: git-flow branching live — `main` (protected, production), `develop` (protected, integration), `feature/*`, `release/*`, `hotfix/*`; branch protection rules enforce PR + checks + review before merge to `main` and `develop`
- [x] **GATE-01**: Required CI check — lint (ESLint + Prettier) + typecheck (`tsc --noEmit`) + `vitest run` — must pass before merge
- [x] **GATE-02**: Required CI check — `dtc` pipeline E2E smoke (fixture design → simulator build) — must pass before merge to `develop`/`main`
- [x] **GATE-03**: `CODEOWNERS` in place; branch protection requires ≥1 approving review from a repo admin/code owner before merge
- [x] **GATE-04**: PR check — every PR must include a changeset entry (enforced by `changesets/action` PR check); PRs without one fail the gate

### Foundation Hardening

- [x] **FOUND-01**: `bin/dtc` resolves correctly on every install (replace absolute symlink with relative/shim so the CLI works on non-dev machines)
- [x] **FOUND-02**: Token estimator reflects real Swift token density (`CHARS_PER_TOKEN` corrected from 4 to 3) and the fix loop reserves at least 30% of the token budget for remediation
- [x] **FOUND-03**: Pipeline hard-fails on EPIPE during LLM I/O (no silent truncation of large prompts)
- [x] **FOUND-04**: Pipeline wrapped in a subprocess boundary so `process.exit(...)` calls within pipeline code cannot kill the MCP host process

### Setup & Diagnostics

- [x] **SETUP-01**: `dtc setup --full` wizard captures Apple ASC key + issuer, Firebase project selection, LLM provider key, and Google/Apple OAuth client IDs end-to-end in one flow
- [x] **SETUP-02**: `CredentialRegistry` runs in `preflight.ts` and fails fast (before any LLM spend) with per-credential status of OK / MISSING / INVALID / EXPIRED
- [x] **SETUP-03**: `dtc doctor` checks presence and validity of `firebase-tools` CLI, the Firebase service-account JSON, and the ASC API key file, in addition to existing tool checks
- [x] **SETUP-04**: Wizard can create a new Firebase project (not only link an existing one) and auto-link the iOS app, downloading `GoogleService-Info.plist` into the project tree

### Firebase Integration

- [x] **FIRE-01**: Generated SwiftUI apps use `@UIApplicationDelegateAdaptor` with a Firebase-configured `AppDelegate`; Firebase SDK pulled via SPM only
- [x] **FIRE-02**: Generated auth supports email/password, Sign In with Apple (correct hashed-nonce handling), and Google Sign In (with `REVERSED_CLIENT_ID` URL scheme auto-injected into `project.yml`)
- [x] **FIRE-03**: Generated data layer exposes typed Firestore `Codable` models, realtime listeners, and offline caching from the inferred `BaasSchema`
- [x] **FIRE-04**: New `firebase_provision` pipeline phase creates/links the Firebase project, ensures the iOS app is registered, downloads `GoogleService-Info.plist`, deploys Firestore security rules via `firebase-admin`, and seeds collections — idempotent, skippable via checkpoint
- [x] **FIRE-05**: Security lint blocks ship on rules that allow cross-user reads (enforces `resource.data.ownerId == request.auth.uid` ownership pattern, `deny`-all default, and passes a generated cross-user denial test)

### TestFlight / Distribution

- [ ] **TF-01**: New `testflight_upload` pipeline phase archives the app and uploads to TestFlight via `xcrun altool --upload-package` using ASC REST JWT auth (no dependency on the community `asc` CLI)
- [ ] **TF-02**: XcodeGen `project.yml` is mutated via `js-yaml` (parse/mutate/serialize) — no regex patching — when injecting Firebase SPM deps, entitlements, and URL schemes
- [ ] **TF-03**: Archive pipeline injects release hygiene: `ITSAppUsesNonExemptEncryption=false`, auto-incremented build number with collision guard, and `DEBUG_INFORMATION_FORMAT=dwarf-with-dsym` so dSYMs upload for symbolication
- [ ] **TF-04**: Uploaded builds are auto-assigned to a configured TestFlight internal testing group and an internal-tester invite is issued

### Validation & Fix Loop

- [x] **VAL-01**: Maestro E2E golden-path flow runs on simulator against the real dev Firebase project (auth sign-in → Firestore read/write round-trip) before a TestFlight upload is attempted (code-verified Phase 6; live-run human UAT pending in 06-HUMAN-UAT.md)
- [x] **VAL-02**: Fix loop selects context by modified-screens / failing-test locality (reuses `packages/analysis/src/modified-screens.ts`) instead of first-20 indiscriminate glob (Phase 6)
- [x] **VAL-03**: LLM fix loop uses Anthropic structured outputs beta for the fix response schema, removing the custom `===FIX:===` delimiter parser (Phase 6)
- [x] **VAL-04**: Validation gate splits hard-fail (security lint + semgrep → block ship, no override) from soft-fail (Maestro + unit tests → block unless `--skip-validation-gate` is passed) (Phase 6)

### Design Adapter Parity

- [x] **DESIGN-01**: Pencil adapter handles pathological layer names (whitespace, emoji, duplicates, reserved words) via a shared sanitization step, verified by fixture tests
- [x] **DESIGN-02**: Figma REST and Figma-Make adapters pass the same layer-name sanitization fixtures and produce equivalent IR
- [x] **DESIGN-03**: Stitch adapter passes the same layer-name sanitization fixtures and produces equivalent IR
- [x] **DESIGN-04**: Golden-fixture IR consistency test: one reference design round-trips through all four adapters and produces structurally equivalent `PlatformSpec` + `DesignTokens`

### MCP / Agent Surface

- [x] **MCP-01**: MCP server exposes `dtc_firebase_provision` and `dtc_testflight_upload` tools matching the new pipeline phases
- [x] **MCP-02**: MCP server exposes `dtc_get_pipeline_status` returning checkpoint + phase state so agents recover context across session resets
- [x] **MCP-03**: Pipeline writes `.dtc-manifest.json` listing generated files (with hashes); manifest is read on subsequent runs so user-edited files are detected and preserved

### Observability

- [x] **OBS-01**: Terminal UI surfaces live token + USD cost per phase and a run-total summary
- [x] **OBS-02**: Each run produces a structured `.dtc-report` with per-phase status, artifacts, failure details, and remediation hints
- [x] **OBS-03**: Failed runs export a zippable debug bundle (`.dtc-debug/bundle-<ts>.zip`) containing logs, LLM prompts, LLM outputs, and checkpoint snapshot

## v2 / Deferred

<!-- Deferred table stakes that didn't make v1 scope. -->

- Kotlin Compose hardening to a Play Console TestFlight-equivalent flow
- BaaS-agnostic adapter abstraction (abstract once Firebase is proven)
- Supabase hardening on the production path
- Fastlane Match integration for CI-based signing
- Magic Link / Phone SMS auth templates
- Multi-region Firebase project support
- Hosted documentation site (Docusaurus/Nextra/similar) — README + `docs/` suffices for v1

## Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **React codegen target** — future milestone; depth before breadth on SwiftUI.
- **React Native codegen target** — future milestone.
- **Public App Store submission** — human review breaks the "one command" promise; TestFlight is the terminal.
- **Windows / Linux dev hosts** — macOS only in v1 (Xcode required).
- **Visual editor / design preview server** — the simulator is the preview; avoid Bolt/Lovable-style scope creep.
- **AI that rewrites arbitrary existing code outside the pipeline's generated surface** — fix loop stays scoped to pipeline outputs.
- **App Store marketing assets generation** — later milestone.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| REPO-01 | Phase 1 | Pending |
| REPO-02 | Phase 1 | Complete |
| REPO-03 | Phase 1 | Complete |
| REPO-04 | Phase 1 | Pending |
| NPM-01 | Phase 1 | Pending |
| NPM-02 | Phase 1 | Complete |
| FLOW-01 | Phase 1 → Phase 10 (gap closure) | Verified |
| GATE-01 | Phase 1 | Complete |
| GATE-02 | Phase 1 → Phase 10 (gap closure) | Verified |
| GATE-03 | Phase 1 → Phase 10 (gap closure) | Verified |
| GATE-04 | Phase 1 → Phase 10 (gap closure) | Verified |
| FOUND-01 | Phase 2 → Phase 8 (gap closure) | Verified |
| FOUND-02 | Phase 2 → Phase 8 (gap closure) | Verified |
| FOUND-03 | Phase 2 → Phase 8 (gap closure) | Verified |
| FOUND-04 | Phase 2 → Phase 8 (gap closure) | Verified |
| SETUP-01 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| SETUP-02 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| SETUP-03 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| SETUP-04 | Phase 3 → Phase 8 (gap closure) | Verified (code-level; SETUP-04 human step pending) |
| FIRE-01 | Phase 4 → Phase 9 (gap closure) | Verified |
| FIRE-02 | Phase 4 → Phase 9 (gap closure) | Verified |
| FIRE-03 | Phase 4 → Phase 9 (gap closure) | Verified |
| FIRE-04 | Phase 4 → Phase 9 (gap closure) | Verified (code-level; FIRE-04 human Firebase provisioning step pending) |
| FIRE-05 | Phase 4 → Phase 9 (gap closure) | Verified |
| TF-01 | Phase 5 | Pending |
| TF-02 | Phase 5 | Pending |
| TF-03 | Phase 5 | Pending |
| TF-04 | Phase 5 | Pending |
| VAL-01 | Phase 6 | Verified (code) / human UAT pending |
| VAL-02 | Phase 6 | Verified |
| VAL-03 | Phase 6 | Verified |
| VAL-04 | Phase 6 | Verified |
| DESIGN-01 | Phase 7 → Phase 9 (gap closure) | Verified |
| DESIGN-02 | Phase 7 → Phase 9 (gap closure) | Verified |
| DESIGN-03 | Phase 7 → Phase 9 (gap closure) | Verified |
| DESIGN-04 | Phase 7 → Phase 9 (gap closure) | Verified |
| MCP-01 | Phase 7 → Phase 9 (gap closure) | Verified |
| MCP-02 | Phase 7 → Phase 9 (gap closure) | Verified |
| MCP-03 | Phase 7 → Phase 9 (gap closure) | Verified |
| OBS-01 | Phase 7 → Phase 9 (gap closure) | Verified |
| OBS-02 | Phase 7 → Phase 9 (gap closure) | Verified |
| OBS-03 | Phase 7 → Phase 9 (gap closure) | Verified |

---
*Last updated: 2026-04-19 after Phase 10 (Live Branch Protection Confirmation) — FLOW-01, GATE-02, GATE-03, GATE-04 marked Verified following live branch protection execution and scratch-PR gate confirmation*
