---
status: complete
phase: 04-firebase-integration
source:
  - 04-00-SUMMARY.md
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
  - 04-04-SUMMARY.md
  - 04-05-SUMMARY.md
  - 04-06-SUMMARY.md
started: 2026-04-17T07:50:54Z
updated: 2026-04-17T07:56:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Firebase test suite passes
expected: Running `pnpm exec vitest run --reporter=verbose 2>&1 | grep -E "firebase|FIRE|provision"` shows firebase-provision.test.ts, firebase-codegen.test.ts, firebase-auth.test.ts, firebase-data.test.ts, and firebase-security-lint.test.ts all present with passing or todo status. No failures in any of these files.
result: pass

### 2. firebase_provision in PHASE_ORDER between baas_auth and mock_service
expected: Running `grep -n "firebase_provision\|baas_auth\|mock_service" packages/core/src/run-context.ts` shows firebase_provision appearing on a line number strictly between baas_auth and mock_service in the PHASE_ORDER array.
result: pass

### 3. Security linter flags rules without deny-all
expected: Running `pnpm exec vitest run --reporter=verbose "security-lint"` shows all 10 tests passing, including tests that verify `lintSecurityRules` returns `{ passed: false }` when rules lack the deny-all catch-all block, and `{ passed: false }` when rules allow cross-user reads.
result: pass

### 4. Generated Firestore rules template passes lint
expected: Running `pnpm exec vitest run --reporter=verbose "render-templates"` shows the deny-all tests passing — the rendered `firestore.rules` contains `match /{document=**}` and `allow read, write: if false`, and passes `lintSecurityRules` with `{ passed: true }`.
result: pass
note: "Gap found and fixed inline — test updated from `func list` to `func startListening` (commit 0c08ec7). All 14 render-templates tests now pass."

### 5. Swift auth template has Apple Sign In before Google
expected: Running `grep -n "SignInWithAppleButton\|signInWithGoogle\|Google Sign In" packages/baas/src/templates/firebase/login-view.swift.eta` shows `SignInWithAppleButton` at an earlier line than the Google Sign In button — Apple precedes Google per Apple HIG.
result: pass

### 6. Firebase provision is idempotent — skips when plist exists
expected: The firebase-provision.test.ts contains a test confirming that when `plistExists: true` is passed, `runFirebaseProvision` returns `{ skipped: true }` without calling `initializeApp` or firebase-admin. Running `pnpm exec vitest run "firebase-provision"` shows all 5 tests pass.
result: pass

### 7. Pipeline wiring — firebase_provision phase block present
expected: Running `grep -n "firebase_provision\|Phase: firebase_provision" cli/src/pipeline.ts` shows a phase comment marker and phase handler block. The block should appear after the `baas_auth` section and before `mock_service`. `pnpm --filter appifex-dtc exec tsc --noEmit` exits 0 with no errors.
result: pass

### 8. PersistentCacheSettings in app-entry template (not deprecated enablePersistence)
expected: Running `grep "PersistentCacheSettings\|enablePersistence" packages/baas/src/templates/firebase/app-entry.swift.eta` shows `PersistentCacheSettings` present and `enablePersistence` absent — the deprecated persistence API is not used.
result: pass

### 9. Realtime data service uses addSnapshotListener with deinit cleanup
expected: Running `grep -n "addSnapshotListener\|deinit\|ListenerRegistration\|loadAll" packages/baas/src/templates/firebase/data-service.swift.eta` shows `addSnapshotListener` and `deinit` present, and `loadAll` absent — the old polling pattern has been replaced with real-time listeners.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

[none — gap found during UAT was fixed inline (commit 0c08ec7)]
