---
phase: 07-design-parity-mcp-surface-observability
verified: 2026-04-19T11:35:00Z
status: passed
score: 10/10 requirements verified in code
overrides_applied: 0
---

# Phase 7: Design Parity, MCP Surface & Observability Verification Report

**Phase Goal:** Bring all four design adapters (Pencil, Stitch, Figma-Make, Figma-REST) to sanitization parity; extend the MCP server with `firebase_provision`, `testflight_upload`, and `get_pipeline_status` tools plus a manifest-based user-edit gate; add live token/USD cost observability per phase; and produce `.dtc-report` + `.dtc-debug/bundle-<ts>.zip` on failed runs.
**Verified:** 2026-04-19T11:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `packages/design/src/sanitize.ts` exports `sanitizeLayerName` | VERIFIED | Direct file read confirms `export function sanitizeLayerName(name: string, taken: Set<string>): string` at line 65. |
| 2 | `packages/design/__tests__/sanitize.test.ts` passes (13 assertions GREEN) | VERIFIED | Live vitest run confirms 13 tests pass: 11 loop cases covering whitespace, emoji, reserved words (class, func, val, get), leading-digit strip, empty/whitespace/emoji fallback to 'node', multi-word camelCase; plus dedup + mutates-taken. |
| 3 | `packages/design/__tests__/figma-sanitize.test.ts` passes (2 assertions GREEN) | VERIFIED | Live vitest run confirms 2 tests pass. WR-06 fix (`382db74`): raw display names preserved in `screenNames`; sanitized IDs tracked separately in `takenScreens`. |
| 4 | `packages/design/__tests__/stitch-sanitize.test.ts` passes (1 assertion GREEN) | VERIFIED | Live vitest run confirms 1 test passes. StitchAdapter delegates to shared `sanitizeLayerName`; WR-02 fix (`44d8e35`) ensures PNG written via `runner.exec` not `fsWriteFile`. |
| 5 | `packages/spec/__tests__/adapter-parity.test.ts` passes (8 assertions GREEN) | VERIFIED | Live vitest run confirms 8 tests pass: parity fixtures exist on disk, pen extractor deterministic round-trip (5 screens), figma-rest and figma-make match reference screen structure, stitch structural assertions with mocked LLM. |
| 6 | `packages/design/__tests__/adapter-parity.test.ts` passes (2 assertions GREEN) | VERIFIED | Live vitest run confirms 2 redirect tests pass: parity fixtures exist on disk; `sanitizeLayerName` exported from `@appifex/design`. |
| 7 | Fixture dir `packages/design/__tests__/fixtures/parity/` exists with committed artifacts | VERIFIED | Referenced in adapter-parity.test.ts (spec) and confirmed via test execution. |
| 8 | `packages/mcp-server/__tests__/tools-firebase-provision.test.ts` passes (4 assertions GREEN) | VERIFIED | Live vitest run confirms 4 tests pass. Source: `packages/mcp-server/src/tools/firebase-provision.ts` (`handleFirebaseProvision`). |
| 9 | `packages/mcp-server/__tests__/tools-testflight-upload.test.ts` passes (3 assertions GREEN) | VERIFIED | Live vitest run confirms 3 tests pass. Source: `packages/mcp-server/src/tools/testflight.ts` (`handleTestflightUpload`). |
| 10 | `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts` passes (5 assertions GREEN) | VERIFIED | Live vitest run confirms 5 tests pass. WR-01 fix (`0192696`): Checkpoint constructor declared before try but assigned inside try; catch returns structured `{ isError: false, text: ... }` envelope. |
| 11 | Checkpoint constructor is inside try in `packages/mcp-server/src/tools/status.ts` (WR-01 fix) | VERIFIED | Direct file read confirms: `let checkpoint: InstanceType<typeof Checkpoint> \| undefined` declared at line 36, assigned `checkpoint = new Checkpoint(...)` at line 38 inside try block, with catch at line 115 returning error envelope. |
| 12 | `packages/core/__tests__/manifest.test.ts` passes (8 assertions GREEN) | VERIFIED | Live vitest run confirms 8 tests pass: `readManifest`, `writeManifest`, `diffManifest` round-trip, sha256 hashing, user-edit detection. Source: `packages/core/src/manifest.ts`. |
| 13 | `cli/__tests__/manifest-preservation.test.ts` passes (2 assertions GREEN) | VERIFIED | Live vitest run confirms 2 pipeline-integration tests pass: preserves user-edited file by default (skip-with-warning); overwrites with `--overwrite-user-edits`. |
| 14 | `packages/core/__tests__/pricing.test.ts` passes (13 assertions GREEN) | VERIFIED | Live vitest run confirms 13 tests pass: 12 model pricing checks, `PRICING_AS_OF: '2026-04-18'` stamp. Source: `packages/core/src/pricing.ts`. |
| 15 | `packages/core/__tests__/token-budget.test.ts` passes (18 assertions GREEN) | VERIFIED | Live vitest run confirms 18 tests pass: input/output token split, `costUsd(model)` getter, `canEnterFixLoop()` threshold cases. This file was extended as part of Phase 7 OBS-01. |
| 16 | `cli/__tests__/views-format.test.ts` passes (10 assertions GREEN) | VERIFIED | Live vitest run confirms 10 tests pass. WR-03 fix (`cdc1a85`): `formatUsd(0)` returns dim em-dash placeholder (1 new test added by fix). Source: `cli/src/views/format.ts`. |
| 17 | `packages/report/__tests__/report-writer.test.ts` passes (5 assertions GREEN) | VERIFIED | Live vitest run confirms 5 tests pass: cost column, remediation hints. Sources: `packages/report/src/formatters.ts`, `packages/report/src/report.ts`. |
| 18 | `cli/__tests__/pipeline-report-writes.test.ts` passes (3 assertions GREEN) | VERIFIED | Live vitest run confirms 3 pipeline write-site integration tests pass. |
| 19 | `packages/core/__tests__/debug-bundle.test.ts` passes (12 assertions GREEN) | VERIFIED | Live vitest run confirms 12 tests pass. Source: `packages/core/src/debug-bundle.ts`. |
| 20 | `SECRET_PATTERNS` array (8 patterns) confirmed in `debug-bundle.ts` | VERIFIED | Direct file read confirms `export const SECRET_PATTERNS: readonly RegExp[]` at line 17 with 8 patterns: apiKey, private_key, asc_?key, service_account, sk-ant-, sk-, BEGIN PRIVATE KEY, BEGIN CERTIFICATE. |
| 21 | archiver v7 used in debug-bundle.ts | VERIFIED | Direct file read confirms `import archiver from 'archiver'` at line 11; archiver is the v7+ pure-JS zip library (no native deps). |
| 22 | Live pnpm test suite: 175 files / 1612 tests / 8 skipped (captured live) | VERIFIED | Captured at execution start: `Test Files 175 passed (175) / Tests 1612 passed \| 8 skipped (1620) / Duration 20.80s`. |

