---
phase: 07-design-parity-mcp-surface-observability
plan: 6b
subsystem: pipeline
tags: [wave-4, cost-emission, report-write, debug-bundle, help-text, OBS-01, OBS-02, OBS-03]
dependency_graph:
  requires:
    - 07-05 (ProgressEvent B-05 type extension, writeDebugBundle, formatJson, buildCostFields support)
    - 07-06a (PipelineOpts.exportDebugBundle, manifest wiring)
  provides:
    - per-phase cost emission on ProgressEvent at all agent/fix phase completion sites
    - .dtc-report/report.json + .dtc-report/report.md canonical write (both build paths)
    - debug bundle on failure (writeDebugBundle reason:failure) + --export-debug-bundle
    - --overwrite-user-edits + --export-debug-bundle documented in help text
  affects:
    - cli/src/pipeline.ts (extended)
    - cli/src/entry.ts (extended)
    - cli/__tests__/pipeline-report-writes.test.ts (Wave 0 stub flipped GREEN)
tech_stack:
  added: []
  patterns:
    - emit() extended with optional costFields bag (tokensInput/tokensOutput/costUsd)
    - agentResult.costUsd preference over tokensToUsd fallback (revision B-05)
    - buildCostFields module-scope helper (extracts TokenBudget data for report)
    - writeReportFiles module-scope helper (mkdir + writeFile to .dtc-report/)
    - writeDebugBundle wrapped in try/catch — bundler errors never mask original error
key_files:
  created: []
  modified:
    - cli/src/pipeline.ts
    - cli/src/entry.ts
    - cli/__tests__/pipeline-report-writes.test.ts
decisions:
  - "emit() extended with optional 5th arg costFields bag rather than changing call sites to named args — preserves all existing call sites"
  - "Agent path returns formatMarkdown(report) for the markdown return value rather than computing it before writeReportFiles — avoids double formatMarkdown call"
  - "API path writeReportFiles called directly (not wrapped in try/catch) — report write failure should surface; agent path wraps in try/catch to not block early return"
  - "tokensToUsd fallback uses budget.phaseBreakdown at each emit site — consistent with TokenBudget's own phaseCostUsd method"
metrics:
  duration: ~25m
  completed_date: "2026-04-18"
  tasks_completed: 4
  files_created: 0
  files_modified: 3
---

# Phase 7 Plan 6b: Report Write-Sites, Per-Phase Cost Emission, Debug Bundle Trigger Summary

**One-liner:** Extended pipeline.ts emit() with B-05 cost fields, migrated both buildReport sites to write .dtc-report/report.json + .dtc-report/report.md with TokenBudget cost data, added writeDebugBundle on failure and --export-debug-bundle, and documented both flags in help text.

## What Was Built

### Task 1: Per-Phase Cost Emission (revision B-05 write-side)

Extended the `emit()` helper inside `runPipeline` with an optional 5th argument `costFields?: { tokensInput?: number; tokensOutput?: number; costUsd?: number }`. This bag is spread into the `ProgressEvent` so the read-side (PipelineView, wired in Plan 07-05) receives live per-phase USD values.

**Emit sites updated (revision B-05 write-side):**

| Phase Handler | Path | Cost Source |
|---|---|---|
| codegen (agent path) | After `result.success` check | `result.costUsd` (AgentResult) with `tokensToUsd(model, bd.input, bd.output)` fallback |
| codegen (API path) | After layered codegen completes | `tokensToUsd` only (no agentResult in API path) |
| fix/security (agent path) | After security fixLoop in agent path | `tokensToUsd` from `budget.phaseBreakdown('fix')` |
| fix (API path — build failures) | After `fixLoop(buildFailValidation, ...)` | `tokensToUsd` from `budget.phaseBreakdown('fix')` |
| fix (API path — test failures) | After `fixLoop(validation, ...)` | `tokensToUsd` from `budget.phaseBreakdown('fix')` |
| fix (API path — security scan) | After `fixLoop(secValidation, ...)` | `tokensToUsd` from `budget.phaseBreakdown('fix')` |

Phases that do NOT invoke an agent (build, validate, deliver, archive, etc.) are left unchanged.

Also imported `tokensToUsd` and `PRICING_AS_OF` from `@appifex/core`, `writeDebugBundle` for Task 3, and `formatJson` from `@appifex/report` for Task 2.

### Task 2: .dtc-report/report.json + .dtc-report/report.md Writes

**New module-scope helpers:**

```typescript
function buildCostFields(tokenBudget: TokenBudget, model: string): { ... }
async function writeReportFiles(outputDir: string, report: PipelineReport): Promise<void>
```

`buildCostFields` iterates `PHASE_ORDER`, calls `tokenBudget.phaseBreakdown(phase)` for each phase with non-zero tokens, and returns `tokenUsageBreakdown`, `costUsdPerPhase`, `costUsdTotal`.

`writeReportFiles` creates `.dtc-report/` via `mkdirAsync`, writes `report.json` via `formatJson(report)`, and writes `report.md` via `formatMarkdown(report)`.

**Both buildReport sites updated:**
- Agent path (around line 3245): wraps `writeReportFiles` in try/catch so report write failure doesn't block the early return path
- API path (around line 3812): calls `writeReportFiles` directly; also computes `markdown = formatMarkdown(report)` for the return value

