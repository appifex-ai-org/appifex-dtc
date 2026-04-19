---
phase: 07-design-parity-mcp-surface-observability
fixed_at: 2026-04-19T00:47:00Z
review_path: .planning/phases/07-design-parity-mcp-surface-observability/07-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-04-19T00:47:00Z
**Source review:** `.planning/phases/07-design-parity-mcp-surface-observability/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### WR-01: `handleGetPipelineStatus` — Checkpoint constructor outside try block

**Files modified:** `packages/mcp-server/src/tools/status.ts`
**Commit:** `0192696`
**Applied fix:** Declared `let checkpoint: InstanceType<typeof Checkpoint> | undefined` before the try block. Moved `new Checkpoint(...)` assignment inside the try so a corrupt/locked DB throws into the catch. Added a `catch (err)` block returning a structured `{ text: JSON.stringify({ runId, currentPhase: null, phases: [], error: String(err) }, null, 2), isError: false }` envelope. Changed `finally` to use `checkpoint?.close()`. Added `!` non-null assertion on the inner `checkpoint!.getPhase(...)` call (safe — inner try only executes after assignment).

---

### WR-02: `StitchAdapter.downloadArtifacts` writes PNG with `fsWriteFile` bypassing runner

**Files modified:** `packages/design/src/stitch-adapter.ts`, `packages/design/__tests__/stitch-adapter.test.ts`
**Commit:** `44d8e35`
**Applied fix:** Replaced both `fsWriteFile(pngPath, imageBuffer)` and `fsWriteFile(previewPath, imageBuffer)` with `runner.exec('sh', ['-c', `printf '%s' '${safeB64}' | base64 -d > '${safePath}'`])` — same base64 shell-decode pattern as `FigmaMakeAdapter.writeBinary`. Removed now-unused `writeFile as fsWriteFile` from the `node:fs/promises` import. Updated two tests that previously asserted against `fsWriteFile` mock calls to assert against `runner.exec` calls instead.

---

### WR-03: `formatUsd(0)` returns `'  $0.00'` instead of dim dash placeholder

**Files modified:** `cli/src/views/format.ts`, `cli/__tests__/views-format.test.ts`
**Commit:** `cdc1a85`
**Applied fix:** Added `if (n === 0) return chalk.dim('      —')` after the null check in `formatUsd`, with comment `// Phase 7 (WR-03): zero means "no cost recorded", same as null`. Added a new test `'0 → dim em-dash placeholder (zero means no cost recorded)'` asserting `formatUsd(0)` returns `chalk.dim('      —')`.

---

### WR-04: `refreshManifestEntries` silently no-ops when manifest absent

**Files modified:** `cli/src/pipeline.ts`
**Commit:** `d1d35a7`
**Applied fix:** Added optional `debugLogger?: DebugLogger` as a 4th parameter to `refreshManifestEntries`. Inside the `if (!current)` guard, added `debugLogger?.logJson('manifest-refresh-skipped', { reason: 'no manifest found', phase, paths })` before `return`. All existing call sites are unaffected since the parameter is optional.

---

### WR-05: `PipelineView` token accumulation — missing delta contract on `ProgressEvent`

**Files modified:** `packages/core/src/types-pipeline.ts`
**Commit:** `9419060`
**Applied fix:** Replaced single-line comments on `tokensInput` and `tokensOutput` in the `ProgressEvent` interface with multi-line JSDoc blocks documenting: (1) values MUST be per-call deltas, not cumulative; (2) consumers accumulate across events; (3) on `completed` events these fields should be omitted unless the completion itself consumed tokens. This is a documentation-only fix — the semantic correctness of existing emit sites requires human verification.

---

### WR-06: `FigmaRestClient.getDesignContext` conflates sanitized IDs with display names in `screenNames`

**Files modified:** `packages/design/src/figma-rest-client.ts`, `packages/design/__tests__/figma-rest-client.test.ts`, `packages/design/__tests__/figma-sanitize.test.ts`
**Commit:** `382db74`
**Applied fix:** Separated raw name from sanitized ID in the frame-iteration loop: `const raw = frame.name ?? 'unnamed'`; `const sanitized = sanitizeLayerName(raw, takenScreens)`; `takenScreens.add(sanitized)`; `screenNames.push(raw)`. The `takenScreens` set still tracks sanitized IDs for deduplication; `screenNames` now contains original Figma display names. Updated `figma-rest-client.test.ts` to expect `['Home']` instead of `['home']`, and updated `figma-sanitize.test.ts` to expect raw names `['🏠 Home', 'class', 'Home Screen', 'Home Screen']` instead of sanitized IDs.

---

_Fixed: 2026-04-19T00:47:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
