---
phase: 04-firebase-integration
plan: "01"
subsystem: core-types
tags: [typescript, error-classes, phase-id, checkpoint-data, phase-order]
dependency_graph:
  requires: []
  provides: [ProvisionError, SecurityLintError, firebase_provision PhaseId, firebase_provision CheckpointData, PHASE_ORDER update, Firebase phase label]
  affects: [packages/baas, cli/src/pipeline.ts, cli/src/views/format.ts]
tech_stack:
  added: []
  patterns: [CliError subclass pattern, CheckpointData discriminated union, PHASE_ORDER array]
key_files:
  created: []
  modified:
    - packages/core/src/errors.ts
    - packages/core/src/index.ts
    - packages/core/src/types-pipeline.ts
    - packages/core/src/run-context.ts
    - cli/src/views/format.ts
decisions:
  - ProvisionError takes only message (no extra fields) — FIRE-04 callers only need the error text; keeps symmetry with ResumeAbortError
  - SecurityLintError has optional violations array so callers can pass the lint findings for richer error messages
  - firebase_provision inserted between baas_auth and mock_service per D-04 ordering requirement
metrics:
  duration: ~8m
  completed: "2026-04-16T07:27:57Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 4 Plan 01: Firebase Type Contracts Summary

**One-liner:** Firebase foundational TypeScript contracts — two new CliError subclasses, firebase_provision PhaseId + CheckpointData branch, PHASE_ORDER insertion, and terminal phase label.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ProvisionError + SecurityLintError to errors.ts + index.ts | eaeae90 | packages/core/src/errors.ts, packages/core/src/index.ts |
| 2 | Add firebase_provision to PhaseId, CheckpointData, PHASE_ORDER, format.ts | 451ec4b | packages/core/src/types-pipeline.ts, packages/core/src/run-context.ts, cli/src/views/format.ts |

TDD test commit (RED): 293caa1 — packages/core/__tests__/errors-phase4.test.ts

## What Was Built

### Task 1: Error Classes (TDD)
- `ProvisionError extends CliError` — thrown by firebase_provision phase on firebase-tools or admin SDK failure; exitCode=1, `this.name='ProvisionError'`
- `SecurityLintError extends CliError` — thrown when security lint blocks rules deployment; has optional `violations?: string[]`; exitCode=1, `this.name='SecurityLintError'`
- Both exported from `packages/core/src/index.ts` in the existing CliError export block
- 11 tests written TDD-first; all pass

### Task 2: Type + Config Wiring
- `PhaseId` union: `'firebase_provision'` added after `'baas_auth'`, before `'mock_service'`
- `CheckpointData.firebase_provision`: discriminated union branch with `projectId?`, `iosAppId?`, `plistPath?`, `collectionsSeeded?` alongside `CheckpointFailed | CheckpointSkipped`
- `PHASE_ORDER`: `'firebase_provision'` inserted at position after `'baas_auth'` (D-04)
- `PHASE_LABELS` in format.ts: `firebase_provision: 'Firebase'` — 8 chars, fits 12-char padEnd column

## Verification

- `pnpm --filter @appifex/core exec tsc --noEmit` — exits 0
- `cli tsc --noEmit` — exits 0 (no new errors)
- `grep 'firebase_provision' packages/core/src/run-context.ts` — shows entry between baas_auth and mock_service
- `grep 'ProvisionError\|SecurityLintError' packages/core/src/index.ts` — both exported
- All 11 TDD tests pass

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | 293caa1 | PASS — 11 tests failed before implementation |
| GREEN (feat) | eaeae90 | PASS — 11 tests pass after implementation |
| REFACTOR | n/a | Not needed — code was clean as written |

## Known Stubs

None — this plan is purely additive type/config wiring with no runtime I/O or UI rendering.

## Threat Flags

None — all changes are compile-time type additions with no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- packages/core/src/errors.ts — FOUND (contains ProvisionError, SecurityLintError)
- packages/core/src/index.ts — FOUND (exports ProvisionError, SecurityLintError)
- packages/core/src/types-pipeline.ts — FOUND (firebase_provision in PhaseId and CheckpointData)
- packages/core/src/run-context.ts — FOUND (firebase_provision in PHASE_ORDER)
- cli/src/views/format.ts — FOUND (firebase_provision: 'Firebase')
- Commit eaeae90 — FOUND (feat: errors.ts + index.ts)
- Commit 451ec4b — FOUND (feat: types-pipeline.ts + run-context.ts + format.ts)
