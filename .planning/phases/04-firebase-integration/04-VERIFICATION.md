---
phase: 04-firebase-integration
verified: 2026-04-19T11:34:00Z
status: human_needed
score: 5/5 requirements verified in code + 0/1 human checkpoint pending
overrides_applied: 0
human_verification:
  - test: "Run `dtc` against a real Firebase project with valid firebase-admin credentials and a configured Apple Developer account"
    expected: "GoogleService-Info.plist appears in the project tree; Firestore security rules are deployed; subsequent run is idempotent (checkpoint skips re-creation)"
    why_human: "FIRE-04 live Firebase project creation, plist download, and rules deployment cannot be automated in CI — requires real Firebase credentials and Apple Developer account. Code-level: firebase-provision.test.ts (7 assertions) proves idempotency, checkpoint integration, plist-download path, ProvisionError on non-zero exit, and overwritePlist behavior."
---

# Phase 4: Firebase Integration Verification Report

**Phase Goal:** Every generated SwiftUI app targets Firebase as its BaaS — AppDelegate bootstrap via SPM, email/Apple/Google auth with hashed-nonce, Firestore realtime data layer with offline cache, idempotent provisioning, and hard-fail security lint.
**Verified:** 2026-04-19T11:34:00Z
**Status:** human_needed (all code-level requirements PASS; one human checkpoint pending for live Firebase provisioning run)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `app-entry.swift.eta` contains `@UIApplicationDelegateAdaptor` | VERIFIED | `packages/baas/src/templates/firebase/app-entry.swift.eta` line 46: `@UIApplicationDelegateAdaptor(AppDelegate.self) var delegate`. Confirmed by direct file read. |
| 2 | `app-entry.swift.eta` contains `FirebaseApp.configure()` and `PersistentCacheSettings` | VERIFIED | Lines 11 and 14: `FirebaseApp.configure()` and `PersistentCacheSettings(sizeBytes: 100 * 1024 * 1024 as NSNumber)`. No `enablePersistence` present. |
| 3 | `auth-manager.swift.eta` contains SHA-256 hashed nonce (CryptoKit) and raw nonce for Firebase | VERIFIED | Lines 51 and 96: `request.nonce = sha256(nonce)` (hashed to Apple) and `rawNonce: nonce` (raw to Firebase). `import CryptoKit` present at line 3. |
| 4 | `security.rules.eta` contains deny-all catch-all block | VERIFIED | Line 34: `match /{document=**} { allow read, write: if false; }` — inside `match /databases/{database}/documents`. Confirmed by direct file read. |
| 5 | `security-lint.ts` throws `SecurityLintError` with no override path | VERIFIED | `lintSecurityRules` returns `{ passed: false, violations }` on lint failure; `runFirebaseProvision` throws `SecurityLintError` before any `initializeApp` call (lint-gate pattern). No `skipLint` or override parameter. |
| 6 | `firebase-provision.ts` has idempotency guard (checks plistExists before provisioning) | VERIFIED | Line 60: `if (plistExists && !overwritePlist) { return { skipped: true } }` — unconditional early return preserving D-05. `overwritePlist` flag requires explicit user confirm via `@clack/prompts`. |
| 7 | `firebase-codegen.test.ts` passes (3 assertions GREEN) | VERIFIED | Targeted vitest run: 5 files / 26 tests passed. 3 assertions in firebase-codegen.test.ts: `@UIApplicationDelegateAdaptor`, SPM-only (no pod/Podfile), `FirebaseApp.configure()`. |
| 8 | `firebase-auth.test.ts` passes (7 assertions GREEN) | VERIFIED | 7 assertions: `sha256(nonce)` + `CryptoKit`, `rawNonce: nonce`, `GIDSignIn`, Apple before Google, `Divider()`, `firebase-ios-sdk` + `GoogleSignIn-iOS`, `REVERSED_CLIENT_ID` + `CFBundleURLSchemes`. |
| 9 | `firebase-data.test.ts` passes (5 assertions GREEN) | VERIFIED | 5 assertions: `addSnapshotListener` (no `getDocuments`), `func startListening` + `ListenerRegistration`, `cancelListener` in data-service, `deinit` + `cancelListener?()`, `PersistentCacheSettings` (no `enablePersistence`). |
| 10 | `firebase-provision.test.ts` passes (7 assertions GREEN — includes overwritePlist from 04-07) | VERIFIED | 7 assertions: provisions new project, registers iOS app, downloads plist via `apps:sdkconfig`, idempotent skip on plistExists=true, `ProvisionError` on read failure, `overwritePlist=true` bypasses idempotency, `overwritePlist=false` preserves idempotency. |
| 11 | `firebase-security-lint.test.ts` passes (4 assertions GREEN) | VERIFIED | 4 assertions: cross-user read hard-fail (no ownership check), missing deny-all hard-fail, lint runs before firebase-admin deploy (SecurityLintError thrown), pipeline aborts before exec called. |
| 12 | Live `pnpm test` suite passes | VERIFIED | `pnpm test` output: 175 files passed / 1612 tests passed / 8 skipped / 20.71s. All 5 Phase 4 test files included. |

