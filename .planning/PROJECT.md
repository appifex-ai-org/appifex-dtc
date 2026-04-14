# appifex-dtc

## What This Is

A CLI toolset (`dtc`) that turns design files into production-ready native and web app codebases. It drives a layered codegen pipeline — design → spec → test-gen → codegen → build → validate → fix → deliver — across SwiftUI, Kotlin Compose, React, and React Native targets, with BaaS integration (Firebase/Supabase), mock data services, a validation + LLM-assisted auto-fix loop, and an MCP server so AI agents can orchestrate generation workflows. Built for solo indie devs and founders who want to go from design to a shipped app in one command.

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

### Active

<!-- v1 milestone: harden SwiftUI + Firebase path to "design → TestFlight in one command." -->

- [ ] Solo founder runs `dtc` once and gets a TestFlight build from a design file (zero manual Xcode/Firebase console steps)
- [ ] Real Firebase Auth wired in generated app: email/password, Apple Sign In, Google Sign In
- [ ] Real Firestore reads/writes wired in generated app from inferred schema
- [ ] Automated Xcode archive + code signing + TestFlight upload via App Store Connect API
- [ ] Firestore security rules generated + hard-fail on static security lint violations (semgrep + baas-security-lint)
- [ ] End-to-end Maestro flow exercises golden path on simulator against a real dev Firebase project before declaring success
- [ ] All four design adapters (Pencil, Stitch, Figma-Make, Figma-REST) at parity for v1 inputs
- [ ] Validation → LLM fix → deterministic verify loop converges reliably within a predictable token budget
- [ ] Setup wizard / doctor flow guides first-run credential setup (Apple ASC, Firebase project, LLM key)
- [ ] MCP server exposes the hardened SwiftUI+Firebase path so agents can drive the full pipeline

### Out of Scope

<!-- Explicit v1 boundaries. Most belong to later milestones. -->

- React codegen target — future milestone (breadth comes after depth on SwiftUI is proven)
- React Native codegen target — future milestone (same reason as React)
- Public App Store submission (beyond TestFlight) — human review loop too long for the v1 "one command" promise
- Kotlin Compose hardening to TestFlight-equivalent Play Console flow — future milestone; existing Kotlin path remains as-is
- Supabase hardening — stays supported but not on the v1 production path
- BaaS-agnostic adapter abstraction — deferred; Firebase gets hardened first, then patterns abstracted
- Windows / Linux dev hosts — macOS only for v1 (Xcode requirement)
- Public App Store marketing assets generation (screenshots, descriptions) — later milestone

## Context

**Codebase state:** Substantial brownfield project. Pipeline architecture, all 4 design input adapters, SwiftUI + Kotlin Compose codegen, Firebase/Supabase/Mock BaaS templates, MCP server, and LLM fix loop already exist. The work in this milestone is **hardening and end-to-end integration**, not greenfield construction. See `.planning/codebase/` for full architecture, stack, structure, conventions, integrations, testing, and known concerns.

**Target user:** Solo indie developers and founders shipping iOS apps. They tolerate opinionated defaults in exchange for speed. They do not want to hand-configure Xcode, signing certs, provisioning profiles, or Firebase consoles.

**Design input priority:** All four adapters (Pencil, Stitch, Figma-Make, Figma-REST) must reach parity for v1. Pencil has the tightest workspace integration (`.pen` files via the Pencil MCP), but no adapter is treated as second-class.

**Agent/MCP context:** The MCP server is not the primary user-facing surface for v1, but it must expose the hardened SwiftUI+Firebase path so agent-driven workflows (Claude Code, Copilot) can call pipeline stages. Agent workflows become the primary surface in a later milestone.

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
| V1 narrows to SwiftUI + Firebase only | Depth before breadth — a broken 4-platform story is worse than one rock-solid platform for solo founders | — Pending |
| All four design adapters at parity in v1 | Solo founders bring whatever design they have; adapter parity is cheap relative to codegen hardening | — Pending |
| Firebase chosen over Supabase/Convex for v1 hardening | Broadest 4-platform SDK coverage; most mature auth/data story for indies | — Pending |
| Auto-fix = LLM proposer + deterministic verifier loop | Balances power (handle novel failures) with predictability (compile/tests gate every fix) | — Pending |
| "Shipped" = TestFlight, not public App Store | TestFlight is automatable; public release requires human review that breaks the "one command" promise | — Pending |
| MCP server maturity deferred | Agent-driven workflows are the next wedge, not v1; v1 keeps MCP functional but doesn't invest further | — Pending |
| Full-vision roadmap with narrow v1 milestone | Keeps long-term shape visible (React/RN later) while scoping work commitment tightly | — Pending |

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
*Last updated: 2026-04-14 after initialization*
