---
phase: 4
slug: firebase-integration
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
audited: 2026-04-17
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.0 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `pnpm test --reporter=dot` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --reporter=dot`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | FIRE-01 | — | SPM Firebase SDK pulled; FirebaseApp.configure() in AppDelegate | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-01-02 | 01 | 1 | FIRE-01 | — | No CocoaPods reference in generated project.yml | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-02-01 | 02 | 1 | FIRE-02 | T-4-02 | Apple Sign In uses hashed nonce (SHA-256); raw nonce passed to request | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-02-02 | 02 | 1 | FIRE-02 | T-4-02 | Google Sign In injects REVERSED_CLIENT_ID via js-yaml (no regex) | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-03-01 | 03 | 2 | FIRE-03 | — | Generated repo uses addSnapshotListener; no one-time fetch | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-03-02 | 03 | 2 | FIRE-03 | — | PersistentCacheSettings used (not deprecated enablePersistence) | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-04-01 | 04 | 3 | FIRE-04 | — | firebase_provision runs idempotently; checkpoint-aware | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-04-02 | 04 | 3 | FIRE-04 | — | GoogleService-Info.plist present before archive | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-05-01 | 05 | 3 | FIRE-05 | T-4-05 | Security lint hard-fails on cross-user reads; pipeline aborts before deploy | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |
| 4-05-02 | 05 | 3 | FIRE-05 | T-4-05 | Missing deny-all triggers SecurityLintError; rules never deployed | unit | `pnpm test --reporter=dot` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/baas/__tests__/firebase-codegen.test.ts` — FIRE-01 (SPM config, AppDelegate) — 3 tests ✅
- [x] `packages/baas/__tests__/firebase-auth.test.ts` — FIRE-02 (auth flows, hashed-nonce, REVERSED_CLIENT_ID injection) — 7 tests ✅
- [x] `packages/baas/__tests__/firebase-data.test.ts` — FIRE-03 (snapshot listeners, PersistentCacheSettings) — 5 tests ✅
- [x] `packages/baas/__tests__/firebase-provision.test.ts` — FIRE-04 (idempotency, checkpoint integration, GoogleService-Info.plist) — 7 tests ✅
- [x] `packages/baas/__tests__/firebase-security-lint.test.ts` — FIRE-05 (cross-user read, deny-all, SecurityLintError) — 4 tests ✅

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated SwiftUI app builds successfully with Firebase via SPM | FIRE-01 | Requires Xcode + Apple Developer account | Run `dtc run --platform swiftui` on a test spec; verify `xcodebuild` succeeds |
| Sign In with Apple works end-to-end on device | FIRE-02 | Requires Apple Developer entitlements | Deploy to simulator; tap "Sign In with Apple"; verify credential exchange |
| Google Sign In redirects correctly with REVERSED_CLIENT_ID | FIRE-02 | Requires Google credentials | Deploy to simulator; tap "Sign In with Google"; verify OAuth redirect |
| Firestore realtime listener delivers updates | FIRE-03 | Requires live Firebase project | Write doc in Firestore console; verify UI updates without refresh |
| firebase_provision creates project idempotently | FIRE-04 | Requires Firebase service account | Run pipeline twice; verify second run skips checkpoint-complete steps |

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-17

---

## Validation Audit 2026-04-17
| Metric | Count |
|--------|-------|
| Gaps found | 15 |
| Resolved | 15 |
| Escalated | 0 |
