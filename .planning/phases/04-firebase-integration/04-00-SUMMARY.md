---
phase: 04-firebase-integration
plan: "00"
subsystem: baas-tests
tags:
  - wave-0
  - test-stubs
  - tdd
  - firebase
dependency_graph:
  requires: []
  provides:
    - FIRE-01-stubs
    - FIRE-02-stubs
    - FIRE-03-stubs
    - FIRE-05-stubs
  affects:
    - packages/baas/__tests__/firebase-codegen.test.ts
    - packages/baas/__tests__/firebase-auth.test.ts
    - packages/baas/__tests__/firebase-data.test.ts
    - packages/baas/__tests__/firebase-security-lint.test.ts
tech_stack:
  added: []
  patterns:
    - Wave-0 Nyquist compliance: it.todo() stubs establish test surface before Wave 1 implementation
key_files:
  created:
    - packages/baas/__tests__/firebase-codegen.test.ts
    - packages/baas/__tests__/firebase-auth.test.ts
    - packages/baas/__tests__/firebase-data.test.ts
    - packages/baas/__tests__/firebase-security-lint.test.ts
  modified: []
decisions:
  - firebase-security-lint.test.ts created as new file (not appended to security-lint.test.ts) — FIRE-05 stubs are Phase 4-specific, cleanly separated from Phase 3 security-lint tests
metrics:
  duration: "3m"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_changed: 4
---

# Phase 4 Plan 00: Wave-0 Firebase Test Stubs Summary

Wave-0 Nyquist compliance: 4 test stub files with 19 it.todo() entries covering FIRE-01, FIRE-02, FIRE-03, and FIRE-05 behaviors before any Wave 1 implementation executes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create firebase-codegen.test.ts and firebase-auth.test.ts stubs | 0746424 | packages/baas/__tests__/firebase-codegen.test.ts, packages/baas/__tests__/firebase-auth.test.ts |
| 2 | Create firebase-data.test.ts stub and firebase-security-lint.test.ts | 50dc780 | packages/baas/__tests__/firebase-data.test.ts, packages/baas/__tests__/firebase-security-lint.test.ts |

## What Was Built

Four Wave-0 test stub files were created in `packages/baas/__tests__/`:

- **firebase-codegen.test.ts** (3 stubs): SPM config, AppDelegate wiring, FirebaseApp.configure() (FIRE-01)
- **firebase-auth.test.ts** (7 stubs): Apple Sign In with hashed nonce, Google Sign In, SSO button ordering, REVERSED_CLIENT_ID injection (FIRE-02)
- **firebase-data.test.ts** (5 stubs): addSnapshotListener, ListenerRegistration protocol, PersistentCacheSettings (FIRE-03)
- **firebase-security-lint.test.ts** (4 stubs): cross-user read lint, deny-all default lint, SecurityLintError, pipeline abort (FIRE-05)

All stubs use `it.todo()` — they run green immediately and will be filled in by Wave 1 plans (04-01, 04-02, 04-05).

## Verification Results

- All 4 new files exist with `it.todo` stubs
- 19 total todo entries (3+7+5+4)
- `vitest run` exits 0 with 6 passing (existing Phase 3 security-lint tests) + 19 todo
- `firebase-provision.test.ts` from Phase 3 untouched
- `security-lint.test.ts` Phase 3 tests (6 tests) unaffected

## Deviations from Plan

### Auto-fixed Issues

None.

### Observations

Task 2 in the plan says "read the current file first" for `firebase-security-lint.test.ts` and "append after the last existing describe block." The file did not exist prior to this plan (only `security-lint.test.ts` exists from Phase 3). The FIRE-05 describe block was created as a new standalone file rather than appending to the Phase 3 file, which aligns with the plan's `files_modified` frontmatter listing `firebase-security-lint.test.ts` as a distinct artifact.

## Known Stubs

All stubs are intentional Wave-0 placeholders. Bodies will be implemented by:
- FIRE-01 stubs → Phase 4 Plan 01
- FIRE-02 stubs → Phase 4 Plan 02
- FIRE-03 stubs → Phase 4 Plan 02
- FIRE-05 stubs → Phase 4 Plan 05

## Threat Flags

None — stub files contain no runtime I/O, no network endpoints, no auth paths, no file access patterns.

## Self-Check: PASSED

- packages/baas/__tests__/firebase-codegen.test.ts: FOUND
- packages/baas/__tests__/firebase-auth.test.ts: FOUND
- packages/baas/__tests__/firebase-data.test.ts: FOUND
- packages/baas/__tests__/firebase-security-lint.test.ts: FOUND
- Commit 0746424: FOUND
- Commit 50dc780: FOUND
