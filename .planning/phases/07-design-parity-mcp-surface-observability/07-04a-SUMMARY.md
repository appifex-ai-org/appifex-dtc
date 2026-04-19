---
phase: 07-design-parity-mcp-surface-observability
plan: 4a
subsystem: mcp-server
tags: [mcp-tools, firebase, testflight, pipeline-status, mcp-01, mcp-02]
dependency_graph:
  requires: [07-01]
  provides: [dtc_firebase_provision, dtc_testflight_upload, dtc_get_pipeline_status]
  affects: [packages/mcp-server/src/server-tools-pipeline.ts]
tech_stack:
  added: ["@appifex/baas workspace dep in @appifex/mcp-server"]
  patterns:
    - "Credential-gate before dispatch (config.firebase / config.apple check)"
    - "BaasSchema resolution: args → .dtc/last-baas-schema.json → throw"
    - "Checkpoint + RunContext status union (revision B-04) for mid-phase-crash recovery"
    - "MockCheckpoint in test to avoid real SQLite filesystem deps"
key_files:
  created:
    - packages/mcp-server/src/tools/firebase-provision.ts
    - packages/mcp-server/src/tools/testflight.ts
    - packages/mcp-server/src/tools/status.ts
  modified:
    - packages/mcp-server/src/server-tools-pipeline.ts
    - packages/mcp-server/package.json
    - packages/mcp-server/__tests__/tools-firebase-provision.test.ts
    - packages/mcp-server/__tests__/tools-testflight-upload.test.ts
    - packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts
decisions:
  - "Use outputDir (not projectDir) in FirebaseProvisionOpts — maps args.projectDir → outputDir per REAL shape (revision B-01)"
  - "serviceAccountKeyPath guard added to handleFirebaseProvision — required for firebase-admin SDK auth"
  - "BaasSchema sourced from args first, then .dtc/last-baas-schema.json, then throws actionable error"
  - "Checkpoint mocked in status tests via vi.mock to avoid SQLite filesystem deps"
  - "dtc_get_pipeline_status intentionally skips resolveRunner + injectCommands — read-only, no shell commands"
  - "Wave 0 RED stub tests updated to match REAL API shapes (XcodeArchivePhaseResult.reason not skipReason)"
metrics:
  duration_minutes: 6
  completed_date: "2026-04-18"
  tasks_completed: 4
  files_changed: 9
---

# Phase 7 Plan 4a: MCP Tool Surface (MCP-01 + MCP-02) Summary

Three new MCP tool handlers + server registrations: `dtc_firebase_provision` (Firebase provision standalone), `dtc_testflight_upload` (iOS archive + TestFlight upload standalone), `dtc_get_pipeline_status` (read-only D-06 pipeline snapshot), flipping the three Wave 0 RED test stubs GREEN.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | handleFirebaseProvision handler | a8495c2 | `tools/firebase-provision.ts`, `package.json` |
| 2 | handleTestflightUpload handler | 2ddc9dc | `tools/testflight.ts` |
| 3 | handleGetPipelineStatus handler | 8e2b095 | `tools/status.ts` |
| 4 | Register three MCP tools | e4ab090 | `server-tools-pipeline.ts` |
| - | Fix comment refs (acceptance check) | f6a0fd3 | `firebase-provision.ts`, `testflight.ts` |

## New Handler Surface

### `handleFirebaseProvision` (MCP-01, `packages/mcp-server/src/tools/firebase-provision.ts`)

```typescript
export async function handleFirebaseProvision(
  args: { projectDir: string; overwritePlist?: boolean; baasSchema?: BaasSchema; configDir?: string },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }>
```

- Credential-gates on `config.firebase?.projectId` and `config.firebase?.serviceAccountKeyPath`
- Resolves `baasSchema`: args → `.dtc/last-baas-schema.json` → throws actionable error
- Computes `plistExists` via `runner.glob('**/GoogleService-Info.plist')`
- Dispatches to `runFirebaseProvision({ outputDir: args.projectDir, runner, config, baasSchema, plistExists, overwritePlist })`
- Returns `{ phase: 'firebase_provision', success, skipped, projectId, iosAppId, plistPath, collectionsSeeded }` (revision B-01 — no `rulesDeployed`)

### `handleTestflightUpload` (MCP-01, `packages/mcp-server/src/tools/testflight.ts`)

```typescript
export async function handleTestflightUpload(
  args: { projectDir: string; scheme?: string; marketingVersion?: string; buildNumber?: string; configDir?: string },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }>
```

- Credential-gates on `config.apple`
- Calls `runXcodeArchivePhase` then `runTestFlightUploadPhase` — iOS-only, always archives fresh
- Returns archive-skipped envelope or `{ phase: 'submit', platform: 'ios', success, ipaPath, buildId, status, warnings }`

