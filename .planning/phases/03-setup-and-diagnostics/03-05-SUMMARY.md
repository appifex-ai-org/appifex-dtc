---
phase: "03"
plan: "05"
subsystem: setup-and-diagnostics
tags:
  - doctor
  - diagnostics
  - deep-probe
  - prerequisites
  - SETUP-03

dependency_graph:
  requires:
    - "03-02"  # runCredentialChecks (shared source of truth for --deep tier)
    - "03-01"  # credential-registry contract
  provides:
    - checkFirebaseTools (exported from @appifex/core)
    - checkServiceAccountJson (exported from @appifex/core)
    - checkAscP8 (exported from @appifex/core)
    - runDoctor({ deep, configDir, output }) — extended DoctorOpts signature
    - --deep flag on ParsedArgs and doctor command dispatch
  affects:
    - "03-04"  # setup firebase section uses checkFirebaseTools

tech_stack:
  added:
    - node:crypto createPrivateKey (offline ASC .p8 EC key validation, avoids jose worktree limitation)
  patterns:
    - Offline key validation via createPrivateKey instead of jose (worktree-safe, no external dep)
    - Shared runCredentialChecks path between doctor --deep and preflight (Pitfall 4 guard)
    - fixture mode short-circuit for all deep probes (Pitfall 7 guard)
    - CliError throw instead of process.exit (T-03-05-07 MCP-safe mitigation)

key_files:
  created:
    - cli/__tests__/doctor.test.ts
  modified:
    - packages/core/src/prerequisites.ts
    - packages/core/src/index.ts
    - cli/src/doctor.ts
    - cli/src/cli.ts
    - cli/src/entry.ts

decisions:
  - "Used node:crypto createPrivateKey instead of jose importPKCS8 for checkAscP8 offline validation — avoids external dependency in prerequisites.ts which caused module resolution failures in git worktrees without node_modules"
  - "doctor.ts is now platform-agnostic (no platform arg) — defaults to swiftui for prereq checks but the new SETUP-03 checks are platform-independent"
  - "Deep tier uses runCredentialChecks(config, { deep: true }) — exact same call site pattern as preflight.ts, enforcing Pitfall 4 parity at the implementation level"

metrics:
  duration: "~11 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_modified: 5
  files_created: 1
---

# Phase 03 Plan 05: Doctor Deep — Summary

Three new shallow checks (SETUP-03) added to `@appifex/core`, wired into an extended `runDoctor` that supports `--deep` parity with preflight.

## What Was Built

### Task 1: Shallow Checks in prerequisites.ts

Three new exported functions in `packages/core/src/prerequisites.ts`:

**`checkFirebaseTools(severity)`** — checks for `firebase` CLI via `which()`, returns version string or install hint. Severity is `'critical'` when `baas.provider === 'firebase'`, else `'info'`.

**`checkServiceAccountJson(path)`** — reads and validates service-account JSON shape: `type === 'service_account'`, `client_email`, `private_key` all present. Returns `skip` when path is undefined, `fail` with `'file not found'` for ENOENT, `fail` with `'expected service_account'` for wrong type.

**`checkAscP8(path)`** — reads `.p8` file, checks for `BEGIN PRIVATE KEY` PEM marker, then calls `node:crypto createPrivateKey` to validate the key is a usable EC key. This is the offline EXPIRED proxy per D-11 — if the key can't be loaded, it's unusable regardless of ASC live status. Returns `skip` when path is undefined, `fail` with `'file not found'` for ENOENT, `fail` with `'key unusable'` for crypto rejection.

**Key deviation (Rule 1 - Bug):** Plan specified using `jose importPKCS8` for the offline check, but this caused `ERR_MODULE_NOT_FOUND` in git worktrees (no `node_modules`). Switched to `node:crypto createPrivateKey` which is a Node built-in and works everywhere. Functionally equivalent — both validate that the key is a loadable EC PKCS#8 PEM.

All three functions exported from `packages/core/src/index.ts`. 16 tests covering pass/fail/skip paths for all three functions.

### Task 2: doctor.ts Extended + --deep Flag

**`cli/src/cli.ts`** — `ParsedArgs` extended with `deep?: boolean`. `parseArgs` sets `deep: true` when `command === 'doctor'` and `--deep` flag is present.

**`cli/src/doctor.ts`** — Complete rewrite with new `DoctorOpts` interface `{ deep?, configDir?, output? }`:
- Shallow tier: `checkPrerequisites` + `checkFirebaseTools` + `checkServiceAccountJson` + `checkAscP8`
- Deep tier (`opts.deep === true`): same shallow + `runCredentialChecks(config, { deep: true })` — exactly the same call as `preflight.ts` (Pitfall 4 guard)
- Fixture mode short-circuits deep probes (Pitfall 7 guard)
- Never calls `process.exit` — throws `CliError(msg, 4)` on failures (T-03-05-07 MCP-safe)
- Renders credential check lines in `[OK]/[MISSING]/[INVALID]/[EXPIRED]` format (preflight parity)

**`cli/src/entry.ts`** — doctor dispatcher updated to pass `{ deep: args.deep ?? false }`.

**`cli/__tests__/doctor.test.ts`** — 8 tests per plan spec:
- Test 1: shallow calls check functions, not fetch
- Test 2: --deep calls shallow + runCredentialChecks
- Test 3: output contains firebase CLI, service account, ASC key lines
- Test 4 (Pitfall 4): --deep calls runCredentialChecks with deep:true
- Test 5: fixture mode skips live fetch
- Test 6: no process.exit calls (MCP-safe)
- Test 7: parseArgs(['doctor', '--deep']) → deep: true
- Test 8: critical failure throws CliError, not process.exit

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1f6c807 | feat(03-05): add checkFirebaseTools, checkServiceAccountJson, checkAscP8 shallow checks |
| 2 | 42ee685 | feat(03-05): wire doctor.ts shallow+deep tiers; add --deep flag to cli.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced jose importPKCS8 with node:crypto createPrivateKey in checkAscP8**
- **Found during:** Task 1 TDD GREEN (test for valid EC key returned 'fail')
- **Issue:** `import('jose')` in `prerequisites.ts` failed with `ERR_MODULE_NOT_FOUND` when running from git worktree without `node_modules`. The dynamic import bypassed vitest's module resolver and hit Node's native resolver which couldn't find `jose`.
- **Fix:** Used `node:crypto createPrivateKey({ key: pem, format: 'pem' })` instead. This validates PEM parse + EC key type natively, with no external dependency. Functionally equivalent to `importPKCS8` for the purpose of "is this key loadable?"
- **Files modified:** `packages/core/src/prerequisites.ts`
- **Commit:** 1f6c807

## Security Review (Threat Model)

| Threat | Status |
|--------|--------|
| T-03-05-01: Doctor logs key path but not private_key contents | Mitigated — `grep "private_key" cli/src/doctor.ts` returns no matches |
| T-03-05-05: Doctor --deep vs preflight divergence | Mitigated — same `runCredentialChecks` call, Test 4 enforces at CI |
| T-03-05-07: process.exit kills MCP host | Mitigated — `grep "process.exit" cli/src/doctor.ts` returns no matches |

## Known Stubs

None — all three shallow checks are fully wired with real implementations.

## Self-Check: PASSED

All source files present. Both task commits verified in git log:
- `1f6c807` feat(03-05): add checkFirebaseTools, checkServiceAccountJson, checkAscP8 shallow checks
- `42ee685` feat(03-05): wire doctor.ts shallow+deep tiers; add --deep flag to cli.ts

16 prerequisite tests passing in worktree environment.