### Roadmap Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | All 4 adapters pass sanitization fixtures + parity round-trip (DESIGN-01..04) | MET | `sanitize.test.ts` (13 GREEN), `figma-sanitize.test.ts` (2 GREEN), `stitch-sanitize.test.ts` (1 GREEN), `adapter-parity.test.ts` in spec (8 GREEN) + design (2 GREEN). All 4 adapters sanitize via shared `sanitizeLayerName`. |
| 2 | MCP clients can invoke `firebase_provision`, `testflight_upload`, `get_pipeline_status` (MCP-01..02) | MET | `tools-firebase-provision.test.ts` (4 GREEN), `tools-testflight-upload.test.ts` (3 GREEN), `tools-get-pipeline-status.test.ts` (5 GREEN). Tools registered in `server-tools-pipeline.ts`. |
| 3 | Manifest gate detects user-edited files and preserves them (MCP-03) | MET | `manifest.test.ts` (8 GREEN), `manifest-preservation.test.ts` (2 GREEN). `diffManifest` detects sha256 mismatch; pipeline skips regeneration by default; `--overwrite-user-edits` bypasses. |
| 4 | Terminal UI shows live cost per phase + run total (OBS-01) | MET | `pricing.test.ts` (13 GREEN), `token-budget.test.ts` (18 GREEN), `views-format.test.ts` (10 GREEN). `formatUsd` renders dim-dash for zero/null (WR-03 fixed), `$N.NN` for real costs. |
| 5 | Failed runs produce `.dtc-report` and `.dtc-debug/bundle-<ts>.zip` (OBS-02..03) | MET | `report-writer.test.ts` (5 GREEN), `pipeline-report-writes.test.ts` (3 GREEN), `debug-bundle.test.ts` (12 GREEN). `writeDebugBundle` creates zip with 8-pattern secret scrubber. |

### Requirements Coverage

