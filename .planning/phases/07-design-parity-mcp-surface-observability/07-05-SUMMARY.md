---
phase: 07-design-parity-mcp-surface-observability
plan: 5
subsystem: observability
tags: [wave-2, debug-bundle, format-usd, pipeline-view, report-writer, OBS-01, OBS-02, OBS-03]
dependency_graph:
  requires:
    - 07-00 (RED stubs: debug-bundle.test.ts, views-format.test.ts, report-writer.test.ts)
    - 07-02 (pricing table + TokenBudget extension)
    - 07-03 (manifest module)
  provides:
    - writeDebugBundle + scrub + SECRET_PATTERNS (packages/core/src/debug-bundle.ts)
    - formatUsd helper + PhaseState tokens/costUsd extension (cli/src/views/format.ts)
    - ProgressEvent revision B-05 type extension (tokensInput/tokensOutput/costUsd)
    - PipelineView PHASE_ORDER import (Pitfall 2 fix) + live costUsd read (revision B-05 read-side)
    - BuildReportInput + PipelineReport cost fields (packages/report/src/report.ts)
    - formatMarkdown Cost Estimate section + REMEDIATION_HINTS (packages/report/src/formatters.ts)
  affects:
    - packages/core/src/debug-bundle.ts (NEW)
    - packages/core/src/types-pipeline.ts (extended)
    - packages/core/src/index.ts (barrel updated)
    - packages/core/package.json (archiver dep added)
    - cli/src/views/format.ts (extended)
    - cli/src/views/PipelineView.tsx (PHASE_ORDER import + cost read-side)
    - packages/report/src/report.ts (extended)
    - packages/report/src/formatters.ts (Cost Estimate + remediation hints)
tech_stack:
  added:
    - archiver ^7.0.1 (streaming zip writer, pure JS, no native deps)
    - "@types/archiver ^7.0.0"
  patterns:
    - Streaming zip via archiver.pipe(writeStream) + archive.finalize() + stream close await
    - Secret scrub on text files only (TEXT_EXTENSIONS set); binary copied unchanged
    - zlib level 6 (Pitfall 4 — exit speed over compression ratio)
    - PHASE_ORDER single-source-of-truth import (replaces hardcoded PIPELINE_PHASES)
    - Additive optional fields on ProgressEvent (revision B-05 — backward compatible)
    - REMEDIATION_HINTS static lookup keyed by failure class
key_files:
  created:
    - packages/core/src/debug-bundle.ts
  modified:
    - packages/core/package.json
    - packages/core/src/index.ts
    - packages/core/src/types-pipeline.ts
    - packages/core/__tests__/debug-bundle.test.ts
    - cli/src/views/format.ts
    - cli/src/views/PipelineView.tsx
    - packages/report/src/report.ts
    - packages/report/src/formatters.ts
    - pnpm-lock.yaml
decisions:
  - "archiver v7.0.1 chosen for streaming zip (pure JS, no native deps, maintains Node >=14 engine requirement)"
  - "listFilesRecursive uses readdir() + stat() instead of readdir({withFileTypes:true}) to avoid TypeScript Dirent buffer-type mismatch (Node16 moduleResolution issue)"
  - "Remediation hints added to platform results even without fixResult — test expects hints on plain validation failures, not just unresolvedFailures in fixResult"
  - "PIPELINE_PHASES kept as deprecated alias (= PHASE_ORDER) for existing external consumers; marked for cleanup"
  - "ProgressEvent costUsd uses event.costUsd ?? existing.costUsd fallback — write-side (pipeline emitting values) lands in 07-06b"
  - "[Rule 1 - Bug] debug-bundle.test.ts self-exclusion test: unzip -l outputs archive path in header line; fixed by slicing header line before checking entries"
metrics:
  duration: ~8m
  completed_date: "2026-04-18"
  tasks_completed: 4
  files_created: 1
  files_modified: 8
