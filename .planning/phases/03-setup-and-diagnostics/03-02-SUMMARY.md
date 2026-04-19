---
phase: "03"
plan: "02"
subsystem: "credential-preflight"
tags:
  - credentials
  - preflight
  - llm-spend-gate
  - tdd
dependency_graph:
  requires:
    - "03-01"
  provides:
    - "credential-probes"
    - "preflight-gate"
  affects:
    - "cli/src/pipeline.ts"
    - "cli/src/preflight.ts"
    - "packages/core/src/credential-registry.ts"
tech_stack:
  added:
    - "node:fs/promises#access (credential file existence checks)"
    - "AbortSignal.timeout(5000) (T-03-02-03 network hang mitigation)"
  patterns:
    - "TDD RED/GREEN/REFACTOR with vi.stubGlobal for fetch mocking"
    - "Transient-vs-auth error distinction via NodeJS.ErrnoException.code"
    - "Fixture-mode short-circuit (isFixtureMode guard in both registry and preflight)"
key_files:
  created: []
  modified:
    - "packages/core/src/credential-registry.ts"
    - "packages/core/__tests__/credential-registry.test.ts"
    - "cli/src/preflight.ts"
    - "cli/src/pipeline.ts"
    - "cli/__tests__/preflight.test.ts"
decisions:
  - "probeFirebaseSa is a private helper returning a separate 'firebase-sa' check alongside 'firebase-plist' in runCredentialChecks, matching the plan's 'push as SEPARATE CredentialCheck' requirement"
  - "runPreflight made async (was sync) — legacy test updated from toThrow() to rejects.toThrow()"
  - "runPreflight placed at pipeline.ts line 748 (after loadConfig line 742, before buildCreateMessageFn first call at ~line 1014)"
  - "probe name changed from 'llm-api-key' to 'llm' per test behavior spec (Test 2 expected name 'llm')"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-15T11:12:09Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 03 Plan 02: Credential Probes + Preflight Gate Summary

**One-liner:** Full credential probe implementations (LLM/ASC/Firebase/OAuth) with transient-vs-auth distinction, wired into `runPreflight` as the sole LLM-spend gate with chalked `[OK/MISSING/INVALID/EXPIRED]` status output.

## Tasks Completed

| Task | Name | Commit | Result |
|------|------|--------|--------|
| 1 | Implement probeLlm, probeAsc, probeFirebase, probeGoogleOauth, probeAppleOauth | `6ac0bb4` | 23 tests pass |
| 2 | Wire runPreflight to runCredentialChecks with chalked status-line output | `2bc677a` | 9 tests pass |

## TDD Gate Compliance

Both tasks followed RED/GREEN/REFACTOR:

- **Task 1 RED:** `b66609f` — 23 failing tests (11 of 23 failed, 12 pre-existing passed)
- **Task 1 GREEN:** `6ac0bb4` — all 23 pass
- **Task 2 RED:** `4a38e52` — 5 of 9 tests failing (new tests)
- **Task 2 GREEN:** `2bc677a` — all 9 pass

## Implementation Details

### Task 1: Credential Probes

**`probeLlm`:** Shallow checks key presence and length (≥10 chars). Deep performs a 1-token ping to `api.anthropic.com/v1/messages` with `AbortSignal.timeout(5000)` (T-03-02-03 mitigation). Network errors (ECONNRESET/ETIMEDOUT/ENOTFOUND/TimeoutError) map to `{ status: 'OK', transientError: true }` — never INVALID.