### `handleGetPipelineStatus` (MCP-02, `packages/mcp-server/src/tools/status.ts`)

```typescript
export async function handleGetPipelineStatus(
  args: { projectDir: string; configDir?: string },
): Promise<{ text: string; isError: boolean }>
```

Returns D-06 shape: `{ runId, currentPhase, phases: Array<{id, status, summary?}>, lastError? }`

**Status union logic (revision B-04):** For each phase in `PHASE_ORDER`:
1. `Checkpoint.getPhase(runId, id)` → if `status === 'running'` → use `'running'` (mid-phase-crash recovery)
2. Else `ctx.phases[id]?.status` → `'completed' | 'failed' | 'skipped'`
3. Else checkpoint terminal status
4. Else `'pending'`

`checkpoint.close()` always called in `finally` block (T-07-04a-02 mitigation).

## Zod Schemas Registered in `server-tools-pipeline.ts`

| Tool | Required | Optional |
|------|----------|----------|
| `dtc_firebase_provision` | `projectDir: z.string()` | `overwritePlist`, `configDir` |
| `dtc_testflight_upload` | `projectDir: z.string()` | `scheme`, `marketingVersion`, `buildNumber`, `configDir` |
| `dtc_get_pipeline_status` | `projectDir: z.string()` | `configDir` |

`dtc_get_pipeline_status` intentionally does NOT use `resolveRunner` + `injectCommands` — it is read-only.

## Test Results

- `tools-firebase-provision.test.ts`: 4/4 GREEN
- `tools-testflight-upload.test.ts`: 3/3 GREEN
- `tools-get-pipeline-status.test.ts`: 5/5 GREEN (includes mid-phase-crash revision B-04 test case)
- Full mcp-server suite: 93/93 GREEN
- `tsc --noEmit`: clean

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wave 0 test used `objectContaining({ projectDir })` but real FirebaseProvisionOpts uses `outputDir`**
- Found during: Task 1
- Issue: Test checked `expect.objectContaining({ projectDir: tmpDir })` but `runFirebaseProvision` opts shape has `outputDir` (revision B-01 real shape)
- Fix: Updated test to check `objectContaining({ outputDir: tmpDir, runner, config })`; also added `serviceAccountKeyPath` to test config and `baasSchema` to test args since handler requires both
- Files modified: `packages/mcp-server/__tests__/tools-firebase-provision.test.ts`
- Commit: a8495c2

**2. [Rule 1 - Bug] Wave 0 testflight test had a logically broken upload-call assertion**
- Found during: Task 2
- Issue: `expect(uploadCallArgs.ipaPath ?? uploadCallArgs).toEqual(expect.objectContaining({ ipaPath }))` — when `uploadCallArgs.ipaPath` is set, the expression evaluates to a string, which cannot satisfy `objectContaining`
- Fix: Replaced with `expect(runTestFlightUploadPhase).toHaveBeenCalledWith(expect.objectContaining({ ipaPath: archiveResult.ipaPath }))`. Also aligned `archiveResult` shape with real `XcodeArchivePhaseResult` (added `marketingVersion`, `buildNumber`, `bundleId`, `duration`; used `skipped: false as const`)
- Files modified: `packages/mcp-server/__tests__/tools-testflight-upload.test.ts`
- Commit: 2ddc9dc

**3. [Rule 2 - Missing critical functionality] Wave 0 status test did not mock `Checkpoint`**
- Found during: Task 3
- Issue: Test only mocked `loadRunContext`; `Checkpoint` constructor opens a real SQLite file — would throw `SQLITE_CANTOPEN` when `.dtc/` dir doesn't exist in tmpDir
- Fix: Added `MockCheckpoint` class to `vi.mock('@appifex/core', ...)` with injectable `mockGetPhase` function; also added mid-phase-crash test case (revision B-04 requirement)
- Files modified: `packages/mcp-server/__tests__/tools-get-pipeline-status.test.ts`
- Commit: 8e2b095

## Note on Plan Split

Per plan frontmatter, Tasks 5-6 from the original 07-04 (parity fixture authoring + adapter-parity test GREEN-flip) live in `07-04b-PLAN.md` which depends_on this plan.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what is declared in the plan's threat model (T-07-04a-01 through T-07-04a-05). All mitigations applied as specified.

## Self-Check: PASSED

- `packages/mcp-server/src/tools/firebase-provision.ts` — FOUND
- `packages/mcp-server/src/tools/testflight.ts` — FOUND
- `packages/mcp-server/src/tools/status.ts` — FOUND
- commit a8495c2 (firebase-provision handler) — FOUND
- commit 2ddc9dc (testflight handler) — FOUND
- commit 8e2b095 (status handler) — FOUND
- commit e4ab090 (server registrations) — FOUND