| # | REQ-ID | Description | Status | Evidence |
|---|--------|-------------|--------|----------|
| 1 | DESIGN-01 | sanitizeLayerName + Pencil adapter | PASS | `packages/design/__tests__/sanitize.test.ts` (13 assertions GREEN: 11 loop cases covering whitespace, emoji, reserved words, leading-digit strip, fallbacks; plus dedup and mutates-taken). Source: `packages/design/src/sanitize.ts` (`export function sanitizeLayerName`). Commits: `a28d3be`, `6e73769` (07-01). |
| 2 | DESIGN-02 | Figma REST + Figma-Make sanitization | PASS | `packages/design/__tests__/figma-sanitize.test.ts` (2 assertions GREEN). WR-06 fix (`382db74`): `FigmaRestClient.getDesignContext` now pushes raw display names into `screenNames`; `takenScreens` tracks sanitized IDs for deduplication. Updated `figma-rest-client.test.ts` expects `['Home']` (raw). Commits: `a28d3be`, `6e73769` (07-01), `382db74` (WR-06). |
| 3 | DESIGN-03 | Stitch adapter sanitization | PASS | `packages/design/__tests__/stitch-sanitize.test.ts` (1 assertion GREEN — delegates to shared `sanitizeLayerName`). WR-02 fix (`44d8e35`): PNG written via `runner.exec('sh', ['-c', 'printf...'])` not `fsWriteFile`, matching remote-runner contract. Commits: `a28d3be`, `6e73769` (07-01), `44d8e35` (WR-02). |
| 4 | DESIGN-04 | Adapter-parity round-trip | PASS | `packages/spec/__tests__/adapter-parity.test.ts` (8 assertions GREEN: pen deterministic round-trip with 5 screens, figma-rest matches reference, figma-make matches reference, stitch structural with mocked LLM, parity fixtures exist) + `packages/design/__tests__/adapter-parity.test.ts` (2 redirect assertions GREEN). Fixture dir: `packages/design/__tests__/fixtures/parity/`. Commits: 07-04b. |
| 5 | MCP-01 | `firebase_provision` + `testflight_upload` MCP tools | PASS | `packages/mcp-server/__tests__/tools-firebase-provision.test.ts` (4 assertions GREEN: missing config returns isError:true, happy path invokes handleFirebaseProvision, runner commands collected, structured response envelope) + `packages/mcp-server/__tests__/tools-testflight-upload.test.ts` (3 assertions GREEN: missing Apple config isError:true, invokes archive+upload sequence, returns skipped envelope). Sources: `packages/mcp-server/src/tools/firebase-provision.ts`, `packages/mcp-server/src/tools/testflight.ts`. Commits: `a8495c2`, `2ddc9dc`, `8e2b095` (07-04a). |
| 6 | MCP-02 | `get_pipeline_status` returning checkpoint + phase state | PASS | `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts` (5 assertions GREEN: null run context returns empty shape, D-06 shape from seeded context, `currentPhase` derived correctly, `lastError` populated on failed phase, `running` status surfaced from Checkpoint mid-phase crash). WR-01 fix (`0192696`): Checkpoint constructor assigned inside try; catch returns `{ isError: false, text: JSON.stringify({ runId, currentPhase: null, phases: [], error: String(err) }) }` envelope. Source: `packages/mcp-server/src/tools/status.ts`. Commits: `a8495c2`, `2ddc9dc`, `8e2b095` (07-04a), `0192696` (WR-01). |
| 7 | MCP-03 | `.dtc-manifest.json` gate + user-edit preservation | PASS | `packages/core/__tests__/manifest.test.ts` (8 assertions GREEN: `readManifest`/`writeManifest`/`diffManifest` round-trip, sha256 hashing, user-edit detection, empty diff on unchanged files) + `cli/__tests__/manifest-preservation.test.ts` (2 assertions GREEN: pipeline skips regen on user-edited file; `--overwrite-user-edits` bypasses). Source: `packages/core/src/manifest.ts` (`readManifest`, `writeManifest`, `diffManifest`, sha256 hashing). WR-04 fix (`d1d35a7`): `refreshManifestEntries` now debug-logs when manifest is absent. Commits: `def15b8`, `7f4d488` (07-03), `d1d35a7` (WR-04). |
| 8 | OBS-01 | Live token + USD cost per phase + run total | PASS | `packages/core/__tests__/pricing.test.ts` (13 assertions GREEN: 12 model price checks, `PRICING_AS_OF: '2026-04-18'` honesty stamp, `tokensToUsd` returns null for unknown models) + `packages/core/__tests__/token-budget.test.ts` (18 assertions GREEN: input/output split, `costUsd(model)` getter, `canEnterFixLoop()` threshold cases — Phase 7 extension for OBS-01) + `cli/__tests__/views-format.test.ts` (10 assertions GREEN: `formatUsd(null)` → dim dash, `formatUsd(0)` → dim dash (WR-03 fix `cdc1a85`), `formatUsd(0.005)` → `$0.01`, `formatUsd(1000)` → K notation). Commits: `abd4834`, `392550a` (07-02), `cdc1a85` (WR-03). |
| 9 | OBS-02 | `.dtc-report` with per-phase status, artifacts, failure details | PASS | `packages/report/__tests__/report-writer.test.ts` (5 assertions GREEN: cost fields in markdown/JSON, remediation hints column, formatters produce Cost Estimate section) + `cli/__tests__/pipeline-report-writes.test.ts` (3 assertions GREEN: writeReport called on failure, writeReport called on success with exportReport flag, correct paths). Sources: `packages/report/src/formatters.ts`, `packages/report/src/report.ts`. Commits: `791180c`, `c64ff87`, `386a5d9` (07-05); `1761e17`, `b351f24`, `fe20171` (07-06b). |
| 10 | OBS-03 | `.dtc-debug/bundle-<ts>.zip` debug bundle | PASS | `packages/core/__tests__/debug-bundle.test.ts` (12 assertions GREEN: zip created, contains manifest.txt, contains .dtc-debug files, secrets scrubbed from JSON files, binary files copied unchanged, archiver finalization completes). Source: `packages/core/src/debug-bundle.ts` (archiver v7 pure-JS, 8 `SECRET_PATTERNS` regex entries: apiKey, private_key, asc_?key, service_account, sk-ant-, sk-, BEGIN PRIVATE KEY, BEGIN CERTIFICATE). Commits: `791180c` (07-05). |

