---
phase: 04-firebase-integration
plan: "05"
subsystem: cli/pipeline
tags: [firebase, provision, pipeline-wiring, phase-handler, checkpoint]
dependency_graph:
  requires:
    - 04-01-PLAN.md  # ProvisionError + SecurityLintError types, PhaseId, CheckpointData
    - 04-02-PLAN.md  # Swift templates with Firebase auth
    - 04-03-PLAN.md  # security-lint.ts hardened
    - 04-04-PLAN.md  # runFirebaseProvision module
  provides:
    - firebase_provision phase handler wired into pipeline.ts between baas_auth and mock_service
  affects:
    - cli/src/pipeline.ts
tech_stack:
  added: []
  patterns:
    - dynamic import of runFirebaseProvision from @appifex/baas (same pattern as other baas phase imports)
    - plistExists idempotency guard via runner.exists before calling provision
    - ProvisionError/SecurityLintError propagate naturally (no try/catch wrapping)
    - chalk dynamic import for gitignore tip (pattern matches existing chalk usage at line 1356)
key_files:
  created: []
  modified:
    - cli/src/pipeline.ts (62 line insertion: firebase_provision phase block)
decisions:
  - name: dynamic chalk import
    rationale: chalk is not statically imported at top of pipeline.ts; dynamic import follows the pattern established at line 1356 for chalk usage in phase blocks
  - name: chalkForProvision local variable
    rationale: avoids shadowing any outer chalk reference; dynamic import is scoped to the firebase_provision block only
  - name: bare await for runFirebaseProvision
    rationale: ProvisionError and SecurityLintError both extend CliError; they must propagate to the pipeline's top-level error handler unchanged per threat model T-04-05-05
metrics:
  duration: ~10min
  completed: "2026-04-17"
  tasks: 1
  files: 1
---

# Phase 4 Plan 05: Pipeline Wiring Summary

**One-liner:** `firebase_provision` phase handler wired into `pipeline.ts` between `baas_auth` and `mock_service` with checkpoint idempotency, progress events, and bare-await error propagation for `ProvisionError`/`SecurityLintError`

## What Was Built

Inserted the `firebase_provision` phase block in `cli/src/pipeline.ts` (lines 2396-2456). The block:

1. **Guard:** Only runs when `resolvedBaasProvider === 'firebase'` and `!canSkipPhase('firebase_provision')`
2. **Dynamic imports:** `runFirebaseProvision` from `@appifex/baas`; `chalk` for dim styling
3. **Idempotency check:** `runner.exists(plistPath)` determines if `GoogleService-Info.plist` already present
4. **Provision call:** bare `await runFirebaseProvision({ outputDir, runner, config, baasSchema!, plistExists })` — no try/catch so `ProvisionError` and `SecurityLintError` propagate as `CliError` to the pipeline's top-level handler
5. **Checkpoint save:** on both `result.skipped` (plist already present) and completed paths
6. **Progress events:** `started`, `running` (gitignore tip + collections seeded), `completed`, and `skipped`
7. **Resume path:** `else if (resolvedBaasProvider === 'firebase' && canSkipPhase('firebase_provision'))` emits `skipped`

## Commits

| Hash | Type | Description |
|------|------|-------------|
| f07ed4c | feat | wire firebase_provision phase handler in pipeline.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `dtcConfig` variable name does not exist in pipeline.ts scope**

- **Found during:** Task 1 (TypeScript typecheck)
- **Issue:** Plan's action block specified `config: dtcConfig` but the variable in pipeline.ts is named `config` (assigned at line 742: `const config = await loadConfig(configDir)`)
- **Fix:** Changed `config: dtcConfig` to `config`
- **Files modified:** `cli/src/pipeline.ts`
- **Commit:** f07ed4c (fix applied inline before committing)

**2. [Rule 1 - Bug] `chalk` not in scope in firebase_provision block**

- **Found during:** Task 1 (TypeScript typecheck)
- **Issue:** Plan specified `chalk.dim(...)` but `chalk` is not a top-level import in pipeline.ts; it is dynamically imported only where needed (pattern established at line 1356)
- **Fix:** Added `const { default: chalkForProvision } = await import('chalk')` inside the block and used `chalkForProvision.dim(...)`
- **Files modified:** `cli/src/pipeline.ts`
- **Commit:** f07ed4c (fix applied inline before committing)

## Threat Surface

No new threat surface introduced. This plan only wires an existing module into the pipeline; no new network endpoints, auth paths, or schema changes.

Threat mitigations from the plan's threat model:
- T-04-05-01: `config` object is not stringified into error messages — `ProvisionError` message comes from inside `runFirebaseProvision`, not the pipeline handler
- T-04-05-02: Checkpoint saved on both `result.skipped` and `result.completed` paths
- T-04-05-03: `baasSchema!` non-null assertion is safe — guarded by `resolvedBaasProvider === 'firebase'` which requires `baas_schema` to have run
- T-04-05-04: No try/catch in pipeline handler; CliError subclasses propagate naturally
- T-04-05-05: Bare `await runFirebaseProvision(...)` — ProvisionError from plist download failure propagates out

## Known Stubs

None — the phase handler is fully wired. End-to-end operation requires a real Firebase project configured in `~/.dtc/config.json`.

## Self-Check: PASSED

- [x] `cli/src/pipeline.ts` contains `// ── Phase: firebase_provision ──`
- [x] Contains `runFirebaseProvision` dynamic import from `@appifex/baas`
- [x] Contains `checkpoint.savePhase(checkpointRunId, 'firebase_provision',`
- [x] Contains `emit('firebase_provision', 'completed', 'Firebase provision complete')`
- [x] Contains `emit('firebase_provision', 'skipped', 'skipped (checkpoint complete)')` (appears twice: inside block and in else-if)
- [x] Contains gitignore tip string `GoogleService-Info.plist to your project .gitignore`
- [x] Does NOT contain `process.exit` in the firebase_provision block
- [x] `runFirebaseProvision` is a bare `await` — no wrapping try/catch
- [x] firebase_provision block at lines 2396-2456: AFTER baas_auth (ends line 2394), BEFORE mock_service (starts line 2463)
- [x] Commit f07ed4c exists in git log
