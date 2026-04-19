---
phase: 07-design-parity-mcp-surface-observability
plan: 0
subsystem: test-infrastructure
tags: [wave-0, red-stubs, tdd, design-parity, mcp, observability]
dependency_graph:
  requires: []
  provides:
    - DESIGN-01/02/03/04 RED test stubs
    - MCP-01/02 RED test stubs
    - MCP-03 RED test stubs
    - OBS-01/02/03 RED test stubs
  affects:
    - packages/design/__tests__/
    - packages/mcp-server/__tests__/
    - packages/core/__tests__/
    - packages/report/__tests__/
    - cli/__tests__/
tech_stack:
  added: []
  patterns:
    - Wave-0 RED stubs with @ts-expect-error on missing module imports
    - it.todo / it.skip for deferred fixture-dependent tests
    - Phase-numbered comment headers on all new test files
key_files:
  created:
    - packages/design/__tests__/sanitize.test.ts
    - packages/design/__tests__/figma-sanitize.test.ts
    - packages/design/__tests__/stitch-sanitize.test.ts
    - packages/design/__tests__/adapter-parity.test.ts
    - packages/design/__tests__/fixtures/parity/README.md
    - packages/mcp-server/__tests__/tools-firebase-provision.test.ts
    - packages/mcp-server/__tests__/tools-testflight-upload.test.ts
    - packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts
    - packages/core/__tests__/pricing.test.ts
    - packages/core/__tests__/manifest.test.ts
    - packages/core/__tests__/debug-bundle.test.ts
    - packages/report/__tests__/report-writer.test.ts
    - cli/__tests__/manifest-preservation.test.ts
    - cli/__tests__/views-format.test.ts
    - cli/__tests__/pipeline-report-writes.test.ts
  modified: []