**Legacy `join(outputDir, 'report.md')` write removed from both sites.** Canonical location is now `.dtc-report/report.md` per D-15.

Wave 0 stub `cli/__tests__/pipeline-report-writes.test.ts` flipped from 3× `it.todo` to 3 real tests — all GREEN.

### Task 3: Debug Bundle on Failure + --export-debug-bundle

**Failure trigger** (inside the outermost `apiErr` catch, before `throw apiErr`):
```typescript
// Phase 7 (OBS-03 D-16): automatic debug bundle on non-zero exit.
try {
  const bundlePath = await writeDebugBundle(outputDir, { reason: 'failure' })
  console.log(chalk.yellow(`Debug bundle written: ${bundlePath}`))
} catch (bundleErr) {
  // bundling must not mask the original error
  console.log(chalk.red(`Debug bundle write also failed: ${String(bundleErr)}`))
}
throw apiErr  // always re-thrown regardless of bundle outcome
```

**User-export trigger** (inside the API path success return, after `writeReportFiles`):
```typescript
if (opts.exportDebugBundle) {
  try {
    const bundlePath = await writeDebugBundle(outputDir, { reason: 'user-export' })
    console.log(chalk.green(`Debug bundle exported: ${bundlePath}`))
  } catch (bundleErr) {
    // bundling must not fail a green run
    console.log(chalk.yellow(`Debug bundle export failed: ${String(bundleErr)}`))
  }
}
```

Both chalk imports are dynamic (`await import('chalk')`) — consistent with existing pattern in pipeline.ts.

### Task 4: Help Text in cli/src/entry.ts

Added two new flag entries to the OPTIONS section in `printHelp()`:
```
  --overwrite-user-edits  Overwrite files that have been edited since the last run
                          (default: preserve user-edited files with a yellow warning)
  --export-debug-bundle   Write .dtc-debug/bundle-<ts>.zip even on successful runs
                          (bundle is always written on failure)
```

## Report Write-Site Migration Summary

| Location | Before | After |
|---|---|---|
| Agent path (~line 3255) | `runner.writeFile(join(outputDir, 'report.md'), markdown)` | `writeReportFiles(outputDir, report)` → `.dtc-report/report.json` + `.dtc-report/report.md` |
| API path (~line 3822) | `runner.writeFile(join(outputDir, 'report.md'), markdown)` | `writeReportFiles(outputDir, report)` → `.dtc-report/report.json` + `.dtc-report/report.md` |

## Test Results

| Test File | Before | After |
|---|---|---|
| `cli/__tests__/pipeline-report-writes.test.ts` | 3 TODO | 3 GREEN |
| Full suite | 1595 passed | 1608 passed |

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed as written with one minor adaptation:

**Adaptation: Agent path markdown return value**
- **Found during:** Task 2
- **Issue:** Removing `const markdown = formatMarkdown(report)` from the agent path left the `return { report, validation: finalValidation, markdown }` statement referencing an undefined variable.
- **Fix:** Changed the return to `return { report, validation: finalValidation, markdown: formatMarkdown(report) }` — semantically equivalent, no behavior change.
- **Files modified:** cli/src/pipeline.ts

## Known Stubs

None. All cost fields flow from real TokenBudget data. The PipelineView reads `event.costUsd` live (wired in Plan 07-05 Task 3), and the write-side is now wired here.

## Threat Flags

No new threat surface introduced beyond what was analyzed in the plan's threat model (T-07-06b-01 through T-07-06b-04). The debug bundle scrubber from Plan 07-05 covers the T-07-06b-01 mitigation.

## Commits

| Task | Commit | Message |
|---|---|---|
| Wave 0 stub (Task 2 prereq) | 1761e17 | test(07-06b): flip pipeline-report-writes Wave 0 stub GREEN (OBS-02) |
| Tasks 1-3 | b351f24 | feat(07-06b): emit per-phase cost + write .dtc-report/ + debug bundle trigger (OBS-01/02/03) |
| Task 4 | fe20171 | feat(07-06b): add --overwrite-user-edits + --export-debug-bundle to help text |

## Self-Check: PASSED

| Check | Result |
|---|---|
| `cli/src/pipeline.ts` exists | FOUND |
| `cli/src/entry.ts` exists | FOUND |
| `cli/__tests__/pipeline-report-writes.test.ts` exists | FOUND |
| Commit 1761e17 | FOUND |
| Commit b351f24 | FOUND |
| Commit fe20171 | FOUND |
| `tsc --noEmit` clean | VERIFIED |
| 3/3 pipeline-report-writes.test.ts GREEN | VERIFIED |
| Full suite 1608 passed | VERIFIED |
| `grep 'formatJson' cli/src/pipeline.ts` | FOUND |
| `grep 'writeReportFiles' cli/src/pipeline.ts` | FOUND |
| `grep 'writeDebugBundle' cli/src/pipeline.ts` | FOUND |
| `grep 'overwrite-user-edits' cli/src/entry.ts` | FOUND |
| `grep 'export-debug-bundle' cli/src/entry.ts` | FOUND |
