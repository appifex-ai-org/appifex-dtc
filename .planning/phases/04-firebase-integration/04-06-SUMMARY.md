---
phase: 04-firebase-integration
plan: "06"
subsystem: baas
tags: [firebase, security-rules, firestore, lint, tdd]
dependency_graph:
  requires: [04-03-PLAN.md]
  provides: [deny-all-default-in-security-rules-eta]
  affects: [packages/baas/src/templates/firebase/security.rules.eta, packages/baas/__tests__/render-templates.test.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, Eta template append, Firestore catch-all deny rule]
key_files:
  created: []
  modified:
    - packages/baas/src/templates/firebase/security.rules.eta
    - packages/baas/__tests__/render-templates.test.ts
decisions:
  - Deny-all block inserted inside match /databases/{database}/documents after entity loop, matching Plan 03's DENY_ALL_PATTERN regex exactly
metrics:
  duration: ~8 minutes
  completed: "2026-04-17T05:50:01Z"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 04 Plan 06: Deny-All Default Security Rule in Firestore Template Summary

## One-liner

Added `match /{document=**} { allow read, write: if false; }` catch-all deny block to `security.rules.eta` inside the documents scope, satisfying Plan 03's `DENY_ALL_PATTERN` lint check and preventing hard-fails at the `baas_schema` gate on every Firebase generation.

## What Was Built

The Eta template `packages/baas/src/templates/firebase/security.rules.eta` now renders a catch-all deny-all default rule after the per-entity match blocks and inside the `match /databases/{database}/documents { ... }` outer scope. This satisfies the `DENY_ALL_PATTERN` regex introduced in Plan 03's `lintSecurityRules` function, which is checked at:
- The `baas_schema` lint gate in `cli/src/pipeline.ts:2287`
- Inside `runFirebaseProvision` (Plan 04)

Without this fix, every `dtc run --baas-provider=firebase` would hard-fail at `baas_schema` before `firebase_provision` ever ran.

Two new tests were added to `packages/baas/__tests__/render-templates.test.ts`:
1. Assertion that the rendered `firestore.rules` contains `match /{document=**}` and `allow read, write: if false`
2. Assertion that `lintSecurityRules(rules.content)` returns `{ passed: true, violations: [] }` — non-vacuous because Plan 03's hardened patterns are already on disk (depends_on wave ordering)

## TDD Gate Compliance

- RED: `test(04-06)` commit `f7acb75` — 2 new tests failing before template change
- GREEN: `feat(04-06)` commit `c81f548` — template updated, both tests pass

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add deny-all default catch-all to security.rules.eta and add assertion test | f7acb75, c81f548 | packages/baas/src/templates/firebase/security.rules.eta, packages/baas/__tests__/render-templates.test.ts |

## Deviations from Plan

### Pre-existing Failure (Out of Scope)

**Test 9 `Each CRUD method appears in generated repository`** was already failing before this plan's changes — `func list` not found in the rendered Swift repository. This is a pre-existing bug in the repository template unrelated to security rules. Logged to deferred items; not touched per scope boundary rules.

## Known Stubs

None — the deny-all block is fully static text with no interpolation.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The template modification is purely static text appended inside the Eta template.

## Self-Check: PASSED

- `packages/baas/src/templates/firebase/security.rules.eta` — exists and contains `match /{document=**}` (count: 1) and `allow read, write: if false` (count: 1)
- `packages/baas/__tests__/render-templates.test.ts` — contains new tests for catch-all deny-all block and `lintSecurityRules` assertion
- Commits f7acb75 and c81f548 exist in git log
- Existing Tests 6, 7, 8 unmodified and passing
- New tests (deny-all presence + lint pass) both passing
