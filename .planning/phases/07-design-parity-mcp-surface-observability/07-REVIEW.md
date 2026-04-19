---
phase: 07-design-parity-mcp-surface-observability
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - cli/src/cli.ts
  - cli/src/entry.ts
  - cli/src/pipeline.ts
  - cli/src/views/format.ts
  - cli/src/views/PipelineView.tsx
  - cli/src/views/RunApp.tsx
  - packages/core/src/debug-bundle.ts
  - packages/core/src/manifest.ts
  - packages/core/src/pricing.ts
  - packages/core/src/token-budget.ts
  - packages/core/src/types-pipeline.ts
  - packages/design/src/sanitize.ts
  - packages/design/src/figma-make-adapter.ts
  - packages/design/src/figma-rest-client.ts
  - packages/design/src/stitch-adapter.ts
  - packages/mcp-server/src/tools/firebase-provision.ts
  - packages/mcp-server/src/tools/status.ts
  - packages/mcp-server/src/tools/testflight.ts
  - packages/mcp-server/src/server-tools-pipeline.ts
  - packages/report/src/formatters.ts
  - packages/report/src/report.ts
  - packages/spec/src/pen-extractor.ts
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 7 adds design-parity across Figma/Stitch/Pencil adapters, new MCP tools (firebase-provision, testflight, status), cost observability (pricing + token breakdown), manifest-based user-edit preservation, and a debug-bundle facility. The surface area is large and generally well-structured. Most critical paths have error handling and the fail-closed philosophy is consistently applied.

Two critical issues were found: a shell-injection vulnerability in `FigmaMakeAdapter.writeBinary` (base64 data embedded in a shell command without quoting), and a module-level mutable state bug in `RunApp.tsx` that causes cross-run state pollution when `renderRunApp` is called more than once in the same process (MCP server scenario).

Six warnings cover logic gaps: missing `archive.ipaPath` guard in the TestFlight MCP handler, the `tokenUsage` accumulator in `PipelineView` double-counting when `tokensUsed` is also added through `tokensInput+tokensOutput`, an unguarded `.length` read on a potentially-undefined array in `formatters.ts`, and three edge-case issues in `pipeline.ts` around manifest refresh on empty codegen and the `openPreview` closure capturing a stale `runner` reference.

## Critical Issues

### CR-01: Shell injection in `FigmaMakeAdapter.writeBinary` via unquoted base64 data

**File:** `packages/design/src/figma-make-adapter.ts:121`
**Issue:** The method embeds raw base64-encoded binary into a shell command string using single-quote `echo '...'` without escaping single quotes in the data itself. If the base64 string happens to contain a `'` character (which can occur in certain encodings), the shell command is broken. More critically, if the `screenshot` buffer is attacker-influenced (e.g., adversarial Figma file) and the base64 representation contains a single quote followed by shell metacharacters, the shell will interpret those characters. The command is: `echo '${b64}' | base64 -d > '${path}'`. While standard base64 encoding (`A-Za-z0-9+/=`) does not include `'`, the path variable is also embedded and is derived from `join(outputDir, 'screen-0.png')` which ultimately comes from user input (`outputDir`).

**Fix:** Use `runner.writeFile` for local runners, and for remote runners pass the base64 string through a temp file or use a safe argument-passing approach rather than shell interpolation. At minimum, escape single quotes in `b64` and validate that `path` contains no shell metacharacters:

```typescript
private async writeBinary(path: string, data: Buffer, runner: Runner): Promise<void> {
  // For local runner, write directly. For remote, use safe temp-file approach.
  // Never interpolate binary data into a shell command string.
  const b64 = data.toString('base64')
  // Escape any single quotes in b64 (defensive — standard base64 has none,
  // but this protects against encoding variants and future callers).
  const safeB64 = b64.replace(/'/g, "'\\''")
  const safePath = path.replace(/'/g, "'\\''")
  await runner.exec('sh', ['-c', `printf '%s' '${safeB64}' | base64 -d > '${safePath}'`])
}
```

