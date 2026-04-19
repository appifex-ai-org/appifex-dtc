# appifex-dtc

## What This Is

A CLI toolset (`dtc`) that turns design files into production-ready native and web app codebases. It drives a layered codegen pipeline — design → spec → test-gen → codegen → build → validate → fix → deliver — across SwiftUI, Kotlin Compose, React, and React Native targets, with BaaS integration (Firebase/Supabase), mock data services, a validation + LLM-assisted auto-fix loop, and an MCP server so AI agents can orchestrate generation workflows. Built for solo indie devs and founders who want to go from design to a shipped app in one command.

v1.0 hardened the SwiftUI + Firebase path end-to-end: open-source release readiness, foundation bugs fixed, credential wizard, Firebase integration, Xcode archive + TestFlight upload, validation gate, design adapter parity, MCP surface, and observability — all shipped in 5 days across 10 phases.

## Core Value

**Design to TestFlight in one command.** A solo founder with a design file (Pencil, Figma, Stitch) can produce a production-ready SwiftUI + Firebase app deployed to TestFlight, without touching Xcode or Firebase console manually.

## Requirements

### Validated

<!-- Inferred from existing codebase (see .planning/codebase/ARCHITECTURE.md). These capabilities are shipped and working. -->

- ✓ pnpm monorepo with 18 workspace packages organized around a phased pipeline — existing
- ✓ 17-phase pipeline orchestration with `PHASE_ORDER` + checkpoint/resume (`packages/core`, `cli/src/pipeline.ts`) — existing
- ✓ Design input adapters for Pencil (`.pen` via MCP), Stitch, Figma-Make, Figma-REST (`packages/design`) — existing
- ✓ Platform-neutral `PlatformSpec` + `DesignTokens` IR with translators (`packages/spec`) — existing
- ✓ SwiftUI codegen pathway (`packages/codegen`, `packages/build/src/swift*.ts`, `packages/core/skills/swiftui/`) — existing
- ✓ Kotlin Compose codegen pathway (`packages/build/src/kotlin*.ts`, `packages/core/skills/kotlin-compose/`) — existing
- ✓ Firebase + Supabase + Mock BaaS template system (`packages/baas/templates/*`) with auth, data-services, security-lint — existing
- ✓ Mock data service layer with per-platform signature extraction (`packages/mock`, `packages/mock-check`) — existing
- ✓ Test generation: Maestro UI flows + XCTest/Gradle unit tests (`packages/test-gen`) — existing
- ✓ Validation suite: Maestro runner, JUnit parser, semgrep security scan (`packages/validate`) — existing
- ✓ LLM-driven fix loop with deterministic verification (`packages/fix`) — existing
- ✓ Runner port with local / e2b / remote adapters + sidecar HTTP server (`packages/runner`, `sidecar/`) — existing
- ✓ Agent runtime abstraction over Claude / Codex / Gemini CLIs (`packages/agent`) — existing
- ✓ MCP server exposing pipeline stages as tools (`packages/mcp-server`) — existing
- ✓ Ink/React terminal UI with progress views (`cli/src/views/*.tsx`) — existing
- ✓ Apple/Play provisioning client scaffolding (`packages/provision`) — existing
- ✓ GitHub deliver flow with commit/push/PR (`packages/deliver`) — existing