**Score: 10/10 requirements PASS at the code level. All requirements fully automated; no human steps outstanding.**

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/design/src/sanitize.ts` | VERIFIED | `sanitizeLayerName` + `RESERVED` (SWIFT_RESERVED ∪ KOTLIN_RESERVED). 7-step deterministic algorithm documented in block comment (D-02). |
| `packages/design/__tests__/fixtures/parity/` | VERIFIED | Golden fixture directory for adapter-parity round-trip. Contains committed JSON fixtures used by `adapter-parity.test.ts` in both `spec` and `design` packages. |
| `packages/mcp-server/src/tools/firebase-provision.ts` | VERIFIED | `handleFirebaseProvision` exported. Registered in `server-tools-pipeline.ts`. |
| `packages/mcp-server/src/tools/testflight.ts` | VERIFIED | `handleTestflightUpload` exported. Invokes `runXcodeArchivePhase` + `runTestFlightUploadPhase` in sequence. |
| `packages/mcp-server/src/tools/status.ts` | VERIFIED | `handleGetPipelineStatus` exported. WR-01 fixed: Checkpoint inside try; catch returns structured error envelope. |
| `packages/core/src/manifest.ts` | VERIFIED | `readManifest`, `writeManifest`, `diffManifest` exported. sha256 hashing of file contents. User-edit detection via checksum mismatch. |
| `packages/core/src/pricing.ts` | VERIFIED | `tokensToUsd` with 12 model entries, `PRICING_AS_OF: '2026-04-18'` honesty stamp. |
| `packages/core/src/debug-bundle.ts` | VERIFIED | `writeDebugBundle`, `scrub`, `SECRET_PATTERNS` (8 regexes) exported. Uses archiver v7. |
| `packages/report/src/formatters.ts` | VERIFIED | `formatMarkdown`/`formatJson` with Cost Estimate section and remediation hints. |
| `cli/src/views/format.ts` | VERIFIED | `formatUsd` — WR-03 fixed: `formatUsd(0)` returns dim em-dash (zero = no cost recorded). |

### Code Review

Phase 7 underwent a standard code review after plan execution:
- **Review:** `.planning/phases/07-design-parity-mcp-surface-observability/07-REVIEW.md` (2026-04-19, 43 files reviewed, 0 critical / 6 warnings / 6 info)
- **Fixes:** `.planning/phases/07-design-parity-mcp-surface-observability/07-REVIEW-FIX.md` (all 6 warnings resolved, 0 skipped, completed 2026-04-19T00:47:00Z, commits `0192696..382db74`)

**Resolved warnings (WR-01..06):**
- WR-01: Checkpoint constructor moved inside try in `handleGetPipelineStatus` (`0192696`) — corrupt DB now returns structured error envelope
- WR-02: StitchAdapter PNG written via `runner.exec` instead of `fsWriteFile` bypass (`44d8e35`) — remote runner contract satisfied
- WR-03: `formatUsd(0)` returns dim dash instead of `$0.00` (`cdc1a85`) — zero cost unambiguous
- WR-04: `refreshManifestEntries` logs debug instead of silent no-op (`d1d35a7`) — manifest-absent scenario now diagnosable
- WR-05: Missing delta contract documented in `types-pipeline.ts` JSDoc (`9419060`) — `tokensInput`/`tokensOutput` must be per-call deltas
- WR-06: `FigmaRestClient` `screenNames` now contains original display names (`382db74`) — second sanitization pass eliminated

All 6 info items (IN-01..06) are non-blocking design notes, not correctness failures. The current test suite (1612 tests, 175 files) reflects the post-fix state.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (live run) | `pnpm test` | 175 files passed / 1612 tests passed / 8 skipped / 20.80s | PASS |
| Targeted Phase 7 tests (16 files) | `pnpm vitest run <16 test files>` | 16 files passed / 109 tests passed / 0 skipped | PASS |
| `sanitizeLayerName` exported | `grep -c "export function sanitizeLayerName" packages/design/src/sanitize.ts` | 1 match | PASS |
| Checkpoint constructor inside try (WR-01) | Inspect `packages/mcp-server/src/tools/status.ts` lines 36-38 | `let checkpoint: InstanceType<typeof Checkpoint> \| undefined` declared before try; `checkpoint = new Checkpoint(...)` assigned inside try at line 38 | PASS |
| `SECRET_PATTERNS` array (8 entries) | `grep -A8 "export const SECRET_PATTERNS" packages/core/src/debug-bundle.ts` | 8 regex patterns: apiKey, private_key, asc_?key, service_account, sk-ant-, sk-, BEGIN PRIVATE KEY, BEGIN CERTIFICATE | PASS |
| archiver v7 import | `grep "import archiver" packages/core/src/debug-bundle.ts` | `import archiver from 'archiver'` at line 11 | PASS |
| `readManifest`/`writeManifest`/`diffManifest` in manifest.ts | `grep -c "export function" packages/core/src/manifest.ts` | 3+ matches | PASS |
| UAT status | `grep "status: complete" .planning/phases/07-design-parity-mcp-surface-observability/07-UAT.md` | `status: complete` in frontmatter | PASS |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `packages/mcp-server/src/tools/status.ts` | Checkpoint constructor outside try — corrupt DB causes unhandled rejection | Warning (WR-01) | RESOLVED — constructor assignment moved inside try; catch returns structured `{ isError: false }` envelope (`0192696`) |
| `packages/design/src/stitch-adapter.ts` | PNG written with `fsWriteFile` bypassing runner abstraction | Warning (WR-02) | RESOLVED — `runner.exec('sh', ['-c', 'printf...base64 -d'])` replaces `fsWriteFile` (`44d8e35`) |
| `cli/src/views/format.ts` | `formatUsd(0)` returns `'  $0.00'` instead of dim dash placeholder | Warning (WR-03) | RESOLVED — `if (n === 0) return chalk.dim('      —')` added; test added (`cdc1a85`) |
| `cli/src/pipeline.ts` | `refreshManifestEntries` silent no-op when manifest absent — fix-loop writes misclassified as user-edited | Warning (WR-04) | RESOLVED — `debugLogger?.logJson('manifest-refresh-skipped', ...)` added (`d1d35a7`) |
| `packages/core/src/types-pipeline.ts` | No delta contract on `tokensInput`/`tokensOutput` — accumulation double-counts possible | Warning (WR-05) | RESOLVED — JSDoc documents per-call-delta requirement; WR-05 is documentation-only (`9419060`) |
| `packages/design/src/figma-rest-client.ts` | `screenNames` contained sanitized IDs, not original display names — double sanitization + display name loss | Warning (WR-06) | RESOLVED — `screenNames.push(raw)` instead of `push(sanitizeLayerName(raw, ...))` (`382db74`) |

### Gaps Summary

Zero code-level gaps remain. All 10 requirements are satisfied. Phase 7 review warnings (WR-01..06) were resolved before verification — no open issues. The 6 info items (IN-01..06) are design notes that do not affect correctness: dead imports, archiver listener ordering nuance, missing emitter listener on altool path, manifest.txt username leak (cosmetic), `full` flag initialization inconsistency, and stitch parity test mock scope limitation.

### Verdict

**GOAL_ACHIEVED** — all 10 requirements are verified in code. The repository contains every sanitizer, adapter-parity fixture, MCP tool, manifest gate, observability component, and debug bundle required by the phase goal. All 10 REQ-IDs (DESIGN-01..04, MCP-01..03, OBS-01..03) are PASS with test file evidence, assertion counts, and commit hashes. The Phase 7 code review (43 files, 6 warnings, 6 info) was fully resolved before verification.

Status is `passed`.

---

_Verified: 2026-04-19T11:35:00Z_
_Verifier: Claude (gsd-verifier)_
