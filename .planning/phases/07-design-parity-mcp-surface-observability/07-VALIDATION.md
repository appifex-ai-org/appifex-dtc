---
phase: 7
slug: design-parity-mcp-surface-observability
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-18
revised: 2026-04-19
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Source of truth for the test harness design is `07-RESEARCH.md` §"Validation Architecture". This file wires each REQ-ID to a concrete test file + command and defines the sampling cadence.
>
> **Revised 2026-04-18:** reconciled with 07-00's three MCP test files (W-02) and dropped the `PipelineView-cost.test.tsx` row that was never planned (W-03).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.0 (existing) |
| **Config file** | `vitest.config.ts` (repo root) — no changes required |
| **Quick run command** | `pnpm test -- --run <glob>` (targets a single changed package) |
| **Full suite command** | `pnpm test && pnpm lint` |
| **Estimated runtime** | Full suite ~60–90s on current hardware; per-package quick-run ~5–15s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run <changed-package-glob>` (quick)
- **After every plan wave:** Run `pnpm test && pnpm lint` (full)
- **Before `/gsd-verify-work`:** Full suite green + zero tsc errors
- **Max feedback latency:** 90 seconds for the full suite; 15 seconds for per-task quick-run

---

## Per-Task Verification Map

> REQ → test file mapping derived from `07-RESEARCH.md` §"Validation Architecture". 12 of 14 test files are **Wave 0 gaps** (create as RED stubs in Wave 0 before implementation). Task IDs will be assigned by the planner; below maps requirements to the test file that must prove each.
>
> **Revision W-02 (2026-04-18):** 07-00 Task 2 creates three MCP test files (one per handler) rather than two bundled files. This map now lists all three. Sign-off section updated accordingly.
>
> **Revision W-03 (2026-04-18):** `cli/__tests__/views/PipelineView-cost.test.tsx` removed — it was never planned in any 07-0X plan (no ink-testing-library dependency in the repo). `cli/__tests__/views-format.test.ts` (from 07-00) remains as the OBS-01 formatter proof; visual Ink-render verification is handled under "Manual-Only Verifications" below.

| REQ-ID | Test File | Wave | Test Type | Automated Command | Status |
|--------|-----------|------|-----------|-------------------|--------|
| DESIGN-01 | `packages/design/__tests__/sanitize.test.ts` | 0 → 1 | unit | `pnpm -F @appifex/design test -- --run sanitize` | ✅ green (3 tests) |
| DESIGN-02 | `packages/design/__tests__/figma-sanitize.test.ts` | 0 → 1 | unit | `pnpm -F @appifex/design test -- --run figma-sanitize` | ✅ green (2 tests) |
| DESIGN-03 | `packages/design/__tests__/stitch-sanitize.test.ts` | 0 → 1 | unit | `pnpm -F @appifex/design test -- --run stitch-sanitize` | ✅ green (1 test) |
| DESIGN-04 | `packages/spec/__tests__/adapter-parity.test.ts` | 0 → 3 | integration | `pnpm -F @appifex/spec test -- --run adapter-parity` | ✅ green (8 tests) |
| DESIGN-04 | `packages/design/__tests__/adapter-parity.test.ts` | 0 → 3 | redirect | `pnpm -F @appifex/design test -- --run adapter-parity` | ✅ green (2 tests) |
| MCP-01 | `packages/mcp-server/__tests__/tools-firebase-provision.test.ts` | 0 → 2 | integration | `pnpm -F @appifex/mcp-server test -- --run tools-firebase-provision` | ✅ green (4 tests) |
| MCP-01 | `packages/mcp-server/__tests__/tools-testflight-upload.test.ts` | 0 → 2 | integration | `pnpm -F @appifex/mcp-server test -- --run tools-testflight-upload` | ✅ green (3 tests) |
| MCP-02 | `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts` | 0 → 2 | integration | `pnpm -F @appifex/mcp-server test -- --run tools-get-pipeline-status` | ✅ green (5 tests) |
| MCP-03 | `packages/core/__tests__/manifest.test.ts` | 0 → 1 | unit | `pnpm -F @appifex/core test -- --run manifest` | ✅ green (8 tests) |
| MCP-03 | `cli/__tests__/manifest-preservation.test.ts` | 0 → 3 | integration | `pnpm -F appifex-dtc test -- --run manifest-preservation` | ✅ green (2 tests) |
| OBS-01 | `packages/core/__tests__/pricing.test.ts` | 0 → 1 | unit | `pnpm -F @appifex/core test -- --run pricing` | ✅ green (13 tests) |
| OBS-01 | `packages/core/__tests__/token-budget.test.ts` | 1 | unit | `pnpm -F @appifex/core test -- --run token-budget` | ✅ green (18 tests) |
| OBS-01 | `cli/__tests__/views-format.test.ts` | 0 → 2 | unit | `pnpm -F appifex-dtc test -- --run views-format` | ✅ green (10 tests) |
| OBS-02 | `packages/report/__tests__/report-writer.test.ts` | 0 → 2 | unit | `pnpm -F @appifex/report test -- --run report-writer` | ✅ green (5 tests; covers cost column + remediation hints) |
| OBS-02 | `cli/__tests__/pipeline-report-writes.test.ts` | 0 → 4 | integration | `pnpm -F appifex-dtc test -- --run pipeline-report-writes` | ✅ green (3 tests) |
| OBS-03 | `packages/core/__tests__/debug-bundle.test.ts` | 0 → 2 | integration | `pnpm -F @appifex/core test -- --run debug-bundle` | ✅ green (14 tests) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Create RED test stubs for the 13 greenfield test files before any implementation in Wave 1+ (revision W-02 — now 13 new files + 2 extensions, up from 12 + 2 to reflect the split of MCP tests into three files):

- [x] `packages/design/__tests__/sanitize.test.ts` — DESIGN-01 sanitization fixture suite (whitespace, emoji, duplicates, Swift/Kotlin reserved words)
- [x] `packages/design/__tests__/figma-sanitize.test.ts` — DESIGN-02 Figma-REST + Figma-Make apply sanitizer and produce equivalent IR
- [x] `packages/design/__tests__/stitch-sanitize.test.ts` — DESIGN-03 Stitch applies sanitizer
- [x] `packages/design/__tests__/adapter-parity.test.ts` — DESIGN-04 filename anchor; redirects to the real spec-package test (revision B-02)
- [x] `packages/design/__tests__/fixtures/parity/` — directory with fixture artifacts (committed)
- [x] `packages/mcp-server/__tests__/tools-firebase-provision.test.ts` — MCP-01 smoke for dtc_firebase_provision (revision W-02)
- [x] `packages/mcp-server/__tests__/tools-testflight-upload.test.ts` — MCP-01 smoke for dtc_testflight_upload (revision W-02)
- [x] `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts` — MCP-02 read .dtc/run-context.json + .dtc/checkpoint.db (revision W-02)
- [x] `packages/core/__tests__/manifest.test.ts` — MCP-03 readManifest/writeManifest/diffManifest round-trip + sha256 + user-edit detection
- [x] `cli/__tests__/manifest-preservation.test.ts` — MCP-03 pipeline-integrated edit/rerun/skip-with-warning
- [x] `packages/core/__tests__/pricing.test.ts` — OBS-01 tokensToUsd with verified pricing; fallback to null for unknown models
- [x] `cli/__tests__/views-format.test.ts` — OBS-01 formatUsd + formatPhaseStatus (revision W-03)
- [x] `packages/report/__tests__/report-writer.test.ts` — OBS-02 cost fields + remediation hints coverage (also covers planned formatters.test.ts extension)
- [x] `cli/__tests__/pipeline-report-writes.test.ts` — OBS-02 pipeline write-site proof
- [x] `packages/core/__tests__/debug-bundle.test.ts` — OBS-03 zip contents + secrets scrubber

Plus two extension files:

- [x] `packages/core/__tests__/token-budget.test.ts` — extended with input/output split assertions + `costUsd(model)` getter tests (18 tests)
- [x] `packages/report/__tests__/report-writer.test.ts` — cost column + remediation hints covered here (planned `formatters.test.ts` merged into report-writer)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual polish of Ink `PipelineView` $USD column (alignment, color emphasis) | OBS-01 | Visual/typography verification requires a live terminal; no ink-testing-library dependency in the repo (revision W-03) | Run `dtc run demo/fixture-pen` and eyeball the per-phase column + footer total; verify readability with 80-col and 120-col terminals |
| Live per-phase USD updates visibly during a multi-phase run | OBS-01 / revision B-05 | The ProgressEmitter stream is tested via `views-format.test.ts` for formatters; the live-update visual itself is user-facing | Run `dtc run` against a fixture project and confirm each phase's USD cell updates to a non-em-dash value as that phase completes |
| `.dtc-debug/bundle-<ts>.zip` is openable in Finder + contents human-scannable | OBS-03 | Automated tests verify structural contents; visual/readability inspection is manual | Trigger a failing run, locate the bundle, unzip, browse `.dtc-debug/*.json` + `report.json`; confirm no secrets leaked |
| Pricing table reflects current vendor rates on release day | OBS-01 / D-13 | The `PRICING_AS_OF` stamp is correctness-by-PR; a human checks the pricing pages at release time | Before tagging v1.0, re-verify Anthropic / OpenAI / Gemini pricing pages and bump `PRICING_AS_OF` + table values if changed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (13 new test files + 2 extensions — revision W-02)
- [x] No watch-mode flags (every command uses `--run`)
- [x] Feedback latency < 90s full suite (actual: ~21s, 175 files)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-19 — all 175 test files pass (1612 tests green, 8 pre-existing skips from earlier phases)

---

## Validation Audit 2026-04-19

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Manual-only | 4 (unchanged) |
| Test files verified | 16 (all planned files present and green) |
| Total tests | 1612 passed, 8 skipped (pre-existing, not phase 7) |
| Suite runtime | ~21s |

**Note:** `packages/report/__tests__/formatters.test.ts` was planned as an extension target but coverage landed in `report-writer.test.ts` instead — OBS-02 cost column and remediation hints are fully covered.
