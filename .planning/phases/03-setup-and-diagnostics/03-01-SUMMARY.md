---
phase: 03
plan: 01
subsystem: core-credentials
tags:
  - credentials
  - core-types
  - jwt
  - config-security
dependency_graph:
  requires: []
  provides:
    - FirebaseConfig (packages/core/src/types-config.ts)
    - OAuthConfig (packages/core/src/types-config.ts)
    - CredentialStatus / CredentialCheck / CredentialReport (packages/core/src/credential-registry.ts)
    - runCredentialChecks (packages/core/src/credential-registry.ts)
    - signAscJwt / probeAscOffline / probeAscLive (packages/core/src/asc-jwt.ts)
    - saveConfig chmod 0600 (packages/core/src/config.ts)
  affects:
    - packages/core/src/index.ts (barrel re-exports)
    - cli/__tests__/ (wave-0 test stubs)
tech_stack:
  added:
    - jose ^6.2.2 (ES256 JWT sign + PKCS#8 import for ASC .p8 keys)
  patterns:
    - fixture-mode short-circuit in runCredentialChecks (DTC_LLM_MODE=fixture)
    - soft-fail chmod in try/catch (non-ENOENT warn, never crash)
    - probeAscOffline: never include key material in error messages (T-03-01-03)
key_files:
  created:
    - packages/core/src/asc-jwt.ts
    - packages/core/src/credential-registry.ts
    - cli/__tests__/helpers/fake-home.ts
    - cli/__tests__/preflight-credential-gate.test.ts
    - cli/__tests__/setup-wizard.test.ts
    - packages/core/__tests__/credential-registry.test.ts
    - packages/core/__tests__/asc-jwt.test.ts
    - packages/core/__tests__/config-permissions.test.ts
  modified:
    - packages/core/src/types-config.ts
    - packages/core/src/config.ts
    - packages/core/src/index.ts
    - packages/core/package.json
    - pnpm-lock.yaml
decisions:
  - "Use jose ^6.2.2 for ASC JWT signing (zero-dep, PKCS#8 + ES256 support)"
  - "CredentialRegistry probe stubs return transientError:true when config field present — Plan 03-02 fills real probe logic"
  - "saveConfig chmod soft-fails on exotic filesystems (FAT32) per threat T-03-01-05"
  - "isFixtureMode() short-circuits all credential checks per RESEARCH Pitfall 7"
  - "Apple OAuth (D-07) is info-severity not critical — TestFlight v1 does not require Sign In with Apple"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  files_changed: 13
---

# Phase 03 Plan 01: Credential Foundation Summary

**One-liner:** CredentialRegistry contract (OK/MISSING/INVALID/EXPIRED) + ES256 ASC JWT offline signing via jose + config.json 0600 permission hardening + wave-0 test scaffolding for plans 03-02 through 03-05.

## What Was Built

### Task 1: DtcConfig extensions + jose dep + wave-0 test stubs

- Extended `DtcConfig` with `firebase?: FirebaseConfig` and `oauth?: OAuthConfig` — fully additive, no existing reads broken
- Added `jose ^6.2.2` to `@appifex/core` dependencies
- Created `cli/__tests__/helpers/fake-home.ts` exporting `createFakeHome()` for downstream test use
- Created 5 wave-0 stub test files with `it.todo` entries covering all downstream probe scenarios

### Task 2: CredentialRegistry skeleton + asc-jwt module

- `packages/core/src/asc-jwt.ts`: `signAscJwt` (ES256 JWT, 19m expiry, `appstoreconnect-v1` audience), `probeAscOffline` (sign-or-INVALID, never leaks key material), `probeAscLive` (GET /v1/apps with 401/403/5xx discrimination)
- `packages/core/src/credential-registry.ts`: Full type contract (`CredentialStatus`, `CredentialCheck`, `CredentialReport`, `CredentialCheckOpts`), probe stubs for llm/asc/firebase/google-oauth/apple-oauth, `runCredentialChecks` with fixture short-circuit
- Barrel `packages/core/src/index.ts` extended with `export * from './credential-registry.js'` and `export * from './asc-jwt.js'`
- Tests: 6 real tests (asc-jwt sign + aud/iss/kid + probeOffline OK/INVALID; registry fixture/MISSING/blocking) + 11 remaining todos for Plan 03-02

### Task 3: saveConfig chmod 0600

- `saveConfig` now calls `chmod(p, 0o600)` after `writeFile`
- Soft-fail: non-ENOENT errors produce a `console.warn`, never throw — preserves behavior on exotic filesystems
- 3 real permission tests (all unix-only via `it.skipIf(process.platform === 'win32')`), existing `config.test.ts` passes without regression

## Exports Added to @appifex/core

| Export | File | Type |
|--------|------|------|
| `FirebaseConfig` | types-config.ts | interface |
| `OAuthConfig` | types-config.ts | interface |
| `CredentialStatus` | credential-registry.ts | type union |
| `CredentialCheck` | credential-registry.ts | interface |
| `CredentialReport` | credential-registry.ts | interface |
| `CredentialCheckOpts` | credential-registry.ts | interface |
| `runCredentialChecks` | credential-registry.ts | async function |
| `probeLlm` | credential-registry.ts | async function |
| `probeAsc` | credential-registry.ts | async function |
| `probeFirebase` | credential-registry.ts | async function |
| `probeGoogleOauth` | credential-registry.ts | async function |
| `probeAppleOauth` | credential-registry.ts | async function |
| `signAscJwt` | asc-jwt.ts | async function |
| `probeAscOffline` | asc-jwt.ts | async function |
| `probeAscLive` | asc-jwt.ts | async function |
| `AscJwtArgs` | asc-jwt.ts | interface |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-03-01-01: config.json world-readable | chmod 0600 after writeFile in saveConfig; regression test guards unix behavior |
| T-03-01-03: ASC JWT in error messages | probeAscOffline catches without stringifying; no JWT/key in CredentialCheck.message |
| T-03-01-04: JWT reused beyond 20m | setExpirationTime('19m') hard-coded; no JWT persistence in registry |
| T-03-01-05: chmod crash on exotic FS | try/catch soft-fail; non-ENOENT logs warn, never rethrows |

## Wave-0 Scaffold Ready

Downstream plans can now:
- `03-02` (preflight probes): fill `probeLlm`, `probeAsc`, `probeFirebase` probe bodies + replace `it.todo` in test files
- `03-04` (firebase section): use `FirebaseConfig` type + `probeFirebase` contract
- `03-05` (doctor --deep): use `CredentialCheckOpts.deep` flag in `runCredentialChecks`
- All: use `createFakeHome()` from `cli/__tests__/helpers/fake-home.ts` for temp dir management

## Self-Check: PASSED

- packages/core/src/asc-jwt.ts: FOUND
- packages/core/src/credential-registry.ts: FOUND
- packages/core/src/types-config.ts (FirebaseConfig): FOUND
- packages/core/src/config.ts (0o600): FOUND
- packages/core/src/index.ts (credential-registry, asc-jwt): FOUND
- Commits: e65ee77 (stubs/types), 10c8162 (registry+jwt), be8a52c (chmod): FOUND
- All 131 test files pass, 0 new failures