The longer-term fix is to add a `writeBinaryFile(path: string, data: Buffer)` method to the `Runner` interface.

---

### CR-02: Module-level mutable state in `RunApp.tsx` causes cross-run state pollution in MCP server

**File:** `cli/src/views/RunApp.tsx:26-31`
**Issue:** Six module-level mutable variables (`totalTokens`, `pipelineStart`, `phaseTimers`, `spinnerInterval`, `currentPhase`, `currentMessage`, `stepStart`) are declared at module scope and mutated by every `renderRunApp` call. In the Node.js module system, these are singletons for the process lifetime. The MCP server (`packages/mcp-server/src/tools/pipeline.ts`) can call `renderRunApp` (via `handleRunPipeline`) multiple times during a single server session. A second pipeline run will inherit stale `phaseTimers` entries and a potentially active `spinnerInterval` from a prior run that crashed mid-way, producing incorrect elapsed time output and a runaway spinner interval.

**Fix:** Move all six variables inside the `renderRunApp` function body so each invocation gets fresh state:

```typescript
export async function renderRunApp(opts: PipelineOpts) {
  let totalTokens = 0
  let pipelineStart = Date.now()
  const phaseTimers = new Map<string, number>()
  let spinnerInterval: ReturnType<typeof setInterval> | undefined
  let currentPhase: string | null = null
  let currentMessage: string | null = null
  let stepStart: number | null = null
  // ... rest of function, referencing these locals
}
```

The `startSpinner` and `stopSpinner` closures must be defined inside `renderRunApp` as well so they capture these locals.

---

## Warnings

### WR-01: Missing `archive.ipaPath` guard before passing to `runTestFlightUploadPhase`

**File:** `packages/mcp-server/src/tools/testflight.ts:62`
**Issue:** When `archive.skipped` is false, `archive.ipaPath` is passed as `archive.ipaPath ?? ''` to `runTestFlightUploadPhase`. An empty string IPA path will cause `altool` to fail with a confusing error rather than a clear "archive produced no IPA path" message. The non-skipped branch should explicitly guard that `ipaPath` is non-empty.

**Fix:**
```typescript
if (!archive.ipaPath) {
  return {
    text: JSON.stringify({
      phase: 'archive',
      success: false,
      error: 'Archive reported success but produced no .ipa path',
    }, null, 2),
    isError: true,
  }
}
const upload = await runTestFlightUploadPhase({
  runner, config, emitter,
  ipaPath: archive.ipaPath,
  buildNumber: archive.buildNumber,
  marketingVersion: archive.marketingVersion,
})
```

---

### WR-02: Token double-counting in `PipelineView` when both `tokensInput/Output` and `tokensUsed` are present

**File:** `cli/src/views/PipelineView.tsx:71-80`
**Issue:** When a `ProgressEvent` carries `tokensInput` and/or `tokensOutput`, the phase row tokens are set to `(tokensInput ?? 0) + (tokensOutput ?? 0)`. Additionally, at line 79, `if (event.tokensUsed)` adds `event.tokensUsed` to the running `tokensUsed` total used for the bar. If the pipeline emits events with all three fields set (e.g., emitter sets `tokensInput`, `tokensOutput`, and `tokensUsed` = their sum), the bar total will count those tokens twice: once via the `tokensInput+tokensOutput` path (which updates per-phase display) and once via the `event.tokensUsed` accumulator. The bar total and the per-phase breakdown will diverge.

**Fix:** Only accumulate `tokensUsed` in the bar total when `tokensInput` and `tokensOutput` are not present, or derive the bar total from per-phase tokens rather than a separate accumulator:

```typescript
if (event.tokensUsed && event.tokensInput == null && event.tokensOutput == null) {
  setTokensUsed((prev) => prev + event.tokensUsed!)
} else if (event.tokensInput != null || event.tokensOutput != null) {
  setTokensUsed((prev) => prev + (event.tokensInput ?? 0) + (event.tokensOutput ?? 0))
}
```

