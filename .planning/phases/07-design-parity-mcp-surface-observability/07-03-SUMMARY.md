---
phase: 07-design-parity-mcp-surface-observability
plan: 3
subsystem: core/manifest + cli/args
tags: [manifest, sha256, atomic-write, path-guard, cli-flags, MCP-03]
dependency_graph:
  requires: [07-00]
  provides: [manifest-module, ParsedArgs-flags]
  affects: [packages/core, cli]
tech_stack:
  added: []
  patterns: [atomic-write-tmp-rename, structural-null-fallback, path-traversal-guard]
key_files:
  created:
    - packages/core/src/manifest.ts
  modified:
    - packages/core/src/index.ts
    - cli/src/cli.ts
decisions:
  - "writeManifest filters excluded paths before writing (not just isExcluded helper) — ensures disk state matches read state without extra caller burden"
  - "readManifest also filters excluded paths on read — defence-in-depth so even a manually-edited manifest cannot reintroduce excluded paths"
  - "validateRelativePath throws on write, returns null on read — write-side strict failure, read-side treats tampered manifest as absent (safe fresh-run semantics)"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  files_changed: 3
---

# Phase 07 Plan 03: Manifest Module + CLI Flag Parsing Summary

Implemented the pure `@appifex/core/manifest.ts` module (read/write/diff + sha256 + excluded-glob filter) and extended `ParsedArgs` in `cli/src/cli.ts` with two new boolean flags. Flipped the Wave 0 `manifest.test.ts` RED stub to GREEN (8/8 tests).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create manifest.ts read/write/diff + path guard | def15b8 | packages/core/src/manifest.ts (new), packages/core/src/index.ts |
| 2 | Parse --overwrite-user-edits + --export-debug-bundle | 7f4d488 | cli/src/cli.ts |

## What Was Built

### packages/core/src/manifest.ts (NEW, ~165 lines)

Exports:
- `readManifest(outputDir)` — reads `.dtc-manifest.json`, returns `Manifest | null`. Returns null on: file absent, JSON corrupt, `manifestVersion !== 1`, missing required fields, any entry with absolute path or `..` segment. Filters excluded paths from returned entries.
- `writeManifest(outputDir, manifest)` — atomic write via tmp + rename (mirrors `snapshot-sidecar.ts:68-74` precedent). Throws on entries with absolute paths or `..` segments. Filters excluded paths before writing.
- `diffManifest(outputDir, manifest)` — returns `{ userEdited: string[], missing: string[] }`. userEdited = files whose current sha256 differs from manifest; missing = files no longer on disk.
- `computeSha256(filePath)` — 64-char lowercase hex sha256 of file contents.
- `isExcluded(relativePath)` — tests relative path against `MANIFEST_EXCLUDE_GLOBS`.
- `MANIFEST_FILENAME` = `'.dtc-manifest.json'`
- `MANIFEST_EXCLUDE_GLOBS` — `.dtc/**`, `.dtc-debug/**`, `.dtc-report/**`, `.git/**`, `node_modules/**`, `Pods/**`, `DerivedData/**`, `*.xcodeproj/**`, `*.xcworkspace/**`, `GoogleService-Info.plist`
- Types: `Manifest`, `ManifestEntry`, `ManifestDiff`

### packages/core/src/index.ts (MODIFIED)

Barrel export added for all 7 manifest values + 3 types.

### cli/src/cli.ts (MODIFIED)

Two additive fields on `ParsedArgs`:
- `overwriteUserEdits?: boolean` — from `--overwrite-user-edits` (Phase 7 MCP-03 D-10)
- `exportDebugBundle?: boolean` — from `--export-debug-bundle` (Phase 7 OBS-03 D-16)

Both default to `undefined` (falsy) when the flag is absent — zero breakage to existing callers.

## Security / Threat Coverage

| Threat | Mitigation |
|--------|-----------|
| T-07-03-01: path-traversal via `..` in entry.path | `validateRelativePath` throws on write; `readManifest` returns null on any `..` — treats tampered manifest as absent |
| T-07-03-02: absolute path in entry.path | Same `validateRelativePath` + `isAbsolute` check on both read and write paths |
| T-07-03-05: `--overwrite-user-edits` wipes user's work | Flag is explicit opt-in, `undefined` by default — wiring in Plan 06 will emit chalk.yellow warning listing preserved paths |

## Test Results

- `manifest.test.ts` (8 tests): all GREEN
  - writeManifest → readManifest round-trip
  - readManifest returns null on absent file
  - readManifest returns null on corrupt JSON
  - readManifest returns null on wrong manifestVersion
  - diffManifest detects modified file
  - diffManifest detects missing file
  - diffManifest returns empty arrays on unchanged files
  - excluded globs filtered from manifest entries

- `cli.test.ts` (22 tests): all GREEN (no regressions)
- `tsc --noEmit` on both `@appifex/core` and `@appifex/cli`: clean

## Deviations from Plan

None — plan executed exactly as written, with one additive design choice: `readManifest` also filters excluded paths on the read side (defence-in-depth, not just on write). This strengthens the T-07-03-02 mitigation without changing any interface contract.

## Pending Integration Points (Plan 06)

- Pipeline start: call `readManifest` + `diffManifest` to detect user-edited files; emit chalk.yellow warning listing preserved paths; respect `overwriteUserEdits` flag to bypass
- Codegen write sites: call `writeManifest` after generating files (before build phase)
- `--overwrite-user-edits` and `--export-debug-bundle` flags need to be plumbed from `ParsedArgs` through pipeline invocation

## Known Stubs

None — all manifest functions are fully implemented, not stubbed.

## Self-Check: PASSED

- `packages/core/src/manifest.ts` exists: FOUND
- `packages/core/src/index.ts` updated with manifest exports: FOUND
- `cli/src/cli.ts` updated with overwriteUserEdits + exportDebugBundle: FOUND
- Commit def15b8 exists: FOUND
- Commit 7f4d488 exists: FOUND
