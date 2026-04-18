---
phase: 07-design-parity-mcp-surface-observability
plan: 6a
subsystem: pipeline
tags: [manifest, user-edit-preservation, fix-loop, codegen, pipeline]
dependency_graph:
  requires: [07-03, 07-04a, 07-05]
  provides: [manifest-gate, manifest-write, fix-loop-manifest-refresh, overwriteUserEdits-flag, exportDebugBundle-flag]
  affects: [cli/src/pipeline.ts, cli/src/views/RunApp.tsx, cli/src/entry.ts]
tech_stack:
  added: []
  patterns: [manifest-diff-gate, fix-loop-in-place-refresh, extractGeneratedFiles-helper]
key_files:
  modified:
    - cli/src/pipeline.ts
    - cli/src/views/RunApp.tsx
    - cli/src/entry.ts
    - cli/__tests__/manifest-preservation.test.ts
decisions:
  - "Used dynamic import('chalk') for the manifest gate block (consistent with other chalk uses in pipeline.ts)"
  - "extractGeneratedFiles accepts { files: unknown[] } base type — works for both CodegenResult and LayeredCodegenResult"
  - "refreshManifestEntries is a module-scope helper to avoid 4x duplication at fix-loop sites"
  - "Manifest write wrapped in try/catch so failure never blocks the pipeline"
  - "Flags threaded at entry.ts construction site (cleanest path — no (opts as any) cast needed)"
metrics:
  duration: ~20min
  completed: 2026-04-18
  tasks_completed: 2
  files_changed: 4
---

# Phase 7 Plan 6a: Manifest Gate + Write + Fix-Loop Refresh Summary

Wire Plan 03's manifest module into cli/src/pipeline.ts: user-edit preservation gate on start, manifest write after codegen, and fix-loop in-place refresh using FixResult.attempts[].filesChanged (revision B-03).

## One-liner

Manifest gate (readManifest/diffManifest + chalk warnings), single write after codegen (extractGeneratedFiles helper), and four-site fix-loop refresh (refreshManifestEntries) wired into pipeline.ts; overwriteUserEdits + exportDebugBundle threaded from ParsedArgs through entry.ts → PipelineOpts.

## Insertion Points in pipeline.ts (at commit 9fdbaf5)

| Integration Point | Location | Description |
|---|---|---|
| Import block | lines 1-40 | readManifest, writeManifest, diffManifest, computeSha256, isExcluded, Manifest, ManifestEntry added to @appifex/core import |
| extractGeneratedFiles helper | line 112 | Module-scope helper; accepts `{ files: unknown[] }` base type (works for CodegenResult + LayeredCodegenResult) |
| refreshManifestEntries helper | line 126 | Async module-scope helper; reads current manifest, refreshes entries in-place, writes atomically |
| PipelineOpts extension | lines 789-792 | overwriteUserEdits?: boolean + exportDebugBundle?: boolean added |
| D-10 manifest gate | line 823 | After mkdir(outputDir) — readManifest + diffManifest; chalk.yellow preserved warning or chalk.red overwrite log |
| D-11 manifest write | line 3309 | Before emit('codegen', ...) — extractGeneratedFiles + computeSha256 per file + writeManifest |
| Fix-loop site 1 (agent security) | line 3097 | After fixLoop call in agent path security fix |
| Fix-loop site 2 (build failures) | line 3503 | After fixLoop(buildFailValidation, ...) in API path |
| Fix-loop site 3 (test failures) | line 3570 | After fixLoop(validation, ...) in API path |
| Fix-loop site 4 (security scan) | line 3658 | After fixLoop(secValidation, ...) in API path |

## RunPipelineOpts Extensions

```typescript
/** Phase 7 (MCP-03 D-10): bypass user-edit preservation gate; overwrite edited files. */
overwriteUserEdits?: boolean
/** Phase 7 (OBS-03 D-16): force debug bundle creation even on successful runs. */
exportDebugBundle?: boolean
```

## Manifest Lifecycle Timeline

1. **Pipeline start (D-10):** `readManifest(outputDir)` → if manifest exists, `diffManifest` → if `userEdited.length > 0`:
   - Default: `chalk.yellow` warning, paths added to `preservedPaths` Set
   - `--overwrite-user-edits`: `chalk.red` log of each overwritten path, `preservedPaths` stays empty