---

### WR-03: Unguarded `.length` access on `report.agent.filesGenerated` when value could be undefined

**File:** `packages/report/src/formatters.ts:46`
**Issue:** `report.agent.filesGenerated.length` is accessed at line 46 inside `if (report.agent)`. The `AgentReportInfo` interface defines `filesGenerated: string[]` as required, but `buildReport` passes `agent: input.agent` without validation. If a caller passes an `AgentReportInfo` with a missing `filesGenerated` (e.g., deserialized from older checkpoint data missing that field), the `.length` access throws.

**Fix:** Use a fallback:
```typescript
const filesGenerated = report.agent.filesGenerated ?? []
// ...
lines.push(`| Files Generated | ${filesGenerated.length} |`)
// ...
if (filesGenerated.length > 0) {
  for (const f of filesGenerated) { ... }
}
```

---

### WR-04: `manifest.ts` path guard uses `includes('..')` which misses `..` without slashes

**File:** `packages/core/src/manifest.ts:128`
**Issue:** The path tamper guard in `readManifest` checks `e.path.includes('..')`. This catches `../../etc/passwd` but misses a path like `foo..bar` which does not traverse directories yet still matches the intent of the check when combined with OS-specific resolvers. More critically, the string `..` alone (a path consisting of only two dots) passes `includes('..')` but the `validateRelativePath` function (used on write) would correctly reject it. This means a path of exactly `..` in a read manifest would be returned to callers without rejection.

**Fix:** Apply `validateRelativePath` on each entry path during read, the same way write does:
```typescript
for (const e of parsed.entries) {
  // ... type checks ...
  try {
    validateRelativePath(e.path) // throws on '..' segments or absolute paths
  } catch {
    return null
  }
}
```

---

### WR-05: `openPreview` closure in `pipeline.ts` references `runner` before it is initialized

**File:** `cli/src/pipeline.ts:897-906`
**Issue:** The `openPreview` async function is declared as a closure at line 897, inside `runPipeline`, before `runner` is assigned at line 908. In JavaScript, closures capture the variable binding (not the value), so `openPreview` will correctly see the `runner` assigned later. However, the `mkdir` import at line 858 and the `runner` assignment at line 908 are separated by the `openPreview` closure definition at 897. If `openPreview` were ever called during the window between its declaration and `runner`'s assignment, `runner` would be undefined and crash with an opaque `TypeError: Cannot read properties of undefined`. This is a latent ordering hazard. The closure should be moved below line 908 where `runner` is assigned.

**Fix:** Move the `openPreview` definition to after line 908:
```typescript
const runner = createRunner(config.runner, { cwd: outputDir })
// ...
async function openPreview(path: string) {
  try {
    const opener = process.platform === 'darwin' ? 'open' : ...
    await runner.exec(opener, args)
  } catch { /* no GUI opener */ }
}
```

---

### WR-06: `refreshManifestEntries` silently no-ops when manifest does not exist after codegen

**File:** `cli/src/pipeline.ts:130-154`
**Issue:** `refreshManifestEntries` reads the manifest, updates sha256 for the given paths, and writes it back. If `readManifest` returns `null` (manifest file not yet created — which can happen if the manifest write after codegen failed or was skipped), the function returns early silently at line 137. This means fix-loop writes that call `refreshManifestEntries` after patching files will silently produce no manifest update, leaving the manifest stale. On the next run, `diffManifest` will incorrectly flag those fix-loop-edited files as user-edited.

**Fix:** Either document this as intentional behavior with a comment, or fall back to creating a new single-entry manifest for the provided paths when none exists. At a minimum, log a debug warning:
```typescript
const current = await readManifest(outputDir)
if (!current) {
  // Manifest does not exist yet — nothing to update. Caller should ensure
  // writeManifest is called after initial codegen before fix-loop runs.
  return
}
```