---

# Phase 7 Plan 5: Observability Modules — Debug Bundle, USD Format, Report Writer Extensions Summary

**One-liner:** debug-bundle.ts with 8 SECRET_PATTERNS + archiver v7 zip writer, formatUsd right-aligned 7-char helper, ProgressEvent revision B-05 cost fields, PipelineView PHASE_ORDER import + live costUsd read-side, and @appifex/report Cost Estimate section + REMEDIATION_HINTS — flips all three Wave 0 stubs GREEN.

## What Was Built

### Task 1: packages/core/src/debug-bundle.ts (NEW, ~130 lines)

Streaming zip writer for failed-run debug bundles.

**SECRET_PATTERNS (8 patterns):**
| Pattern | Matches |
|---------|---------|
| `/"?apiKey"?\s*[:=]\s*['"][^'"]+['"]/gi` | JSON/YAML `"apiKey": "secret"` |
| `/"?private_key"?\s*[:=]\s*['"][^'"]+['"]/gi` | Firebase service-account key fields |
| `/asc_?key/gi` | ASC key references |
| `/service_account/gi` | service-account string mentions |
| `/sk-ant-[a-zA-Z0-9_-]{10,}/g` | Anthropic API keys |
| `/sk-[a-zA-Z0-9_-]{20,}/g` | OpenAI API keys |
| `/-----BEGIN (?:RSA \|EC )?PRIVATE KEY-----[\s\S]*?-----END[^-]*-----/g` | PEM private key blocks |
| `/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g` | PEM certificate blocks |

**Zip contents:**
- `debug/<relative>` — all files under `.dtc-debug/` (text scrubbed, binary unchanged)
- `.dtc/run-context.json`, `.dtc/checkpoint.db`, `.dtc-report/report.json`, `.dtc-report/report.md` — auxiliary files (when present)
- `manifest.txt` — provenance (timestamp, reason, outputDir)
- Bundle zip itself excluded from its own contents

**zlib level 6** (Pitfall 4 — user cares about exit speed, not maximum compression)

### Task 2: cli/src/views/format.ts (EXTENDED)

**formatUsd width spec (7-char right-aligned field):**
| Input | Output | Rule |
|-------|--------|------|
| `null` / `undefined` | `chalk.dim('      —')` | dim em-dash placeholder |
| `0` | `'  $0.00'` | normal zero |
| `0.005` | `'  $0.01'` | sub-penny rounds to $0.01 |
| `0.234` | `'  $0.23'` | standard 2 decimal |
| `1.23` | `'  $1.23'` | standard |
| `12.34` | `' $12.34'` | standard |
| `1500` | `'  $1.5K'` | compact thousands |
| `12500` | `' $12.5K'` | compact thousands |

**PhaseState extended:** `tokens?: number`, `costUsd?: number | null` (both optional, backward compatible).

**formatPhaseStatus enriched:** `42,318 tok  $0.23` inline when tokens/costUsd present; empty when absent.

### Task 3: types-pipeline.ts + PipelineView.tsx (EXTENDED — revision B-05)

**ProgressEvent new fields (additive, all optional):**
```typescript
tokensInput?: number   // input tokens for this phase
tokensOutput?: number  // output tokens for this phase
costUsd?: number       // USD cost, omitted when model unknown
```

**PipelineView changes:**
- `import { PHASE_ORDER } from '@appifex/core'` (Pitfall 2 fix — eliminates stale 16-entry hardcoded list)
- `PIPELINE_PHASES = PHASE_ORDER` deprecated alias kept for existing consumers
- Phase state update reads `event.tokensInput + event.tokensOutput` or falls back to `event.tokensUsed`
- `costUsd: event.costUsd ?? existing.costUsd` — live per-phase cost from ProgressEvent (write-side in 07-06b)
- `totalCostUsd` state accumulates on `completed` events with `costUsd`
- Footer shows `Total: X tok / $X.XX` when `totalCostUsd !== undefined`