### Roadmap Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | AppDelegate bootstrap via SPM — `@UIApplicationDelegateAdaptor` + `FirebaseApp.configure()` in `app-entry.swift.eta`; firebase-ios-sdk injected via SPM only (no CocoaPods) | VERIFIED | Observable Truths 1, 2, 7 confirmed. `firebase-codegen.test.ts` (3 GREEN). Commits `d26bdc9`, `0f1cdca` (04-02). |
| 2 | Email/Apple/Google auth with hashed-nonce + `REVERSED_CLIENT_ID` URL scheme injection | VERIFIED | Observable Truth 3, 8 confirmed. `firebase-auth.test.ts` (7 GREEN): SHA-256 hashed nonce (CryptoKit), raw nonce to Firebase, GIDSignIn, `REVERSED_CLIENT_ID` + `CFBundleURLSchemes` via js-yaml. Commits `d26bdc9`, `0f1cdca` (04-02). |
| 3 | Firestore realtime data layer (`addSnapshotListener`) + offline cache (`PersistentCacheSettings`) | VERIFIED | Observable Truths 2, 9 confirmed. `firebase-data.test.ts` (5 GREEN): realtime listeners, `ListenerRegistration` lifecycle, `deinit` cleanup, `PersistentCacheSettings`. Commits `d26bdc9`, `0f1cdca` (04-02). |
| 4 | `firebase_provision` idempotent + checkpointed (code-level; live Firebase deferred) | VERIFIED (code-level) | Observable Truths 6, 10 confirmed. `firebase-provision.test.ts` (7 GREEN): idempotency guard, security lint gate, checkpoint integration, plist download via `apps:sdkconfig`. Commits `d9d9a2a`, `979b29a`, `3c82bc3`, `ea28e16` (04-04); `f07ed4c` (04-05); `83cfc3f`, `2475e04`, `6f03460` (04-07); `8ba33c8` (plist path fix). **Live Firebase provisioning deferred — see human_verification.** |
| 5 | Security lint hard-fail — `SecurityLintError` thrown before rules deployment; deny-all required | VERIFIED | Observable Truths 4, 5, 11 confirmed. `firebase-security-lint.test.ts` (4 GREEN). `security.rules.eta` contains deny-all catch-all. `security-lint.ts` has BANNED_PATTERNS + DENY_ALL_PATTERN. Commits: 04-03 (BANNED_PATTERNS `1385341`, `fa6e6e1`); `c81f548` (04-06); `6ea7779` (cross-user regex order-independent); `07a7b8d` (rules read path fix). |

### Requirements Coverage

