# Milestones — appifex-dtc

## v1.0 MVP (2026-04-19)

**Status:** ✅ SHIPPED
**Phases:** 1-10
**Plans:** 61 total
**Timeline:** 2026-04-14 → 2026-04-19 (5 days)
**Commits:** 242
**Files changed:** 666 | **Lines added:** 95,673
**Source TypeScript:** ~50,000 LOC

### Delivered

Hardened the SwiftUI + Firebase path from brownfield baseline to a publishable, open-source-ready CLI. A solo founder can run `dtc` once and get a Firebase-wired SwiftUI app archived and uploaded to TestFlight — no manual Xcode or Firebase Console steps.

### Key Accomplishments

1. **Open-source-ready @appifex/* monorepo** — rebranded 19 packages, git-flow + PR gates, Changesets release workflow, commitlint, gitleaks, required CI checks (lint/typecheck/vitest + E2E smoke + changeset-check), live branch protection on main+develop (Phase 1 + Phase 10)
2. **Foundation bugs fixed** — portable `bin/dtc` shim, corrected Swift token density (4→3 chars/token), EPIPE hard-fail at 4 LLM stdin sites, MCP `process.exit` isolation via `wrapToolHandler` (Phase 2)
3. **Credential wizard + doctor** — `DtcConfig` extensions, `CredentialRegistry` preflight, `dtc setup --full` sectioned wizard, Firebase project creation + iOS app registration + plist download, `dtc doctor --deep` (Phase 3)
4. **Firebase integration** — SPM `AppDelegate`, typed auth templates (email/Apple/Google + hashed-nonce + REVERSED_CLIENT_ID), Codable Firestore data layer with realtime + offline cache, idempotent `firebase_provision` phase, security lint hard-fail blocking ship on cross-user reads or missing deny-all (Phase 4)
5. **Xcode archive + TestFlight upload** — `js-yaml` `project.yml` mutator, ASC REST JWT, `xcrun altool` polling loop, release hygiene auto-injection (encryption flag + build-number guard + dSYM), internal tester group auto-assignment (Phase 5)
6. **Validation gate hardened** — Maestro E2E golden-path on simulator against real Firebase project, `fix-context-ranker` locality ranking, Anthropic structured-outputs beta for fix schema, hard/soft fail split (security lint + semgrep block; Maestro + unit tests bypassable via `--skip-validation-gate`) (Phase 6)
7. **Design parity + MCP surface + observability** — `sanitizeLayerName` across all 4 adapters, adapter-parity fixture suite, 3 new MCP tools (`dtc_firebase_provision`, `dtc_testflight_upload`, `dtc_get_pipeline_status`), `.dtc-manifest.json` user-edit guard, live token/USD cost in terminal UI, `.dtc-report` + zippable debug bundle (Phase 7)
8. **Formal verification** — `VERIFICATION.md` for all 10 phases; full REQUIREMENTS.md traceability (Phases 8-9-10)

### Known Gaps

Requirements with code shipped but no live run performed:
- **TF-01..04** — testflight_upload phase implemented (Phase 5, 6/6 plans), not live-verified against real Apple Developer account + TestFlight group
- **SETUP-04, FIRE-04, VAL-01** — wizard Firebase creation, live provision run, Maestro on real Firebase: code present, human UAT pending

Known integration warnings (from v1.0 audit):
- Agent-orchestrated pipeline exits before TestFlight phases (pipeline.ts:3307) — agent users cannot currently complete the full flow
- `archiveSwift(success=false)` not guarded — silent "Archived (no path)" checkpoint on xcodebuild failure
- `e2e_gate` not in `FORCE_RERUN_PHASES` — gate skipped on resume

### Archive

- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