---

## Info

### IN-01: `formatUsd` padding assumption in `format.ts` — negative USD values not handled

**File:** `cli/src/views/format.ts:49-53`
**Issue:** `formatUsd` pads output to 7 characters assuming costs are non-negative. If a rounding or calculation error produces a negative value (e.g., `-$0.00`), `padStart(7)` produces an 8-character string that misaligns the column. This is low-risk but worth guarding.

**Fix:** Add a guard: `if (n < 0) return chalk.dim('  error')` or clamp to 0.

---

### IN-02: `sanitizeLayerName` preserves mixed-case in camelCase output for multi-word inputs

**File:** `packages/design/src/sanitize.ts:76`
**Issue:** Step 3 capitalizes only the first letter of each word part and lowercases the rest: `p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()`. This means an input like `"myHTTPButton"` produces `"myhttpbutton"` (all lower after first word char) rather than the more expected `"myHttpButton"`. This is likely intentional to guarantee consistent output, but it means design layer names with existing camelCase conventions will be flattened. This is minor but could confuse designers who see their identifiers changed.

---

### IN-03: `FigmaRestClient.getDesignContext` sanitizes screen names but `screenIds` in returned spec still uses sanitized names

**File:** `packages/design/src/figma-rest-client.ts:62-69`
**Issue:** At lines 62–69, `sanitizeLayerName` is applied to `frame.name` and the sanitized result is pushed into `screenNames`. This is correct for ID derivation. However, the returned `FigmaDesignContext` has `screenNames: screenNames` — so the caller receives sanitized names, not raw Figma names. Downstream display in `FigmaMakeAdapter.readDesign` uses `screenNames` as `name` in the spec object (`name: rawName` — but `rawName` is already sanitized here). If the intention is to preserve the original Figma frame name for display while using the sanitized version as the ID, the two values have been conflated. Compare with `stitch-adapter.ts` line 196 where `name: s.name ?? s.screenId` (raw) and `id: sanitizeLayerName(...)` (sanitized) are correctly kept separate.

**Fix:** In `figma-rest-client.ts`, collect raw names separately from sanitized IDs:
```typescript
const rawNames: string[] = []
const screenIds: string[] = []
for (const frame of page.children) {
  if (frame.type === 'FRAME' || frame.type === 'COMPONENT') {
    rawNames.push(frame.name ?? 'unnamed')
    screenIds.push(sanitizeLayerName(frame.name ?? 'unnamed', takenScreens))
  }
}
// return { ..., screenNames: rawNames, screenIds }
```

---

### IN-04: `debug-bundle.ts` — the `archiver` `'close'` event listener registered after `finalize()` creates a race

**File:** `packages/core/src/debug-bundle.ts:137-141`
**Issue:** `archive.finalize()` is called at line 136, and the `output.on('close', ...)` listener is registered at line 138 in the `new Promise` constructor. If the archive is very small and finishes synchronously (or near-synchronously), the `close` event could fire before the `on('close', ...)` handler is registered. In practice Node.js streams schedule events on the next tick, making this unlikely to manifest. The safer pattern is to register the promise listener before calling `finalize()`.

**Fix:**
```typescript
const closePromise = new Promise<void>((resolve, reject) => {
  output.on('close', () => resolve())
  output.on('error', reject)
})
await archive.finalize()
await closePromise
```

---

### IN-05: `cli/src/cli.ts` `parseArgs` does not validate that unknown flags are rejected for `setup` command

**File:** `cli/src/cli.ts:107-123`
**Issue:** The setup section is validated against `VALID_SETUP_SECTIONS` but unknown `--` flags for the setup command are silently collected into `flags`. There is no validation that `--full` is the only boolean flag accepted for setup. This is minor (extra flags are harmless) but inconsistent with the section validation that explicitly errors on unknown section names.

---

_Reviewed: 2026-04-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
