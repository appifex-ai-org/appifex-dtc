---
phase: 07-design-parity-mcp-surface-observability
plan: 4b
subsystem: design-parity
tags: [parity, fixtures, extractor, testing, DESIGN-04]
dependency_graph:
  requires:
    - 07-01 (sanitizeLayerName shared module)
    - 07-04a (MCP handlers + registrations)
  provides:
    - DESIGN-04 parity harness (revision B-02, extractor layer)
    - Committed parity fixtures (reference.pen + 3 derived)
    - fixture-gen.ts one-shot derivation script
  affects:
    - packages/spec/__tests__/ (new test file)
    - packages/design/__tests__/ (redirect stub converted)
tech_stack:
  added: []
  patterns:
    - LLM-mocked extractor testing (vi.fn() canned spec JSON)
    - deterministic pen+mcp parity via normalize() deep-equal
    - ratcheted extractor parity (screen count + ids for LLM-based extractors)
key_files:
  created:
    - packages/design/__tests__/fixtures/parity/reference.pen
    - packages/design/__tests__/fixtures/parity/figma-rest.json
    - packages/design/__tests__/fixtures/parity/figma-make.json
    - packages/design/__tests__/fixtures/parity/stitch.zip
    - packages/design/__tests__/fixtures/parity/fixture-gen.ts
    - packages/spec/__tests__/adapter-parity.test.ts
  modified:
    - packages/design/__tests__/adapter-parity.test.ts
decisions:
  - "extractSpecFromFigmaMake and extractSpecFromStitch are LLM-based — cannot produce deterministic cross-extractor deep-equal without mocking; used ratcheted approach (plan Step 6)"
  - "MCP extractor delegates to pen extractor under the hood — hard parity between pen+mcp is trivially achievable and validated"
  - "reference.pen is plain JSON; no live Pencil MCP needed to derive wire-format fixtures"
  - "fixture-gen.ts uses archiver from packages/core node_modules (already a dependency there); no new package.json change needed"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-18"
  tasks_completed: 1
  files_created: 7
  files_modified: 1
  tests_added: 10
  tests_total_after: 1605
---

# Phase 7 Plan 4b: DESIGN-04 Parity Harness (Revision B-02) Summary

Landed the DESIGN-04 extractor-layer parity harness. Committed four fixtures at the extractor-input layer, wrote a one-shot derivation script (not in vitest glob), and added 8 tests to `packages/spec/__tests__/adapter-parity.test.ts` that flip GREEN.

## What Was Built

### Parity Fixtures (Extractor-Input Layer)

`packages/design/__tests__/fixtures/parity/` now contains all four committed fixtures:

| File | Shape | Screen count |
|------|-------|-------------|
| `reference.pen` | PenDocument JSON (Pencil-authored, 32KB) | 5 |
| `figma-rest.json` | FigmaFileResponse JSON | 5 |
| `figma-make.json` | FigmaDesignContext JSON | 5 |
| `stitch.zip` | ZIP of HTML + PNG stubs per screen | 5 |

The fixture-gen.ts script derives the three wire-format fixtures from reference.pen. It reads the pen JSON directly (no live Pencil MCP needed — reference.pen is a plain JSON fixture).

### Pathological Cases Seeded in reference.pen

The Pencil-authored reference.pen contains 5 frames with the following pathological layer names (authored in Task 1):

| Raw frame name | After sanitizeLayerName | Screen ID |
|---------------|------------------------|-----------|
| `HomeScreen` | `homescreen` | `screen-homescreen` |
| `SettingsScreen` | `settingsscreen` | `screen-settingsscreen` |
| `Home Screen` | `homeScreen` | `screen-homeScreen` |
| `Settings` | `settings` | `screen-settings` |
| `🎉 Party` | `party` (emoji stripped) | `screen-party` |

Within the "Home Screen" frame, a child frame named `"class"` becomes `comp-class_` (Swift/Kotlin reserved word suffix). These are all verified by the parity test.

### Extractor Function Names (Revision B-02)

| Extractor | Function | Deterministic? | Input |
|-----------|----------|---------------|-------|
| Pen | `extractSpecFromPen(penJson: string)` | YES | .pen JSON string |
| MCP | `extractSpecFromMcp(batchGetResult, variables)` | YES | batch_get result + variables dict |
| Figma-Make | `extractSpecFromFigmaMake(opts)` | NO — LLM | codeContent + metadata + screenshotPaths |
| Stitch | `extractSpecFromStitch(opts)` | NO — LLM | htmlContents + screenshotPaths |

Critical finding: `extractSpecFromFigmaMake` and `extractSpecFromStitch` both require a `createMessage: CreateMessageFn` callback — they are LLM-vision extractors, not deterministic parsers. Deep-equal parity across all four without mocking is architecturally impossible.

### Normalize() Rules Applied (D-04)