### Task 4: packages/report/src/report.ts + formatters.ts (EXTENDED)

**BuildReportInput + PipelineReport new optional fields:**
```typescript
tokenUsageBreakdown?: Partial<Record<PhaseId, { input: number; output: number }>>
costUsdPerPhase?: Partial<Record<PhaseId, number | null>>
costUsdTotal?: number | null
model?: string
pricingAsOf?: string
```

**formatMarkdown Cost Estimate section sample:**
```markdown
## Cost Estimate

**Model:** claude-sonnet-4-6
**Prices as of:** 2026-04-18

| Phase | Tokens (in/out) | USD |
|-------|-----------------|-----|
| codegen | 12,000 / 30,318 | $0.49 |
| fix | 8,000 / 104 | $0.03 |

**Total:** $0.52
```

**REMEDIATION_HINTS classes:**
| Class | Hint |
|-------|------|
| `maestro` | Check device/simulator state and Maestro logs under .dtc-debug/maestro/. |
| `unit` | Run the failing test locally via `pnpm vitest run <path>` for interactive debugging. |
| `security-lint` | Review generated security.rules for cross-user reads; see 04-CONTEXT FIRE-05. |
| `semgrep` | Review semgrep findings in .dtc-debug/semgrep/. Hard-fail cannot be bypassed. |
| `parity` | A design adapter produced IR that does not match the Pencil-authoritative fixture. |
| `baas` | Check ~/.dtc/config.json firebase.projectId + serviceAccountKeyPath. |

## Test Results

| Test File | Before | After |
|-----------|--------|-------|
| `packages/core/__tests__/debug-bundle.test.ts` | 9 RED | 9 GREEN |
| `cli/__tests__/views-format.test.ts` | 9 RED | 9 GREEN |
| `packages/report/__tests__/report-writer.test.ts` | 5 RED | 5 GREEN |
| `packages/report/__tests__/report.test.ts` | 4 GREEN | 4 GREEN (no regression) |
| `packages/core/__tests__/pricing.test.ts` | 13 GREEN | 13 GREEN (no regression) |

Total: 40/40 GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] debug-bundle.test.ts: self-exclusion test always fails due to unzip -l header**
- **Found during:** Task 1 (first test run)
- **Issue:** The `unzip -l` command outputs `Archive: /path/to/bundle-<ts>.zip` as the first line. The test checked `listing.not.toContain(bundleFileName)` against the full output — which always fails because the archive path appears in the header, not as a zip entry.
- **Fix:** Changed test assertion to skip the first line (`listing.split('\n').slice(1).join('\n')`) before checking entries only.
- **Files modified:** `packages/core/__tests__/debug-bundle.test.ts`
- **Commit:** 791180c

**2. [Rule 1 - Bug] listFilesRecursive: TypeScript Dirent type mismatch with Node16 moduleResolution**
- **Found during:** Task 1 (tsc check)
- **Issue:** `readdir(dir, { withFileTypes: true })` returns `Dirent<string>[]` in newer Node types but TypeScript under Node16 moduleResolution expects `Dirent<NonSharedBuffer>[]` — type mismatch error.
- **Fix:** Switched to `readdir(dir)` (returns string[]) + `stat(full)` for directory/file discrimination.
- **Files modified:** `packages/core/src/debug-bundle.ts`
- **Commit:** 791180c

**3. [Rule 2 - Missing functionality] Remediation hints needed on plain validation failures (not only fixResult.unresolvedFailures)**
- **Found during:** Task 4 (test run)
- **Issue:** The `report-writer.test.ts` remediation test builds a report with validation failures but no `fixResult`. The plan's action only added hints inside `pr.fixResult.unresolvedFailures` loop, but the test exercises a path without fixResult.
- **Fix:** Added a pre-fixResult block that emits REMEDIATION_HINTS for platforms where ui/unit/security tests fail even when no fixResult is present.
- **Files modified:** `packages/report/src/formatters.ts`
- **Commit:** 386a5d9