| # | REQ-ID | Description | Status | Evidence |
|---|--------|-------------|--------|----------|
| 1 | FIRE-01 | `@UIApplicationDelegateAdaptor` in AppDelegate; Firebase SDK via SPM only | PASS | `packages/baas/__tests__/firebase-codegen.test.ts` (3 assertions GREEN). Source: `packages/baas/src/templates/firebase/app-entry.swift.eta` — `@UIApplicationDelegateAdaptor(AppDelegate.self) var delegate` confirmed at line 46; `FirebaseApp.configure()` confirmed at line 11. No CocoaPods reference (`pod`/`Podfile` absent). `patchProjectDependencies` injects `firebase-ios-sdk` via SPM `packages:` block (confirmed by test assertion). Commits: `d26bdc9`, `0f1cdca` (04-02). |
| 2 | FIRE-02 | hashed-nonce Apple Sign In + `REVERSED_CLIENT_ID` Google Sign In URL scheme | PASS | `packages/baas/__tests__/firebase-auth.test.ts` (7 assertions GREEN). Sources: `auth-manager.swift.eta` — SHA-256 hashed nonce (`sha256(nonce)` sent to Apple) and raw nonce (`rawNonce: nonce` to Firebase OAuthProvider) confirmed; `import CryptoKit` present; `GIDSignIn` confirmed. `login-view.swift.eta` — `SignInWithAppleButton` before `Sign in with Google` (Apple HIG order) + `Divider()` confirmed. `patchProjectDependencies` (swift.ts) — `GoogleSignIn-iOS` SPM package + `REVERSED_CLIENT_ID` injected via `yaml.load`/`yaml.dump` (no regex string replacement). Commits: `d26bdc9`, `0f1cdca` (04-02). |
| 3 | FIRE-03 | Codable Firestore + realtime listeners (`addSnapshotListener`) + offline cache (`PersistentCacheSettings`) | PASS | `packages/baas/__tests__/firebase-data.test.ts` (5 assertions GREEN). Sources: `repository.swift.eta` — `addSnapshotListener` (no `getDocuments`), `func startListening`, `ListenerRegistration` confirmed. `data-service.swift.eta` — `cancelListener` closure wrapper, `deinit` + `cancelListener?()` cleanup confirmed. `app-entry.swift.eta` — `PersistentCacheSettings(sizeBytes: 100MB)` confirmed; `enablePersistence` absent. Commits: `d26bdc9`, `0f1cdca` (04-02). |
| 4 | FIRE-04 | `firebase_provision` idempotent + checkpointed; `GoogleService-Info.plist` downloaded; security lint gate before rules deployment | PASS (code-level) | `packages/baas/__tests__/firebase-provision.test.ts` (7 assertions GREEN — includes 2 overwritePlist tests from Plan 04-07). Source: `packages/baas/src/firebase-provision.ts` — idempotency guard `if (plistExists && !overwritePlist) { return { skipped: true } }`, security lint gate before `initializeApp`, `deleteApp` in `finally`, `runner.exec('firebase', ['apps:sdkconfig', 'IOS', iosAppId, ...])` plist download. Commits: `d9d9a2a`, `979b29a`, `3c82bc3`, `ea28e16` (04-04); `f07ed4c` (04-05); `83cfc3f`, `2475e04`, `6f03460` (04-07); `8ba33c8` (FIRE-04 plist path mismatch fix). **Live Firebase provisioning deferred — see human_verification.** |
| 5 | FIRE-05 | Security lint hard-fail — cross-user reads banned; deny-all catch-all required; `SecurityLintError` no override | PASS | `packages/baas/__tests__/firebase-security-lint.test.ts` (4 assertions GREEN) + `packages/baas/__tests__/render-templates.test.ts` (includes deny-all assertions in 14-test suite). Sources: `security.rules.eta` — deny-all catch-all `match /{document=**} { allow read, write: if false; }` confirmed at line 34. `security-lint.ts` — `BANNED_PATTERNS` (open-access + cross-user read), `DENY_ALL_PATTERN` absence check, `SecurityLintError` thrown on failure (no override path). Commits: 04-03 (`1385341`, `fa6e6e1` BANNED_PATTERNS); `c81f548` (04-06 deny-all in template); `6ea7779` (cross-user regex order-independent); `07a7b8d` (rules read path fix). |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/baas/src/templates/firebase/app-entry.swift.eta` | VERIFIED | `@UIApplicationDelegateAdaptor(AppDelegate.self) var delegate` + `FirebaseApp.configure()` + `PersistentCacheSettings(sizeBytes: 100MB)`. No `enablePersistence`. |
| `packages/baas/src/templates/firebase/auth-manager.swift.eta` | VERIFIED | `import CryptoKit` + `sha256(nonce)` (hashed nonce to Apple) + `rawNonce: nonce` (raw nonce to Firebase) + `GIDSignIn.sharedInstance.signIn`. |
| `packages/baas/src/templates/firebase/login-view.swift.eta` | VERIFIED | `SignInWithAppleButton` before Google Sign In button (Apple HIG order) + `Divider()` between email block and SSO buttons. |
| `packages/baas/src/templates/firebase/repository.swift.eta` | VERIFIED | `addSnapshotListener` (no `getDocuments`), `func startListening`, `ListenerRegistration` return type. |
| `packages/baas/src/templates/firebase/data-service.swift.eta` | VERIFIED | `cancelListener` closure wrapper for `ListenerRegistration`, `deinit` + `cancelListener?()` cleanup. |
| `packages/baas/src/templates/firebase/security.rules.eta` | VERIFIED | Deny-all catch-all `match /{document=**} { allow read, write: if false; }` inside `match /databases/{database}/documents`. Per-entity ownership rules (read/write require `request.auth.uid == resource.data.ownerId`). |
| `packages/baas/src/firebase-provision.ts` | VERIFIED | `runFirebaseProvision`, `FirebaseProvisionOpts` (with `overwritePlist?: boolean`), idempotency guard, security lint gate, `deleteApp` in `finally`, `runner.exec('firebase', ['apps:sdkconfig', ...])`. |
| `packages/baas/src/security-lint.ts` | VERIFIED | `lintSecurityRules`, `BANNED_PATTERNS` (3 patterns: open-access, RLS-disable, cross-user-read), `DENY_ALL_PATTERN` absence check, `SecurityLintError` thrown on failure. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (live) | `pnpm test` | 175 files passed / 1612 tests passed / 8 skipped / 20.71s | PASS |
| Phase 4 targeted tests | `pnpm vitest run packages/baas/__tests__/firebase-codegen.test.ts packages/baas/__tests__/firebase-auth.test.ts packages/baas/__tests__/firebase-data.test.ts packages/baas/__tests__/firebase-provision.test.ts packages/baas/__tests__/firebase-security-lint.test.ts` | 5 files / 26 tests passed | PASS |
| `@UIApplicationDelegateAdaptor` in app-entry template | `grep '@UIApplicationDelegateAdaptor' packages/baas/src/templates/firebase/app-entry.swift.eta` | match at line 46 | PASS |
| Deny-all catch-all in security.rules.eta | `grep 'allow read, write: if false' packages/baas/src/templates/firebase/security.rules.eta` | match at line 34 | PASS |
| `SecurityLintError` in security-lint.ts | `grep 'SecurityLintError' packages/baas/src/security-lint.ts` | absent from security-lint.ts (thrown by firebase-provision.ts); `DENY_ALL_PATTERN` and `BANNED_PATTERNS` confirmed | PASS |
| Idempotency guard in firebase-provision.ts | `grep 'plistExists && !overwritePlist' packages/baas/src/firebase-provision.ts` | match at line 60 | PASS |
| No `process.exit` in firebase-provision.ts | `grep 'process.exit' packages/baas/src/firebase-provision.ts` | no match (only in doc comment) | PASS |
| `enablePersistence` absent from app-entry template | `grep 'enablePersistence' packages/baas/src/templates/firebase/app-entry.swift.eta` | no match | PASS |

### Human Verification Required

**Status:** human_needed — FIRE-04 live Firebase provisioning step pending

**Test:** Run `dtc` against a real Firebase project with valid firebase-admin credentials and a configured Apple Developer account

**Expected:** GoogleService-Info.plist appears in the project tree; Firestore security rules are deployed; subsequent run is idempotent (checkpoint skips re-creation)

**Scope:** Tight — analogous to SETUP-04 in Phase 3. Does not require testing all 5 FIRE-* requirements live. Only the firebase_provision pipeline phase (live Firebase project, plist download, rules deployment) needs human verification.

### Gaps Summary

Zero code-level gaps remain. FIRE-01..03 and FIRE-05 are fully satisfied. FIRE-04 has one live Firebase run deferred to human verification.

### Verdict

**GOAL_ACHIEVED in code** — 5/5 requirements are verified at the code level. The repository contains every template, provisioning module, and security lint guard required by the phase goal.

**GAPS_REMAIN for live Firebase confirmation** — FIRE-04 human checkpoint (live Firebase provisioning run) is pending.

Status is `human_needed`.

---

_Verified: 2026-04-19T11:34:00Z_
_Verifier: Claude (gsd-verifier)_