<!-- v1.0 hardened requirements — shipped 2026-04-19 -->
- ✓ Open-source-ready @appifex/* monorepo: git-flow, PR gates, Changesets, commitlint, gitleaks, required CI checks — v1.0
- ✓ Portable `bin/dtc` shim + corrected Swift token density (4→3) + EPIPE guard + MCP process.exit isolation — v1.0
- ✓ `dtc setup --full` credential wizard (Apple ASC, Firebase, LLM) + `CredentialRegistry` preflight + `dtc doctor --deep` — v1.0
- ✓ Firebase SPM integration: AppDelegate, auth templates (email/Apple/Google), typed Firestore data layer, idempotent `firebase_provision` phase, security lint hard-fail — v1.0
- ✓ Xcode archive + TestFlight upload: `js-yaml` project.yml mutator, ASC REST JWT, `xcrun altool` polling, release hygiene, tester group auto-assign (code-verified; live TestFlight run pending) — v1.0
- ✓ Maestro E2E golden-path gate + `fix-context-ranker` locality + Anthropic structured outputs + hard/soft fail split — v1.0
- ✓ `sanitizeLayerName` across all 4 design adapters + adapter-parity fixture suite — v1.0
- ✓ MCP tools: `dtc_firebase_provision`, `dtc_testflight_upload`, `dtc_get_pipeline_status` — v1.0
- ✓ `.dtc-manifest.json` user-edit guard + live cost/USD terminal display + `.dtc-report` + zippable debug bundle — v1.0
- ✓ Live branch protection on main+develop + scratch-PR gate proof — v1.0

### Active

<!-- v2 milestone candidates — post v1.0 live-run verification and known gap remediation -->

- [ ] Live TestFlight delivery confirmed end-to-end against a real Apple Developer account (TF-01..04 human verification)
- [ ] Agent-orchestrated pipeline reaches TestFlight phases (agent path exits at pipeline.ts:3307 before TestFlight)
- [ ] `archiveSwift(success=false)` guard — surface xcodebuild failure instead of silent "Archived (no path)" checkpoint
- [ ] `e2e_gate` added to `FORCE_RERUN_PHASES` — gate re-runs on resume instead of reading stale checkpoint
- [ ] Live Firebase wizard run (`dtc setup firebase` + real Google account) to close SETUP-04 / Phase 3 UAT
- [ ] Kotlin Compose hardening to Play Console equivalent flow
- [ ] BaaS-agnostic adapter abstraction (abstract once Firebase is proven)
- [ ] Supabase hardening on the production path

### Out of Scope

<!-- Explicit v1 boundaries. Most belong to later milestones. -->

- React codegen target — future milestone (breadth comes after depth on SwiftUI is proven)
- React Native codegen target — future milestone (same reason as React)
- Public App Store submission (beyond TestFlight) — human review loop too long for the "one command" promise
- Kotlin Compose hardening to TestFlight-equivalent Play Console flow — future milestone; existing Kotlin path remains as-is
- Supabase hardening — stays supported but not on the v1 production path
- BaaS-agnostic adapter abstraction — deferred; Firebase gets hardened first, then patterns abstracted
- Windows / Linux dev hosts — macOS only (Xcode requirement)
- Public App Store marketing assets generation (screenshots, descriptions) — later milestone
- Hosted documentation site (Docusaurus/Nextra) — README + `docs/` suffices for v1

## Context

**Current state (post v1.0):** The SwiftUI + Firebase hardening path is code-complete across all 10 phases. The CLI is open-source-ready under @appifex/* with full CI gate coverage. Known gaps: TF-01..04 not live-verified (TestFlight upload requires Apple Developer account), agent-orchestrated path exits before TestFlight phases.

**Codebase:** ~50,000 TypeScript LOC across `packages/*/src` + `cli/src`. 242 commits in v1.0 milestone. 666 files changed.

**Target user:** Solo indie developers and founders shipping iOS apps. They tolerate opinionated defaults in exchange for speed. They do not want to hand-configure Xcode, signing certs, provisioning profiles, or Firebase consoles.

**Design input priority:** All four adapters (Pencil, Stitch, Figma-Make, Figma-REST) now at parity — sanitizeLayerName shared, adapter-parity fixture suite passing.

**Agent/MCP context:** MCP server exposes firebase_provision, testflight_upload, get_pipeline_status. Agent-driven path has a known gap (exits before TestFlight phases) — primary target for v2.

**Key ecosystem facts:**
- Apple: App Store Connect API, TestFlight, Xcode signing/provisioning complexity
- Firebase: Auth (email/Apple/Google), Firestore, security rules, Admin SDK for schema inference
- Validation toolchain: Maestro (UI), XCTest (unit), semgrep (security), existing baas-security-lint

## Constraints

- **Tech stack:** TypeScript / pnpm monorepo; Node runtime for CLI; SwiftUI (target platform); Firebase SDKs (target BaaS); Ink + React for terminal UI — locked by existing codebase.
- **Platform:** macOS only for the CLI host (Xcode required for SwiftUI builds).
- **Performance / cost:** Validation → fix loop must converge within a predictable LLM token budget per run. Fix loop already integrates with `TokenBudget` — new work must respect this.
- **Quality posture:** Balanced — a broken "one command" promise is worse than no promise, but ship-fast iteration matters. Bias toward robust validation gates over exhaustive feature breadth.
- **Dependencies:** LLM provider (Anthropic SDK or `claude --print` shell); `gh` CLI for delivery; `xcodebuild` / `xcodegen` on host; Apple Developer account for TestFlight; Firebase project for wiring.
- **Security:** All credentials live in `~/.dtc/config.json`. No secrets committed to generated apps. Firestore rules + semgrep must block ship on hard failures.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| V1 narrows to SwiftUI + Firebase only | Depth before breadth — a broken 4-platform story is worse than one rock-solid platform for solo founders | ✓ Good — hardening delivered in 5 days; Kotlin/React remain future milestones |
| All four design adapters at parity in v1 | Solo founders bring whatever design they have; adapter parity is cheap relative to codegen hardening | ✓ Good — sanitizeLayerName + fixture suite completed in Phase 7 |
| Firebase chosen over Supabase/Convex for v1 hardening | Broadest 4-platform SDK coverage; most mature auth/data story for indies | ✓ Good — Firebase path fully wired; Supabase deferred cleanly |
| Auto-fix = LLM proposer + deterministic verifier loop | Balances power (handle novel failures) with predictability (compile/tests gate every fix) | ✓ Good — Anthropic structured outputs + fix-context-ranker shipped in Phase 6 |
| "Shipped" = TestFlight, not public App Store | TestFlight is automatable; public release requires human review that breaks the "one command" promise | ✓ Good — constraint holds; public App Store stays out of scope |
| MCP server maturity deferred | Agent-driven workflows are the next wedge, not v1; v1 keeps MCP functional but doesn't invest further | ⚠️ Revisit — agent path exits before TestFlight phases; this is a v2 priority gap |
| Full-vision roadmap with narrow v1 milestone | Keeps long-term shape visible (React/RN later) while scoping work commitment tightly | ✓ Good — 10-phase plan executed cleanly |
| js-yaml over regex for project.yml mutation | Type-safe parse/mutate/serialize eliminates brittle regex patching of structured config | ✓ Good — shipped in Phase 5 (TF-02) |
| Changesets in-repo enforcement (no GitHub App) | Keeps entire enforcement surface inside repo with zero third-party dependencies | ✓ Good — changeset-check CI job live and biting |
| archiver v7 for debug-bundle zip | Pure JS, no native deps; zlib level 6 for exit speed over compression | ✓ Good — debug bundle ships in Phase 7 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 after v1.0 milestone*