decisions:
  - RED stubs use @ts-expect-error on missing-module imports (not ts-ignore) — precision suppression, removed when implementation lands
  - figma-sanitize.test.ts and stitch-sanitize.test.ts use assertion-level RED (modules exist, outputs don't match yet) rather than import-level RED — appropriate because the adapter files exist but don't yet apply sanitization
  - adapter-parity.test.ts uses import-level RED (sanitizeLayerName import from @appifex/design triggers Cannot find package for @modelcontextprotocol/sdk) plus it.todo/it.skip for fixture-dependent cases
  - manifest-preservation.test.ts uses it.todo (deferred to Plan 06 when pipeline gate wires) but also has RED import for @appifex/core manifest functions
  - pipeline-report-writes.test.ts uses it.todo (deferred to Plan 05/06) with formatJson import from @appifex/report (module exists; RED comes from missing write-site wiring)
  - fixture-gen.ts deferred to Plan 04 as documented in parity/README.md
metrics:
  duration: ~25m
  completed_date: "2026-04-18"
  tasks_completed: 3
  files_created: 15
---

# Phase 7 Plan 0: Wave 0 RED Test Stubs Summary

**One-liner:** 12 RED test stubs + 1 fixture directory placeholder establish the Nyquist checkpoint for all 10 Phase 7 REQ-IDs before any implementation begins.

## What Was Built

Wave 0 creates exactly 13 new files (12 test files + 1 README placeholder) that cover every requirement in Phase 7:

### Task 1 — Design Parity Stubs (DESIGN-01/02/03/04)

**`packages/design/__tests__/sanitize.test.ts`** (DESIGN-01/02/03 shared algorithm)
- 11 table-of-cases from 07-RESEARCH.md §"Sanitization Rules" including emoji drop, reserved-word suffix, leading-digit strip, empty fallback
- Deduplication assertion (`homeScreen` → `homeScreen_2`)
- `taken` set mutation assertion
- RED: `@ts-expect-error` import of `sanitizeLayerName` from `@appifex/design` triggers `Cannot find package @modelcontextprotocol/sdk`

**`packages/design/__tests__/figma-sanitize.test.ts`** (DESIGN-02)
- `FigmaRestClient` stub: pathological screen names `['🏠 Home', 'class', 'Home Screen', 'Home Screen']` → expects `['home', 'class_', 'homeScreen', 'homeScreen_2']`
- `FigmaMakeAdapter` stub: same names via `FigmaMcpClientLike` stub
- RED at assertion level: adapters return unsanitized names until Plan 01 wires sanitizer

**`packages/design/__tests__/stitch-sanitize.test.ts`** (DESIGN-03)
- `StitchAdapter` stub: same pathological names via mocked `StitchClientLike`
- RED at assertion level: adapter returns empty `screenIds` until Plan 01 wires sanitizer

**`packages/design/__tests__/adapter-parity.test.ts`** (DESIGN-04)
- `it.todo('all four adapters produce structurally equivalent IR...')`
- `it.skip('normalization strips raw names and provenance before diff')` — comment: "unskip in Plan 04"
- `sanitizeLayerName` import forces RED at module-load time (filename anchor for VALIDATION.md traceability)
- Wave 2 comment noting fixture dependency

**`packages/design/__tests__/fixtures/parity/README.md`**
- Placeholder noting binary fixtures + fixture-gen.ts deferred to Plan 04
- Documents the `*.test.ts` glob exclusion requirement for fixture-gen.ts

### Task 2 — MCP Tool Stubs (MCP-01, MCP-02)

**`packages/mcp-server/__tests__/tools-firebase-provision.test.ts`** (MCP-01 firebase leg)
- 3 tests: missing `config.firebase.projectId` → isError, happy path invokes `runFirebaseProvision`, throws → JSON envelope with `success: false`
- RED: `handleFirebaseProvision` import from `../src/tools/firebase-provision.js` (module missing)

**`packages/mcp-server/__tests__/tools-testflight-upload.test.ts`** (MCP-01 testflight leg)
- 3 tests: missing `config.apple` → isError, archive + upload sequence with feed-through assertion, skipped-archive envelope with `runTestFlightUploadPhase` not called
- RED: `handleTestflightUpload` import from `../src/tools/testflight.js` (module missing)

**`packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts`** (MCP-02)
- 4 tests: null context → `{runId: null, currentPhase: null, phases: []}`, D-06 shape from seeded context, `currentPhase` derivation from running phase, `lastError` from failed phase
- `vi.mock('@appifex/core', ...)` pattern matching `pipeline-tools.test.ts`
- RED: `handleGetPipelineStatus` import from `../src/tools/status.js` (module missing)

### Task 3 — Core, Report, CLI Stubs (MCP-03, OBS-01/02/03)

**`packages/core/__tests__/pricing.test.ts`** (OBS-01)
- 11 golden vectors from 07-RESEARCH.md §"Token → USD Math" including all 12 model entries
- `PRICING_AS_OF === '2026-04-18'` honesty stamp assertion
- RED: `tokensToUsd`/`PRICING_USD_PER_MTOK`/`PRICING_AS_OF` import from `../src/pricing.js` (module missing)

**`packages/core/__tests__/manifest.test.ts`** (MCP-03)
- 8 tests: round-trip, null-when-missing, null-on-corrupt-JSON, null-when-version≠1, `diffManifest` detects modified file via sha256, detects missing file, returns empty arrays when unchanged, excluded globs not tracked
- RED: `readManifest`/`writeManifest`/`diffManifest` import from `../src/manifest.js` (module missing)

**`packages/core/__tests__/debug-bundle.test.ts`** (OBS-03)
- 7 tests: bundle path under `.dtc-debug/`, size > 0, zip contains expected entries, scrubber redacts `sk-ant-`, `sk-` (OpenAI), `"apiKey": "..."`, `"private_key": ...`, PEM `-----BEGIN PRIVATE KEY-----` block, does NOT include bundle itself
- RED: `writeDebugBundle` import from `../src/debug-bundle.js` (module missing)

**`packages/report/__tests__/report-writer.test.ts`** (OBS-02)
- 5 tests: `buildReport` with Phase 7 cost fields → fields populated on report, `formatMarkdown` → `## Cost Estimate` section, `**Prices as of:**` line, remediation hints for failures, `formatJson` round-trips cost fields
- RED at assertion level: existing `buildReport`/`formatMarkdown` don't carry Phase 7 fields yet

**`cli/__tests__/manifest-preservation.test.ts`** (MCP-03 integration)
- `it.todo('preserves user-edited file by default (skip-with-warning)')` — finalized in Plan 06
- `it.todo('overwrites user-edited file when --overwrite-user-edits is passed')` — finalized in Plan 06
- RED: `readManifest`/`writeManifest`/`diffManifest` import from `@appifex/core` (symbols missing)

**`cli/__tests__/views-format.test.ts`** (OBS-01)
- 7 `formatUsd` tests: null/undefined → dim `—`, `0.234` → `$0.23`, `1.23` → `$1.23`, `12.34` → `$12.34`, `1500` → `$1.5K`, `0.005` → `$0.01`
- 2 `formatPhaseStatus` tests: includes `42,318 tok` + `$0.23` when both provided, omits cost when `costUsd` undefined
- RED: `formatUsd` import from `../src/views/format.js` (function missing) + chalk dep unavailable in worktree context

**`cli/__tests__/pipeline-report-writes.test.ts`** (OBS-02 pipeline write-site)
- 3 `it.todo` stubs: `report.json` exists after report phase, `report.md` exists, `report.json` matches PipelineReport schema
- RED: `formatJson` import from `@appifex/report` anchors to future write-site wiring (Plan 05/06)

## Deviations from Plan

### Auto-handled variations

**1. [Rule 1 — Bug] adapter-parity.test.ts uses import-level RED rather than @ts-expect-error**
- **Found during:** Task 1
- **Issue:** Plan specified `import { sanitizeLayerName } from '@appifex/design'` with a `@ts-expect-error`. However, `@appifex/design` exists and exports many symbols — the import of `@appifex/design` itself succeeds at the TypeScript level; only the missing export `sanitizeLayerName` triggers a TS error. The `@ts-expect-error` suppresses the TS error but vitest still hits `Cannot find package @modelcontextprotocol/sdk` at runtime via `@appifex/design`'s barrel.
- **Fix:** Added `// @ts-expect-error` before the import, retained the import. RED is achieved via runtime module resolution error, not TypeScript type error.
- **Files modified:** `packages/design/__tests__/adapter-parity.test.ts`

**2. [Rule 2 — Deviation] figma-sanitize.test.ts and stitch-sanitize.test.ts are assertion-level RED, not import-level RED**
- **Found during:** Task 1
- **Rationale:** `FigmaRestClient`, `FigmaMakeAdapter`, and `StitchAdapter` all exist and are importable. The RED condition is that they don't yet apply sanitization — so the assertions fail with wrong values, not with module-not-found errors. This is the correct RED posture for these stubs: they test behavior that Plan 01 will implement.
- **Impact:** None — tests are RED as required by the plan.

**3. [Rule 1 — Clarification] haiku-4-5 pricing: $1.00 input (not $0.80)**
- **Found during:** Task 3, pricing.test.ts
- **Issue:** The CONTEXT.md D-13 sketch showed `claude-haiku-4-5: { input: 0.80, output: 4.00 }` which matches haiku-3-5. But 07-RESEARCH.md §"Pattern 4" table shows `claude-haiku-4-5: { input: 1.00, output: 5.00 }`. The research file is authoritative per CONTEXT §D-13 ("planner implements from that table").
- **Fix:** pricing.test.ts asserts `tokensToUsd('claude-haiku-4-5', 1_000_000, 0) === 1.00` per 07-RESEARCH.md line 467.
- **Files modified:** `packages/core/__tests__/pricing.test.ts`

## Confirmation: fixture-gen.ts deferred to Plan 04

`packages/design/__tests__/fixtures/parity/fixture-gen.ts` was **not** created. The README.md at `packages/design/__tests__/fixtures/parity/README.md` documents this deferral and the vitest glob exclusion requirement. Plan 04 (Wave 3) will commit `reference.pen`, `stitch.zip`, `figma-rest.json`, `figma-make.json`, and `fixture-gen.ts` together.

## REQ-ID Coverage

| REQ-ID | Test File | RED Status |
|--------|-----------|-----------|
| DESIGN-01 | `packages/design/__tests__/sanitize.test.ts` | Cannot find package (import-level) |
| DESIGN-02 | `packages/design/__tests__/figma-sanitize.test.ts` | Assertion-level fail |
| DESIGN-03 | `packages/design/__tests__/stitch-sanitize.test.ts` | Assertion-level fail |
| DESIGN-04 | `packages/design/__tests__/adapter-parity.test.ts` | Cannot find package (import-level) |
| MCP-01 | `packages/mcp-server/__tests__/tools-firebase-provision.test.ts` | Cannot find module |
| MCP-01 | `packages/mcp-server/__tests__/tools-testflight-upload.test.ts` | Cannot find module |
| MCP-02 | `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts` | Cannot find module |
| MCP-03 | `packages/core/__tests__/manifest.test.ts` | Cannot find module |
| MCP-03 | `cli/__tests__/manifest-preservation.test.ts` | Cannot find module (via @appifex/core) |
| OBS-01 | `packages/core/__tests__/pricing.test.ts` | Cannot find module |
| OBS-01 | `cli/__tests__/views-format.test.ts` | Cannot find module (formatUsd missing) |
| OBS-02 | `packages/report/__tests__/report-writer.test.ts` | Assertion-level fail (Phase 7 fields absent) |
| OBS-02 | `cli/__tests__/pipeline-report-writes.test.ts` | 3 todos (write-site deferred) |
| OBS-03 | `packages/core/__tests__/debug-bundle.test.ts` | Cannot find module |

## Commits

- `de92e34` — `test(07-00): RED stubs for design parity (DESIGN-01/02/03/04)`
- `421595e` — `test(07-00): RED stubs for MCP tools (MCP-01, MCP-02)`
- `22aa216` — `test(07-00): RED stubs for core modules, report, and cli (MCP-03, OBS-01/02/03)`

## Self-Check: PASSED

All 16 files verified as present. All 3 task commits verified in git log.

| Check | Result |
|-------|--------|
| `packages/design/__tests__/sanitize.test.ts` | FOUND |
| `packages/design/__tests__/figma-sanitize.test.ts` | FOUND |
| `packages/design/__tests__/stitch-sanitize.test.ts` | FOUND |
| `packages/design/__tests__/adapter-parity.test.ts` | FOUND |
| `packages/design/__tests__/fixtures/parity/README.md` | FOUND |
| `packages/mcp-server/__tests__/tools-firebase-provision.test.ts` | FOUND |
| `packages/mcp-server/__tests__/tools-testflight-upload.test.ts` | FOUND |
| `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts` | FOUND |
| `packages/core/__tests__/pricing.test.ts` | FOUND |
| `packages/core/__tests__/manifest.test.ts` | FOUND |
| `packages/core/__tests__/debug-bundle.test.ts` | FOUND |
| `packages/report/__tests__/report-writer.test.ts` | FOUND |
| `cli/__tests__/manifest-preservation.test.ts` | FOUND |
| `cli/__tests__/views-format.test.ts` | FOUND |
| `cli/__tests__/pipeline-report-writes.test.ts` | FOUND |
| Commit `de92e34` | FOUND |
| Commit `421595e` | FOUND |
| Commit `22aa216` | FOUND |
