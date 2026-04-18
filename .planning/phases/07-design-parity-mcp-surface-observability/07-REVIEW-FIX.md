---
phase: 07-design-parity-mcp-surface-observability
fixed_at: 2026-04-18T23:49:30Z
review_path: .planning/phases/07-design-parity-mcp-surface-observability/07-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-04-18T23:49:30Z
**Source review:** `.planning/phases/07-design-parity-mcp-surface-observability/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: shell injection in `FigmaMakeAdapter.writeBinary`

**Files modified:** `packages/design/src/figma-make-adapter.ts`
**Commit:** f423bb5
**Applied fix:** Replaced `echo '${b64}' | base64 -d > '${path}'` with `printf '%s' '${safeB64}' | base64 -d > '${safePath}'`. Both `b64` and `path` are now sanitized with `replace(/'/g, "'\\''")` before shell interpolation, eliminating the injection vector.

---

### CR-02: module-level mutable state in `RunApp.tsx` causes cross-run state pollution

**Files modified:** `cli/src/views/RunApp.tsx`
**Commit:** 7aa4bff
**Applied fix:** Moved all seven module-level mutable variables (`totalTokens`, `pipelineStart`, `phaseTimers`, `spinnerInterval`, `currentPhase`, `currentMessage`, `stepStart`) inside `renderRunApp`. Also moved `startSpinner`, `stopSpinner`, `logEvent`, and `printStep` inside the function body as nested closures so they capture per-invocation locals. Each `renderRunApp` call now starts with fresh state.

---

### WR-01: missing `archive.ipaPath` guard in testflight.ts

**Files modified:** `packages/mcp-server/src/tools/testflight.ts`
**Commit:** f105466
**Applied fix:** Added an explicit `if (!archive.ipaPath)` guard before calling `runTestFlightUploadPhase`. Returns a structured error response with a clear message ("Archive reported success but produced no .ipa path") instead of passing an empty string to `altool`.

---

### WR-02: token double-counting in `PipelineView`

**Files modified:** `cli/src/views/PipelineView.tsx`
**Commit:** 7d2b8f8
**Applied fix:** Replaced the unconditional `if (event.tokensUsed)` accumulator with a conditional that checks for `tokensInput`/`tokensOutput` first. When either input or output field is present, the bar total accumulates from those fields only; `tokensUsed` is only used as fallback when neither field is present.

---

### WR-03: unguarded `.length` access on `filesGenerated` in formatters.ts

**Files modified:** `packages/report/src/formatters.ts`
**Commit:** 1cd92aa
**Applied fix:** Extracted `const filesGenerated = report.agent.filesGenerated ?? []` before the `.length` accesses, providing a safe fallback for deserialized checkpoint data that may be missing the field.

---

### WR-04: `manifest.ts` path guard misses bare `..` path

**Files modified:** `packages/core/src/manifest.ts`
**Commit:** 97e32b9
**Applied fix:** Replaced the `isAbsolute(e.path) || e.path.includes('..')` check with a `try { validateRelativePath(e.path) } catch { return null }` block, matching the same validation used by `writeManifest`. This correctly rejects a path of exactly `..` which `includes('..')` handles but `isAbsolute` alone would miss for adjacent patterns.

---

### WR-05: `openPreview` closure references `runner` before assignment

**Files modified:** `cli/src/pipeline.ts`
**Commit:** 99292b0
**Applied fix:** Moved the `openPreview` async function definition to immediately after the `const runner = createRunner(...)` assignment at line 896, eliminating the latent ordering hazard where a call during the window before assignment would crash with an opaque TypeError.

---

### WR-06: `refreshManifestEntries` silently no-ops when manifest does not exist

**Files modified:** `cli/src/pipeline.ts`
**Commit:** bb8e08d
**Applied fix:** Expanded the silent `if (!current) return` into a block comment documenting that the early-return is intentional, and noting the requirement for callers to ensure `writeManifest` runs after initial codegen before the fix-loop executes.

---

_Fixed: 2026-04-18T23:49:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