## Pitfall 2 Resolution

`PipelineView` previously hardcoded a 16-entry `PIPELINE_PHASES: PhaseId[]` array that drifted from `PHASE_ORDER` in `run-context.ts`. This plan:
1. Adds `import { PHASE_ORDER } from '@appifex/core'` to PipelineView.tsx
2. Replaces all internal uses of `PIPELINE_PHASES` with `PHASE_ORDER`
3. Keeps `export const PIPELINE_PHASES = PHASE_ORDER` as a deprecated alias for external consumers

## Known Stubs

- **PipelineView costUsd write-side** — The view reads `event.costUsd` from ProgressEvent (revision B-05 read-side complete), but the pipeline does not yet emit `costUsd` on ProgressEvents. That wiring lands in 07-06b. When no `costUsd` is emitted, `totalCostUsd` stays `undefined` and the footer total line is hidden (correct behavior per spec).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | packages/core/src/debug-bundle.ts | Zip file written to `.dtc-debug/` which is in the project output dir; user controls sharing. T-07-05-01 mitigated by 8 SECRET_PATTERNS. T-07-05-02 mitigated by relative-path-only entry names via `relative()`. |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 791180c | feat(07-05): create debug-bundle.ts with archiver + secrets scrubber (OBS-03) |
| 2 | c64ff87 | feat(07-05): extend format.ts with formatUsd + PhaseState tokens/costUsd (OBS-01) |
| 3 | bc23033 | feat(07-05): extend ProgressEvent + wire PipelineView USD column (OBS-01 revision B-05) |
| 4 | 386a5d9 | feat(07-05): extend @appifex/report with cost fields + formatMarkdown Cost Estimate (OBS-02) |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `packages/core/src/debug-bundle.ts` exists | FOUND |
| `grep 'writeDebugBundle' packages/core/src/index.ts` | FOUND |
| `grep '"archiver"' packages/core/package.json` | FOUND |
| `grep '"@types/archiver"' packages/core/package.json` | FOUND |
| `grep 'level: 6' packages/core/src/debug-bundle.ts` | FOUND |
| `grep 'sk-ant-' packages/core/src/debug-bundle.ts` | FOUND |
| `grep 'BEGIN' packages/core/src/debug-bundle.ts` | FOUND |
| `grep 'export function formatUsd' cli/src/views/format.ts` | FOUND |
| `grep 'tokens?: number' cli/src/views/format.ts` | FOUND |
| `grep 'tokensInput' packages/core/src/types-pipeline.ts` | FOUND |
| `grep 'tokensOutput' packages/core/src/types-pipeline.ts` | FOUND |
| `grep 'costUsd' packages/core/src/types-pipeline.ts` | FOUND |
| `grep "import.*PHASE_ORDER.*from '@appifex/core'" cli/src/views/PipelineView.tsx` | FOUND |
| `grep 'formatUsd' cli/src/views/PipelineView.tsx` | FOUND |
| `grep 'event.costUsd' cli/src/views/PipelineView.tsx` | FOUND |
| `grep 'costUsdPerPhase' packages/report/src/report.ts` | FOUND |
| `grep '## Cost Estimate' packages/report/src/formatters.ts` | FOUND |
| `grep 'REMEDIATION_HINTS' packages/report/src/formatters.ts` | FOUND |
| Commit 791180c | FOUND |
| Commit c64ff87 | FOUND |
| Commit bc23033 | FOUND |
| Commit 386a5d9 | FOUND |
| 9/9 debug-bundle.test.ts GREEN | VERIFIED |
| 9/9 views-format.test.ts GREEN | VERIFIED |
| 5/5 report-writer.test.ts GREEN | VERIFIED |
| core tsc --noEmit clean | VERIFIED |