```typescript
function normalize(spec) {
  delete clone.source; delete clone._source; delete clone.raw;  // strip provenance
  clone.screens.sort((a, b) => a.id.localeCompare(b.id))       // sort by id
}
```

### Test Strategy (Ratcheted — Plan Step 6)

The parity test at `packages/spec/__tests__/adapter-parity.test.ts` uses a two-tier strategy:

**Tier 1: Hard deterministic parity (pen ↔ mcp)**
`extractSpecFromMcp` delegates to `extractSpecFromPenObject` under the hood. Normalized deep-equal between `extractSpecFromPen(penJson)` and `extractSpecFromMcp(pen.children, pen.variables)` is guaranteed and verified.

**Tier 2: Structural correctness for LLM-based extractors (figma-make, stitch)**
`createMessage` is mocked with `vi.fn()` returning the canonical pen spec as JSON. Tests verify:
- `result.spec.version === '1.0'`
- `result.spec.screens.length === canonicalSpec.screens.length`
- `result.spec.designTokens` is defined
- LLM was invoked exactly once

**Fixture structure cross-checks**
- figma-rest.json and figma-make.json both contain the same 5 raw screen names as reference.pen

### Test Results

```
packages/spec/__tests__/adapter-parity.test.ts  8 tests — all GREEN
packages/design/__tests__/adapter-parity.test.ts  2 tests — all GREEN (redirect stub)
Total suite: 1605 passing, 8 skipped, 3 todo
```

## Deviations from Plan

### Deviation 1: [Rule 1 - Bug] LLM-based extractor architecture prevents full deep-equal parity

**Found during:** Task 2, Step 3 (writing parity test)
**Issue:** The plan assumed all four extractors were deterministic parsers that could be compared via normalized deep-equal. In fact, `extractSpecFromFigmaMake` and `extractSpecFromStitch` are LLM-vision extractors that require a `createMessage: CreateMessageFn` callback and produce different output on each LLM call. Full cross-extractor deep-equal is architecturally impossible without mocking.
**Fix:** Applied plan Step 6 (ratcheted approach): hard deep-equal between the two deterministic extractors (pen + mcp); structural correctness assertions with mocked LLM for figma-make and stitch. Plan explicitly authorized this fallback.
**Files modified:** `packages/spec/__tests__/adapter-parity.test.ts`

### Deviation 2: figma-rest fixture feeds figma-make extractor, not a separate figma-rest extractor

**Found during:** Task 2, Step 3 (reading figma-rest-client.ts)
**Issue:** The plan described "figma-rest extractor" as a separate surface. In fact, `FigmaRestClient.getDesignContext()` converts FigmaFileResponse → FigmaDesignContext, which then feeds into `extractSpecFromFigmaMake`. There is no separate figma-rest extractor function.
**Fix:** figma-rest.json fixture is committed as documentation of the FigmaFileResponse wire format; the parity test cross-checks fixture structure against reference.pen raw names. No separate figma-rest extractor call in the test.
**Files modified:** `packages/spec/__tests__/adapter-parity.test.ts`

### Deviation 3: fixture-gen.ts uses archiver from packages/core node_modules (lint warning only)

**Found during:** Task 2, Step 2 (running fixture-gen)
**Issue:** `archiver` is listed in `packages/core/package.json` devDependencies but not in `packages/design/package.json`. The fixture-gen.ts script imports `archiver` and gets a lint warning (`import-x/no-unresolved`).
**Fix:** fixture-gen.ts is a one-shot standalone script (not imported by any package). The lint warning is non-blocking and does not affect test execution. No package.json change made — keeping devDependency surface minimal per plan intent. Adding archiver to packages/design would be a meaningful devDep change; the warning-only outcome is acceptable for a scripts-only context.
**Status:** Accepted warning (0 errors, 1 warning — commit succeeded).

## Known Stubs

None — all parity fixtures contain real data derived from reference.pen. The stitch.zip HTML files contain minimal but valid screen content (HTML with screen names). The figma-rest.json and figma-make.json contain complete wire-format shapes with all 5 screens. No placeholder text in the test assertions.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced. Fixture files are read-only test inputs.

## Self-Check

### Created files exist:
- `packages/design/__tests__/fixtures/parity/reference.pen` — FOUND (committed in Task 1)
- `packages/design/__tests__/fixtures/parity/figma-rest.json` — FOUND
- `packages/design/__tests__/fixtures/parity/figma-make.json` — FOUND
- `packages/design/__tests__/fixtures/parity/stitch.zip` — FOUND
- `packages/design/__tests__/fixtures/parity/fixture-gen.ts` — FOUND
- `packages/spec/__tests__/adapter-parity.test.ts` — FOUND

### Commits exist:
- `6a3bba7` — feat(07-4b): add parity fixtures + extractor parity test GREEN (revision B-02) — FOUND

## Self-Check: PASSED