2. **After codegen succeeds (D-11):** `extractGeneratedFiles(codegenResult)` walks `codegenResult.files[].path`, filters excluded paths, computes sha256 per file, builds `Manifest` with `phase: 'codegen'`, calls `writeManifest(outputDir, manifest)`.

3. **After each fix-loop call (B-03):** Flattens `fr.attempts[].filesChanged` into a Set, calls `refreshManifestEntries(outputDir, filesRewritten, 'fix')`. Helper reads current manifest, updates sha256 + generatedAt + phase for each rewritten file, writes atomically.

4. **Next run:** `readManifest` sees fix-loop output as the new baseline — only edits made after the last fix loop register as user-edited.

## extractGeneratedFiles Strategy (revision I-03)

- **Chosen approach:** Field-based — walks `codegenResult.files` (the `GeneratedFile[]` array shared by both `CodegenResult` and `LayeredCodegenResult`)
- **Why:** Both codegen paths populate `.files`; no glob fallback needed
- **Type signature:** `function extractGeneratedFiles(codegenResult: { files: unknown[] }): string[]` — accepts base type to avoid TypeScript mismatch between the two codegen result shapes

## RunApp.tsx Threading (revision W-04)

- `renderRunApp(opts: PipelineOpts)` receives PipelineOpts from entry.ts
- `entry.ts` construction site (line ~265) now includes `overwriteUserEdits: args.overwriteUserEdits` and `exportDebugBundle: args.exportDebugBundle`
- `RunApp.tsx` calls `runPipeline(opts, progress)` directly — flags flow through without cast
- W-04 traceability comment added at the call site

## Revision B-03 Compliance

- All four fix-loop sites use `fr.attempts` array to flatten `filesChanged`
- `fr.filesRewritten` is NOT referenced anywhere in the file
- `refreshManifestEntries` is the single implementation — no duplication

## Test Results

- `manifest-preservation.test.ts`: 2 tests GREEN (flipped from `it.todo` stubs)
  - "preserves user-edited file by default (skip-with-warning)" — verifies diffManifest detects edits
  - "overwrites user-edited file when --overwrite-user-edits is passed" — verifies post-overwrite manifest has no user-edited entries
- Full suite: 1595 passed, 0 failed (up from 1513 baseline)
- tsc --noEmit: clean (required `pnpm --filter @appifex/core build` to generate dist types first)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] chalk not in scope at manifest gate**
- **Found during:** Task 1 — tsc error
- **Issue:** `chalk` is a dynamic import in pipeline.ts; not available as a module-level binding
- **Fix:** Used `const { default: chalkGate } = await import('chalk')` inside the gate block, consistent with existing chalk usage patterns in pipeline.ts (lines 1452, 2497)
- **Files modified:** cli/src/pipeline.ts

**2. [Rule 1 - Bug] extractGeneratedFiles type mismatch**
- **Found during:** Task 1 — tsc error TS2345
- **Issue:** Function originally typed as `LayeredCodegenResult` but `codegenResult` at the call site is `CodegenResult | LayeredCodegenResult`
- **Fix:** Changed parameter type to `{ files: unknown[] }` — the base shape sufficient for the field-based strategy
- **Files modified:** cli/src/pipeline.ts

**3. [Rule 3 - Blocking] @appifex/core dist stale**
- **Found during:** Task 1 — tsc reported no exported member 'readManifest' etc.
- **Issue:** `@appifex/core` dist hadn't been rebuilt since Plan 03 added manifest.ts; tsc resolves from dist not src
- **Fix:** `pnpm --filter @appifex/core build` to regenerate dist/
- **Files modified:** packages/core/dist/ (generated, not tracked)

## Self-Check: PASSED

- cli/src/pipeline.ts: FOUND
- cli/src/views/RunApp.tsx: FOUND
- cli/src/entry.ts: FOUND
- cli/__tests__/manifest-preservation.test.ts: FOUND
- Task commit 9fdbaf5: FOUND
- tsc --noEmit: clean
- manifest-preservation tests: 2 GREEN
- Full suite: 1595 passed, 0 failed