**`probeAsc`:** Three-step: (1) check `ascKeyPath` + `ascKeyId` + `ascIssuerId` presence → MISSING if any absent; (2) `fs.access(keyPath)` → MISSING if file not found; (3) `probeAscOffline` (PKCS#8 sign attempt) → INVALID if malformed. Deep adds `probeAscLive` (GET /v1/apps) with TRANSIENT → `transientError: true`.

**`probeFirebase`:** Returns `firebase-plist` check. Skips with `severity:'info'` when non-firebase baas provider. Checks `config.firebase.plistPath` via `fs.access` → MISSING if absent. Private `probeFirebaseSa` returns a separate `firebase-sa` check for the optional service account JSON (absent → OK info; malformed JSON → INVALID warning; missing fields → INVALID warning; valid → OK warning).

**`probeGoogleOauth`:** Severity `warning` (not critical — Google Sign In is optional for TestFlight). Returns OK when `config.firebase.plistPath` is accessible (auto-provisioned via D-06), MISSING when plist absent.

**`probeAppleOauth`:** Severity `info` when unconfigured (returns OK). When configured, uses `probeAscOffline` against `p8Path`. Severity `warning` when configured — never `critical` (D-07: TestFlight v1 does not require Apple Sign In).

**`runCredentialChecks`:** Runs all probes in parallel. LLM first in output array (fail-before-spend UX). `hasBlockingFailures` only set when `severity === 'critical' && status !== 'OK' && !transientError`.

### Task 2: runPreflight Integration

**`cli/src/preflight.ts`** extended:
- Now `async` (was `void`); accepts `PreflightOpts { deep?: boolean; output?: NodeJS.WritableStream }`
- Fixture mode guard (`isFixtureMode()`) short-circuits before credential checks
- Calls `runCredentialChecks(config, { deep: opts?.deep ?? false })`
- Prints `[OK]`/`[MISSING]`/`[INVALID]`/`[EXPIRED]` with chalk colors per check; remedy on next line when present
- Throws `PreflightError` listing all blocking credential names — never `process.exit`

**`cli/src/pipeline.ts`** pipeline.ts call-site record:
- **Pre-edit:** `runPreflight` was NOT called inside `runPipeline` — only in `entry.ts` (lines 238-247)
- **Post-edit:** Added at lines 744-750, immediately after `loadConfig` (line 742), before `buildCreateMessageFn` (defined at ~line 789, first invoked at ~line 1021)
- Exactly ONE invocation site confirmed: `grep -n "runPreflight" cli/src/pipeline.ts` returns 3 lines (comment + import + call — all in one block)
- Sentinel comment: `// Phase 03 Plan 02 (SETUP-02): runPreflight is the SOLE LLM-spend gate — it MUST run before any generate/agent invocation. Do not move below this line.`

## Security (Threat Model)

| Threat | Disposition | Evidence |
|--------|-------------|---------|
| T-03-02-01: API key in message field | Mitigated | `probeLlm` message uses only provider name + HTTP status, never `config.llm.apiKey` |
| T-03-02-03: Network hang in deep probe | Mitigated | `AbortSignal.timeout(5_000)` on all deep fetch calls |
| T-03-02-06: process.exit kills MCP host | Mitigated | Test 6 asserts `process.exit` spy not called; only `PreflightError` thrown |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Probe name 'llm-api-key' changed to 'llm'**
- **Found during:** Task 1 RED phase — legacy test at line 33 expected `c.name === 'llm-api-key'` but the plan's behavior spec (Test 2) expected `name: 'llm'`
- **Fix:** Renamed to `'llm'` in `probeLlm` and updated legacy test to match new name
- **Files modified:** `packages/core/src/credential-registry.ts`, `packages/core/__tests__/credential-registry.test.ts`
- **Commit:** `6ac0bb4`

**2. [Rule 1 - Bug] Legacy preflight test updated for async runPreflight**
- **Found during:** Task 2 GREEN phase — legacy test used synchronous `expect(() => runPreflight(...)).toThrow()` which cannot catch async rejection
- **Fix:** Updated to `await expect(runPreflight(...)).rejects.toThrow()` and added `runCredentialChecks` mock setup for the "no failures" test
- **Files modified:** `cli/__tests__/preflight.test.ts`
- **Commit:** `2bc677a`

## Known Stubs

None — all probe implementations are fully functional with real logic.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| packages/core/src/credential-registry.ts | FOUND |
| cli/src/preflight.ts | FOUND |
| cli/src/pipeline.ts | FOUND |
| packages/core/__tests__/credential-registry.test.ts | FOUND |
| cli/__tests__/preflight.test.ts | FOUND |
| .planning/phases/03-setup-and-diagnostics/03-02-SUMMARY.md | FOUND |
| commit b66609f (RED credential-registry tests) | FOUND |
| commit 6ac0bb4 (GREEN probe implementations) | FOUND |
| commit 4a38e52 (RED preflight tests) | FOUND |
| commit 2bc677a (GREEN preflight wiring) | FOUND |
