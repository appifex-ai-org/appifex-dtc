---
phase: 04-firebase-integration
plan: "04"
subsystem: baas
tags: [firebase, provision, security-lint, firebase-admin, collection-seeding, plist-download]
dependency_graph:
  requires:
    - 04-01-PLAN.md  # ProvisionError + SecurityLintError error types
    - 04-03-PLAN.md  # lintSecurityRules updated with ownership + deny-all checks
  provides:
    - runFirebaseProvision exported from @appifex/baas
    - firebase_provision phase implementation ready for pipeline wiring (Plan 05)
  affects:
    - packages/baas/src/index.ts
    - packages/baas/src/firebase-provision.ts
    - packages/baas/__tests__/firebase-provision.test.ts
    - cli/__tests__/setup-firebase.test.ts
tech_stack:
  added:
    - firebase-admin (SecurityRules API + Firestore seeding)
  patterns:
    - named firebase-admin app pattern (provision-{Date.now()}) to avoid global state conflicts
    - lint-before-deploy gate (SecurityLintError thrown before initializeApp)
    - finally-block deleteApp cleanup to prevent admin SDK leak
    - sentinel document seeding ({ _seeded: true }) for empty Firestore collections
key_files:
  created:
    - packages/baas/src/firebase-provision.ts
    - packages/baas/__tests__/firebase-provision.test.ts (implemented, replaced stubs)
  modified:
    - packages/baas/src/index.ts (added runFirebaseProvision exports)
    - packages/baas/package.json (added firebase-admin dependency)
    - cli/__tests__/setup-firebase.test.ts (updated Test 11 from stub-check to implementation-check)
decisions:
  - name: lint-gate before initializeApp
    rationale: SecurityLintError thrown before any admin SDK call; rules are never deployed if lint fails (T-04-04-02)
  - name: named firebase-admin app pattern
    rationale: prevents conflicts with other pipeline phases that may initialize firebase-admin; deleteApp in finally ensures cleanup (T-04-04-03)
  - name: runner.exec for plist download
    rationale: firebase apps:sdkconfig is a firebase-tools CLI command; using runner.exec keeps it testable and decoupled from admin SDK
metrics:
  duration: ~15min
  completed: "2026-04-17"
  tasks: 2
  files: 5
---

# Phase 4 Plan 04: Firebase Provision Module Summary

**One-liner:** `runFirebaseProvision` with security lint gate, firebase-admin rules deploy, Firestore collection seeding, and plist download via firebase-tools CLI

## What Was Built

Implemented `packages/baas/src/firebase-provision.ts` — the core of the `firebase_provision` pipeline phase. This module orchestrates the full Firebase provision workflow:

1. **Idempotency check** — returns `{ skipped: true }` immediately if `plistExists` is true; no firebase calls
2. **Security lint gate** — reads `security.rules` and calls `lintSecurityRules()` before any admin SDK call; throws `SecurityLintError` on failure
3. **firebase-admin rules deployment** — uses named app (`provision-{Date.now()}`), deploys via `SecurityRules.releaseFirestoreRuleset()`, always calls `deleteApp` in finally block
4. **Firestore collection seeding** — writes `{ _seeded: true }` sentinel to `{entity}s/_init` for every schema entity
5. **Plist download** — calls `runner.exec('firebase', ['apps:sdkconfig', 'IOS', appId, ...])` to download `GoogleService-Info.plist`; throws `ProvisionError` on non-zero exit

Also implemented all 5 previously stubbed tests in `packages/baas/__tests__/firebase-provision.test.ts` using `vi.mock` to stub firebase-admin modules and the `Runner` interface.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d9d9a2a | feat | implement firebase-provision.ts module |
| 979b29a | feat | export runFirebaseProvision from @appifex/baas index |
| 3c82bc3 | chore | add firebase-admin dependency to @appifex/baas |
| ea28e16 | test | implement all 5 firebase-provision tests; update wave-0 compliance check |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] wave-0 compliance test checked for it.todo stubs that Plan 04 intentionally removes**

- **Found during:** Task 2
- **Issue:** `cli/__tests__/setup-firebase.test.ts` Test 11 asserted `expect(contents).toContain('it.todo')` — the wave-0 stub check. After implementing the real tests, this assertion fails because `it.todo` no longer appears in the file.
- **Fix:** Updated Test 11 to assert the inverse: `expect(contents).not.toContain('it.todo')` and added positive assertions that `runFirebaseProvision` and `ProvisionError` are imported.
- **Files modified:** `cli/__tests__/setup-firebase.test.ts`
- **Commit:** ea28e16

### Pre-existing Test Failures (Out of Scope)

6 tests were already failing before this plan's changes (confirmed by git stash verification):
- `packages/baas/__tests__/data-services.test.ts` — 2 failures (template changes from another wave)
- `packages/baas/__tests__/render-templates.test.ts` — 1 failure (template changes)
- `packages/baas/__tests__/infer-schema.test.ts` — 1 failure (PHASE_ORDER position check)
- `packages/core/__tests__/run-context.test.ts` — 1 failure (mock_service position after firebase_provision insertion)
- `cli/__tests__/pipeline-baas-wiring.test.ts` — 1 failure (DataService template changes)

These are owned by other wave agents in Phase 4.

## Threat Surface

| Flag | File | Description |
|------|------|-------------|
| threat_flag: key-path-in-error | packages/baas/src/firebase-provision.ts | T-04-04-01 mitigated: error messages describe context without exposing serviceAccountKeyPath contents |
| threat_flag: rules-deployment | packages/baas/src/firebase-provision.ts | T-04-04-02 mitigated: lint gate executes before initializeApp; SecurityLintError thrown before any admin SDK call |
| threat_flag: admin-sdk-leak | packages/baas/src/firebase-provision.ts | T-04-04-03 mitigated: deleteApp called in finally block — always executes even on error |

## Known Stubs

None — all functionality is wired. The plist download path requires a real Firebase project and iosAppId to function end-to-end; these come from `~/.dtc/config.json` set by the setup wizard.

## Self-Check: PASSED

- [x] `packages/baas/src/firebase-provision.ts` exists and contains `runFirebaseProvision`
- [x] `packages/baas/src/index.ts` exports `runFirebaseProvision`
- [x] 5 firebase-provision tests pass (`pnpm exec vitest run "firebase-provision.test.ts"`)
- [x] No `it.todo` in firebase-provision.test.ts
- [x] `releaseFirestoreRuleset` present in firebase-provision.ts
- [x] `deleteApp(adminApp)` in finally block
- [x] No `process.exit` call (only in doc comment)
- [x] `apps:sdkconfig` present in both firebase-provision.ts and test file
- [x] `pnpm --filter @appifex/baas exec tsc --noEmit` exits 0
- [x] Commits d9d9a2a, 979b29a, 3c82bc3, ea28e16 all exist in git log
