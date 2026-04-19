# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP (Design to TestFlight in one command)

**Shipped:** 2026-04-19
**Phases:** 10 | **Plans:** 61 | **Commits:** 242
**Timeline:** 5 days (2026-04-14 → 2026-04-19)
**Source TypeScript:** ~50,000 LOC

### What Was Built

- **Open-source-ready monorepo** — 19 @appifex/* packages, git-flow, PR gates, Changesets, commitlint, gitleaks, required CI (lint/typecheck/vitest + E2E smoke + changeset-check), live branch protection
- **Foundation hardening** — portable bin/dtc shim, corrected Swift token density (4→3), EPIPE guard, MCP process.exit isolation
- **Credential wizard + doctor** — `dtc setup --full`, CredentialRegistry preflight, Firebase project creation wizard, `dtc doctor --deep`
- **Firebase integration** — SPM AppDelegate, email/Apple/Google auth templates (hashed-nonce + REVERSED_CLIENT_ID), typed Codable Firestore data layer, idempotent firebase_provision phase, security lint hard-fail
- **Xcode archive + TestFlight upload** — js-yaml project.yml mutator, ASC REST JWT, xcrun altool polling, release hygiene injection
- **Validation gate** — Maestro E2E golden-path, fix-context-ranker locality, Anthropic structured outputs fix schema, hard/soft fail split
- **Design parity + MCP + observability** — sanitizeLayerName across 4 adapters, adapter-parity fixture suite, 3 MCP tools, manifest gate, live USD cost display, .dtc-report + zippable debug bundle
- **Formal verification** — VERIFICATION.md for all 10 phases, full REQUIREMENTS.md traceability

### What Worked

- **Wave-based execution within phases** — staging plans into waves (wave 0 = red test stubs, wave 1-N = implementation) made each phase independently verifiable and prevented integration surprises
- **Gap-closure phases (8, 9, 10)** — treating verification and live confirmation as first-class phases rather than afterthoughts produced a clean audit trail and surfaced real gaps (agent path exits before TestFlight)
- **Decimal phase numbering** — quick task insertion without renumbering kept execution history coherent (e.g., quick task 260417-tzh landed without disrupting Phase 4)
- **Ports-and-adapters kept test isolation cheap** — Runner, AgentAdapter, and SkillProvider interfaces meant fixture tests didn't need real Firebase/Apple credentials
- **js-yaml over regex for project.yml** — avoided fragile regex patching that would have broken on comments or reordered keys; decision paid off immediately on first test of REVERSED_CLIENT_ID injection

### What Was Inefficient

- **TF-01..04 not live-verified** — Phase 5 code is complete but no real Apple Developer account run was performed; this deferred the hardest integration risk to v2
- **Agent path exits before TestFlight** — discovered in the audit, not during implementation; would have been caught earlier with an integration test that exercises the full agent-orchestrated flow end-to-end
- **Verification gap phases (8-9-10) were necessary** — but could have been avoided with earlier per-phase verification gates; formal verification shouldn't be its own multi-phase effort
- **REQUIREMENTS.md stale checkboxes** — REPO-01, REPO-04, NPM-01 remained unchecked despite being complete; tracking drift costs time at milestone close

### Patterns Established

- **Wave 0 = RED test stubs (Nyquist compliance)** — every phase starts with failing tests for all success criteria before writing implementation code; this prevents the "tests written after the fact" anti-pattern
- **VERIFICATION.md per phase** — each phase gets a formal verification document before the milestone closes; this is now a mandatory artifact
- **HUMAN-UAT.md for live-run gates** — separates automated verification (can be done in CI) from human-needed steps (require real accounts/hardware); makes deferred items explicit rather than implicit
- **Phase-numbered change markers in code** — `// Phase N (REQ-ID): ...` comments anchor non-obvious decisions to planning artifacts; prevents context loss across sessions
- **Safety commit before deletions** — archive files committed before `git rm REQUIREMENTS.md` creates a durable checkpoint; if anything fails post-delete, state is recoverable

### Key Lessons

1. **Ship the hardest integration first** — TestFlight upload requires a real Apple Developer account; this should be live-verified in Phase 5, not deferred. The "one command" promise can't be validated without it.
2. **Agent-path coverage needs an explicit integration test** — the agent path exiting before TestFlight phases was invisible until the milestone audit; add an agent-orchestrated E2E test in v2 that exercises the full pipeline.
3. **Formal verification is cheaper when done per-phase** — writing VERIFICATION.md immediately after each phase (not in batch at the end) catches gaps while context is fresh and avoids multi-phase verification sprints.
4. **Require status checks before marking requirements complete** — REQUIREMENTS.md checkboxes should be updated atomically with the plan that closes them; stale tracking creates noise at close time.
5. **Brownfield hardening is faster than greenfield** — the existing pipeline architecture absorbed all 10 phases without structural changes; the constraint of "no new abstractions beyond what the task requires" held.

### Cost Observations

- Model mix: primarily Sonnet 4.6 (workhorse for all plan execution), Opus for complex architectural decisions
- Sessions: ~15-20 agent sessions across 5 days
- Notable: wave-based execution within phases kept individual agent context windows manageable; no session ran out of context

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Plans | Key Change |
|-----------|---------|--------|-------|------------|
| v1.0 | 242 | 10 | 61 | First milestone — established wave-based execution, gap-closure phases, Nyquist compliance |

### Cumulative Quality

| Milestone | Source TS LOC | Files Changed | Verification Coverage |
|-----------|--------------|---------------|----------------------|
| v1.0 | ~50,000 | 666 | 10/10 phases with VERIFICATION.md |

### Top Lessons (Verified Across Milestones)

1. Live-run verification of the "one command" promise is the highest-value test — automate it as early as possible
2. Gap-closure phases produce cleaner audit trails than retroactive patching
