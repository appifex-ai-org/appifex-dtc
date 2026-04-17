---
phase: 04-firebase-integration
plan: "07"
subsystem: baas/firebase-provision + cli/pipeline
tags: [firebase, ui-ux, destructive-action, idempotency, prompt]
dependency_graph:
  requires:
    - 04-04-PLAN.md  # firebase-provision.ts base implementation
    - 04-05-PLAN.md  # pipeline.ts firebase_provision block
  provides:
    - overwritePlist option in FirebaseProvisionOpts
    - @clack/prompts confirm gate for plist overwrite in pipeline.ts
  affects:
    - packages/baas/src/firebase-provision.ts
    - packages/baas/__tests__/firebase-provision.test.ts
    - cli/src/pipeline.ts
tech_stack:
  added: []
  patterns:
    - isInteractive(opts) guard pattern (canonical helper at pipeline.ts:686) reused for new prompt site
    - TDD RED/GREEN cycle for overwritePlist option
key_files:
  created: []
  modified:
    - packages/baas/src/firebase-provision.ts
    - packages/baas/__tests__/firebase-provision.test.ts
    - cli/src/pipeline.ts
decisions:
  - Use isInteractive(opts) (existing canonical helper) rather than raw process.stdin.isTTY — honors opts.interactive override used by MCP callers
  - Default initialValue: false in clack.confirm — UI-SPEC requires default-No for destructive actions
  - clack.isCancel(proceed) treated as No — Ctrl+C must not accidentally trigger overwrite
  - Dynamic import for @clack/prompts inside conditional — avoids import cost for non-firebase runs
  - Non-interactive path emits event stream message so CI callers see the preservation decision
metrics:
  duration: ~15 minutes
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 3
---

# Phase 4 Plan 07: Plist Overwrite Confirm Prompt Summary

**One-liner:** Added UI-SPEC-contracted `@clack/prompts` confirm gate for `GoogleService-Info.plist` overwrite, plus `overwritePlist` option in `FirebaseProvisionOpts` that bypasses the D-05 idempotency short-circuit when the user explicitly confirms.

## What Was Built

### Task 1: overwritePlist option in firebase-provision.ts (TDD)

**RED:** Added 2 failing tests to `packages/baas/__tests__/firebase-provision.test.ts`:
- `overwrites the existing plist when overwritePlist=true is passed` — asserts full provision path proceeds (skipped=false, rules deployed, apps:sdkconfig called)
- `preserves idempotency: plistExists=true with overwritePlist=false returns skipped=true` — asserts D-05 default-safe behavior preserved

**GREEN:** Updated `packages/baas/src/firebase-provision.ts`:
- Extended `FirebaseProvisionOpts` interface with `overwritePlist?: boolean` (additive, no breaking change)
- Changed early-return guard from `if (plistExists)` to `if (plistExists && !overwritePlist)` 
- Added `overwritePlist` to destructure for symmetry
- All 7 tests pass (5 from Plan 04 + 2 new from Plan 07)

### Task 2: @clack/prompts confirm prompt in pipeline.ts

Inserted confirm-prompt block in the `firebase_provision` phase handler in `cli/src/pipeline.ts`, between `const plistExists = await runner.exists(...)` and `const result = await runFirebaseProvision(...)`:

- `isInteractive(opts)` gates the prompt (respects `opts.interactive` override for MCP/CI callers)
- Prompt message: `GoogleService-Info.plist already exists at ${plistPath}. Overwrite? [y/N]` (exact UI-SPEC wording)
- `initialValue: false` — defaults to No per UI-SPEC destructive-action contract
- `clack.isCancel(proceed)` handles Ctrl+C — treated as No
- Non-interactive path skips prompt, defaults `overwritePlist = false`
- Post-prompt emits:
  - `Existing GoogleService-Info.plist preserved (no overwrite).` (dim chalk) when no overwrite
  - `Overwriting existing GoogleService-Info.plist...` when overwrite confirmed
- Passes `overwritePlist` to `runFirebaseProvision`

## Verification Results

- `packages/baas/__tests__/firebase-provision.test.ts` — 7 tests pass
- `packages/baas/src/firebase-provision.ts` contains `overwritePlist?: boolean` and `if (plistExists && !overwritePlist)` guard
- `cli/src/pipeline.ts` contains all required strings: `GoogleService-Info.plist already exists at`, `Overwrite? [y/N]`, `initialValue: false`, `clack.isCancel(proceed)`, `isInteractive(opts)`, `Existing GoogleService-Info.plist preserved (no overwrite).`, `Overwriting existing GoogleService-Info.plist...`
- No `process.stdin.isTTY` in the firebase_provision block (only in `isInteractive` helper)
- No `process.exit` in the new prompt block
- `pnpm --filter @appifex/baas exec tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- RED gate: commit `83cfc3f` — `test(04-07): add failing tests for overwritePlist option (RED phase)`
- GREEN gate: commit `2475e04` — `feat(04-07): add overwritePlist option to firebase-provision.ts`
- No REFACTOR needed — code was clean on first pass

## Checkpoint Pending

Task 3 (human-verify) is awaiting human verification of the interactive and non-interactive flows.

## Known Stubs

None — all implemented paths are wired.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The `overwritePlist` boolean is derived from a user confirm prompt (gated by `isInteractive`) and passed to an existing function. No new trust boundaries created beyond what the threat model in the plan already covers (T-04-07-01 through T-04-07-05).

## Self-Check

### Files exist:
- [x] `packages/baas/src/firebase-provision.ts` — modified, contains overwritePlist
- [x] `packages/baas/__tests__/firebase-provision.test.ts` — modified, 7 tests
- [x] `cli/src/pipeline.ts` — modified, contains confirm prompt

### Commits exist:
- 83cfc3f — test(04-07): add failing tests for overwritePlist option (RED phase)
- 2475e04 — feat(04-07): add overwritePlist option to firebase-provision.ts
- 6f03460 — feat(04-07): add @clack/prompts confirm prompt for plist overwrite in pipeline.ts

## Self-Check: PASSED
