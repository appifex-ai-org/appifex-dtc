---
phase: 04-firebase-integration
plan: "03"
subsystem: baas-security-lint
tags: [typescript, security, firestore-rules, lint, tdd, FIRE-05]
dependency_graph:
  requires: [04-01-PLAN.md]
  provides: [cross-user read lint check, deny-all default lint check]
  affects: [packages/baas/src/security-lint.ts, packages/baas/__tests__/security-lint.test.ts]
tech_stack:
  added: []
  patterns: [BANNED_PATTERNS array extension, absence-based lint check, Firestore-scoped lint guard]
key_files:
  created: []
  modified:
    - packages/baas/src/security-lint.ts
    - packages/baas/__tests__/security-lint.test.ts
decisions:
  - Deny-all check scoped to Firestore rules only (detected via `service cloud.firestore` or `rules_version`) — Supabase RLS uses a different format and should not be penalized for lacking a Firestore-specific catch-all block
  - Cross-user read pattern added to BANNED_PATTERNS (positive test: flags any allow read without ownership check) — conservative by design per D-12; generated rules must include ownerId assertion
  - DENY_ALL_PATTERN uses an absence check after the main loop rather than a banned-pattern entry — absence checks cannot be expressed as a pattern match
  - Test 1 fixture updated to include deny-all block (now required by D-12 for valid Firestore rules)
metrics:
  duration: ~12m
  completed: "2026-04-17T17:44:00Z"
  tasks_completed: 1
  files_modified: 2
---

# Phase 04 Plan 03: Security Linter Hardening (FIRE-05 D-12) Summary

Two new hard-fail lint patterns added to `lintSecurityRules`: cross-user read detection (any `allow read` without `request.auth.uid == resource.data.ownerId`) and missing deny-all default block check (Firestore rules must include `match /{document=**} { allow read, write: if false; }`).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for cross-user read + deny-all | 1385341 | packages/baas/__tests__/security-lint.test.ts |
| 1 (GREEN) | Implement cross-user read + deny-all checks | fa6e6e1 | packages/baas/src/security-lint.ts, packages/baas/__tests__/security-lint.test.ts |

## Verification

- `lintSecurityRules('allow read: if request.auth != null;')` returns `{ passed: false }` — cross-user read detected
- `lintSecurityRules(rulesWithoutDenyAll)` returns `{ passed: false }` — missing deny-all detected
- `lintSecurityRules(validRulesWithOwnershipAndDenyAll)` returns `{ passed: true }`
- All 10 security-lint tests pass (6 existing + 4 new)
- `SecurityLintResult` interface unchanged: `{ passed: boolean; violations: string[] }`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Deny-all check scoped to Firestore rules only**
- **Found during:** Task 1 GREEN phase
- **Issue:** The deny-all absence check fired on Supabase RLS fixtures (Test 5), causing a false positive. Supabase SQL does not use Firestore's `match /{document=**}` pattern.
- **Fix:** Added `IS_FIRESTORE_RULES` guard that checks for `service cloud.firestore` or `rules_version` in content before running the deny-all check. This matches the semantic intent of D-12 (Firestore-specific requirement).
- **Files modified:** packages/baas/src/security-lint.ts
- **Commit:** fa6e6e1

**2. [Rule 1 - Bug] Test 1 fixture updated to include deny-all block**
- **Found during:** Task 1 GREEN phase
- **Issue:** Existing Test 1 "passes on valid owner-only Firestore rules" lacked the deny-all block, causing it to fail once the deny-all check was added (per the plan's own note: "check and update the test fixture in Test 1 to add `match /{document=**} { allow read, write: if false; }` if needed").
- **Fix:** Added `match /{document=**} { allow read, write: if false; }` to the Test 1 fixture. This is correct — D-12 requires all valid Firestore rules to have this block.
- **Files modified:** packages/baas/__tests__/security-lint.test.ts
- **Commit:** fa6e6e1

## TDD Gate Compliance

- RED gate: commit `1385341` — `test(04-03): add failing tests...` (2 failing tests confirmed before implementation)
- GREEN gate: commit `fa6e6e1` — `feat(04-03): add cross-user read and deny-all checks...` (all 10 tests pass)

## Known Stubs

None — both new checks are fully implemented and tested.

## Pre-existing Test Failures (Out of Scope)

The following test failures exist in the baas package but are pre-existing (fail on the base commit before any changes in this plan). They are not caused by this plan and are not fixed here:

- `packages/baas/__tests__/data-services.test.ts` — 2 failures (related to DataService template changes from other wave-2 plans)
- `packages/baas/__tests__/infer-schema.test.ts` — 2 failures (PHASE_ORDER index mismatch from other wave-2 plans)

## Self-Check: PASSED

- `packages/baas/src/security-lint.ts` exists and contains `Cross-user read`, `DENY_ALL_PATTERN`, `Missing deny-all default`
- `packages/baas/__tests__/security-lint.test.ts` contains 10 test cases, `Cross-user read` assertion, `deny-all` assertion
- Commits `1385341` and `fa6e6e1` exist in git log
- `SecurityLintResult` interface is unchanged: `{ passed: boolean; violations: string[] }`
