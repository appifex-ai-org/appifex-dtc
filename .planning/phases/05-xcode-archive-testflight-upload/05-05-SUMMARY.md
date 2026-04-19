---
phase: 05-xcode-archive-testflight-upload
plan: 05
subsystem: provisioning
tags: [altool, testflight, polling, ascrest, xcode26, ipa-upload, d-09, d-15, d-17, d-19, d-20]

# Dependency graph
requires:
  - phase: 02-foundation-hardening
    provides: CliError hierarchy + TestFlightError (FOUND-04)
  - phase: 03-setup-and-diagnostics
    provides: signAscJwt, AscJwtArgs
  - phase: 05-xcode-archive-testflight-upload
    plan: 03
    provides: asc-rest primitives (findOrCreateInternalGroup, reconcileTesters, getBuildProcessingState, findBuildByVersion, computeNextBuildNumber, assignBuildToGroups, isDuplicateVersionError)
provides:
  - packages/provision/src/altool.ts — ensureKeyAtStandardPath, uploadIpa, parseAltoolOutput
  - packages/provision/src/testflight-polling.ts — pollUntilProcessed with 45-min cap + jittered 30s cadence
  - packages/provision/src/testflight-upload-phase.ts — runTestFlightUploadPhase orchestrator + result union
  - AppleConfig.testflightTesters?: string[] (added to @appifex/core types-config)
affects:
  - 05-06 pipeline wiring (imports runTestFlightUploadPhase)
  - 05-06 asc-client.ts removal (runTestFlightUploadPhase + asc-rest fully replace it)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "altool subprocess via Runner port (runner.exec('xcrun', [...])), NOT direct child_process.spawn"
    - "3-tier altool output parsing: JSON product-errors → ITMS regex → ContentDelivery regex"
    - "vi.hoisted() for test fs-mock registries so vi.mock hoisting stays side-effect-free"
    - "D-17 soft-fail pattern: completed_with_warnings status + exit-0 on non-upload post-conditions"
    - "Jittered polling cadence (base ± half-window) to prevent thundering-herd across concurrent dtc runs"

key-files:
  created:
    - packages/provision/src/altool.ts
    - packages/provision/src/testflight-polling.ts
    - packages/provision/src/testflight-upload-phase.ts
    - packages/provision/__tests__/altool.test.ts
    - packages/provision/__tests__/testflight-upload-phase.test.ts
    - .planning/phases/05-xcode-archive-testflight-upload/05-05-SUMMARY.md
  modified:
    - packages/core/src/types-config.ts (AppleConfig.testflightTesters added)
    - packages/provision/src/index.ts (barrel re-exports for altool + polling + phase)

key-decisions:
  - "Pitfall 8 / canonical 2026 flag set: hyphenated --apple-id / --bundle-id / --bundle-version / --bundle-short-version-string / --api-key / --api-issuer / --output-format json — NOT the deprecated camelCase variants and NOT --upload-app (which was removed 2024)"
  - "Pitfall 7 / Q3 3-tier detection over trust-exit-code: JSON product-errors is authoritative when present; ITMS regex catches non-JSON + Xcode 26 quirks; ContentDelivery regex catches the Xcode 26 silent-failure regression (fastlane #29739). Final fallback is non-zero exit."
  - "Pitfall 4 symlink at ~/.appstoreconnect/private_keys/AuthKey_{keyId}.p8 with idempotent stat-first check — never overwrites existing file/symlink; mkdir mode 0o700 keeps the dir tight"
  - "D-09 retry budget = 1. First duplicate → computeNextBuildNumber (fresh ASC max, not stale increment) → re-upload. Second duplicate → hard-fail TestFlightError asking user to re-run dtc (concurrent-upload collision)"
  - "D-15 polling: base 30s + ±5s jitter, 45-min hard timeout. On TIMEOUT return 'TIMEOUT' (soft-fail at caller) rather than throwing — the build IS uploaded, Apple just hasn't finished processing"
  - "D-17 soft-fail scope: TIMEOUT, group-create failure, tester-reconcile failure, OR non-empty reconcileTesters warnings[]. Every post-upload side-effect error downgrades to completed_with_warnings so the pipeline exits 0"
  - "D-19 default group name 'dtc-internal' when apple.ascTestFlightGroup is absent — keeps solo-founder out-of-box flow working with zero extra config"
  - "PhaseId default for polling emitter: 'provision' (existing PhaseId) rather than the as-yet-unregistered 'testflight_upload' — Plan 06 will add 'testflight_upload' to PHASE_ORDER and callers can pass it explicitly via opts.phaseId"
  - "Added AppleConfig.testflightTesters?: string[] (Rule 3 — D-20 reconciliation needs this field; it was implied by the plan but not previously modeled in types-config.ts)"

patterns-established:
  - "Phase handler contract: (runner, config, emitter, ipaPath, buildNumber, marketingVersion, fetchImpl?) → Promise<{ status: 'completed' | 'completed_with_warnings', buildId, ... }>"
  - "Hard-fail vs soft-fail split: TestFlightError thrown for unrecoverable upload/auth/processing failures; completed_with_warnings returned for every post-upload side-effect failure"
  - "Runner-port subprocess invocation: `runner.exec('xcrun', [...])` rather than `runner.exec('altool', [...])` — xcrun is the canonical launcher and what the ASC docs + altool man page specify"

requirements-completed: [TF-01, TF-04]

# Metrics
duration: ~12min
completed: 2026-04-18
---

# Phase 05 Plan 05: testflight_upload Phase Orchestrator Summary

**TestFlight upload phase composed from altool subprocess driver + 30s/45min polling loop + D-09 retry-once + D-17 soft-fail — exactly the vertical slice Plan 06 needs to call from the pipeline.**

## altool Canonical Flag Table (2026)

| Flag                             | Value source                  | Why required                                                      |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `--upload-package`               | `ipaPath`                     | Replaces deprecated `--upload-app` (removed 2024)                 |
| `--type ios`                     | constant                      | Required; altool supports ios / osx / tvos / visionos             |
| `--apple-id`                     | `apple.ascAppId` (numeric)    | Hyphenated — Xcode 26 ignores camelCase variants                  |
| `--bundle-id`                    | `apple.bundleId`              | Must match Info.plist / project.yml; Xcode 26 silent-fails if omitted |
| `--bundle-version`               | `buildNumber` (caller input)  | CFBundleVersion; ASC dedupes on this                              |
| `--bundle-short-version-string`  | `marketingVersion` (caller)   | CFBundleShortVersionString; required by Xcode 26 per fastlane #29743 |
| `--api-key`                      | `apple.ascKeyId` (10-char)    | ASC API key ID; altool resolves the .p8 via the symlink in Pitfall 4 |
| `--api-issuer`                   | `apple.ascIssuerId` (UUID)    | ASC issuer UUID                                                   |
| `--output-format json`           | constant                      | Forces structured stdout for the 3-tier parser                    |

Flags never emitted (negative assertions in tests): `--upload-app`, `--apiKey`, `--apiIssuer`, `--appleId`.

## .p8 Symlink Flow

```
apple.ascKeyPath = /user/keys/AuthKey_KEY1.p8
                           │
                           │  mkdir -p ~/.appstoreconnect/private_keys (mode 0o700)
                           │  stat ~/.appstoreconnect/private_keys/AuthKey_KEY1.p8
                           │     ├── OK → return (idempotent)
                           │     └── ENOENT → symlink apple.ascKeyPath → standard path
                           ▼
~/.appstoreconnect/private_keys/AuthKey_KEY1.p8 -> /user/keys/AuthKey_KEY1.p8
                           │
                           ▼
altool --api-key KEY1 finds the key where it expects it
```

altool's hard-coded search path is `~/.appstoreconnect/private_keys/AuthKey_{keyId}.p8`; our config lets users put the key anywhere, so this symlink reconciles the two. Idempotent — `stat` before `symlink` means re-runs never overwrite.

## 3-Tier parseAltoolOutput Resolution (Pitfall 7 / Q3)

| Tier | Signal                                               | Example                                                                |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | `JSON.parse(stdout).product-errors[] (non-empty)`    | `{"product-errors":[{"message":"ERROR ITMS-90189...","code":-1011}]}`  |
| 2    | `/ERROR\s+ITMS-(\d+)[^\n]*/g` on `stdout+stderr`     | `ERROR ITMS-90478: Bundle version must be higher than...`              |
| 3    | `/ERROR:\s+\[ContentDelivery\.[^\]]+\][^\n]*/g`      | `ERROR: [ContentDelivery.Uploader.102BA2C00] duplicate bundle version` |
| 4 (fallback) | `exitCode !== 0 && no parseable signal`     | `{ message: 'altool exited N with no parseable error' }`               |

Tier 3 is the one that catches Xcode 26's silent-failure regression where altool exits with code 0 but the actual error is scribbled to stderr. Without Tier 3, dtc would think the upload succeeded and proceed to polling, where ASC would never find the build and the 45-min timeout would kick in — a catastrophic UX regression.

## D-09 Retry-Once State Machine

```
upload(buildNumber = opts.buildNumber)
     │
     ├── success=true → continue to findBuildByVersion
     │
     └── success=false && isDuplicateVersionError(itmsCode)
           │
           │  buildNumber = await computeNextBuildNumber(ascOpts, ascAppId)  -- fresh max+1
           │
           ▼
     upload(buildNumber = fresh)
           │
           ├── success=true → continue
           │
           └── success=false && isDuplicateVersionError(itmsCode)
                 │
                 ▼
     throw TestFlightError("altool upload failed twice with duplicate-version...")
```

Retry budget = 1. A second duplicate implies a concurrent dtc run raced us past the fresh max — the safest recovery is to ask the user to re-run dtc so we start from a newly-queried max.

## D-15 Polling Parameters

| Parameter    | Value                | Why                                                                 |
| ------------ | -------------------- | ------------------------------------------------------------------- |
| Baseline     | 30,000 ms            | Typical ASC processing: 3-20 min; 30s gives ~40-90 calls, well under rate cap |
| Jitter       | ±5,000 ms (uniform)  | Prevents thundering-herd when two dtc runs poll concurrently        |
| Hard timeout | 45 × 60,000 ms       | 99th percentile of normal processing is ~35 min; 45 gives 10-min buffer |
| On VALID     | Return `'VALID'`     | Proceed to group + tester assignment                                |
| On FAILED/INVALID | Return state    | Caller throws TestFlightError (Apple rejected the build)            |
| On TIMEOUT   | Return `'TIMEOUT'`   | Caller returns `completed_with_warnings` (D-17 soft-fail)           |
| Per-tick emit | `running` event with `Apple processing build... N min elapsed` | ProgressEmitter → terminal UI / MCP client |

## D-17 Soft-Fail Triggers

All of these return `{ status: 'completed_with_warnings', buildId, warnings: [...] }` (pipeline exit 0):

1. **Polling TIMEOUT (45 min)** — build is uploaded; processing continues at Apple. Warning tells user to check ASC.
2. **`findOrCreateInternalGroup` throws** — wrapped in `try/catch` in the orchestrator; emits assignment-failed warning.
3. **`reconcileTesters` throws** — same try/catch.
4. **`reconcileTesters` returns non-empty `warnings[]`** — per-tester team-membership warnings from D-21 surface directly.

Hard-fails (throw TestFlightError, pipeline exit 1):
- Missing creds (`apple.ascAppId | ascKeyId | ascIssuerId | ascKeyPath | bundleId`).
- altool upload non-duplicate failure OR duplicate after retry.
- `findBuildByVersion` returns null (altool claimed success, build doesn't exist).
- `pollUntilProcessed` returns `'FAILED'` or `'INVALID'`.

## D-19 Default Group Fallback

```typescript
const groupName = apple.ascTestFlightGroup ?? 'dtc-internal'
```

Solo founders who never touch `ascTestFlightGroup` still get a working internal beta group. `findOrCreateInternalGroup` from Plan 03 forces `hasAccessToAllBuilds: true` on creation (Q1), so any build — past or future — is automatically available to the group.

## Task Commits

1. **Task 1: Wave-0 altool tests** — `d63c2ef` (test)
2. **Task 2: Wave-0 testflight_upload phase tests** — `50f4534` (test)
3. **Task 3: Implement altool + polling + phase + barrel** — `47c8d87` (feat)

TDD flow: Task 1 + Task 2 committed RED (`Cannot find module ../src/altool.js` and `.../testflight-upload-phase.js`); Task 3 turned all 20 tests GREEN while keeping the previously-GREEN 52 provision tests green (total 72/72).

## Files Created/Modified

- `packages/provision/src/altool.ts` — 160 lines. `ensureKeyAtStandardPath(keyPath, keyId)`, `uploadIpa(args): Promise<AltoolResult>`, `parseAltoolOutput(stdout, stderr, exitCode)`. No ASC CLI shell-out; all subprocess invocations via `runner.exec('xcrun', [...])`.
- `packages/provision/src/testflight-polling.ts` — 52 lines. `pollUntilProcessed(opts)` returns `'VALID' | 'INVALID' | 'FAILED' | 'TIMEOUT'`. Emits `running` event per tick with elapsed-minutes message. `opts.phaseId` defaults to `'provision'`; `opts.intervalMs` defaults to 30s; `opts.timeoutMs` defaults to 45min.
- `packages/provision/src/testflight-upload-phase.ts` — 183 lines. `runTestFlightUploadPhase(opts)` composes upload → D-09 retry → findBuildByVersion → pollUntilProcessed → D-19 group ensure → D-20 reconcileTesters → D-17 soft-fail. Credential validation at entry; typed errors via `TestFlightError`.
- `packages/provision/src/index.ts` — barrel updated with `export * from './altool.js'`, `export * from './testflight-polling.js'`, `export { runTestFlightUploadPhase }`, and its result/opts types.
- `packages/core/src/types-config.ts` — `AppleConfig` gains `testflightTesters?: string[]` (Rule 3 — see Deviations).
- `packages/provision/__tests__/altool.test.ts` — 316 lines, 11 tests covering canonical flag set + deprecated-flag negatives + symlink idempotency + 3-tier parser + `isDuplicateVersionError`.
- `packages/provision/__tests__/testflight-upload-phase.test.ts` — 346 lines, 9 tests covering happy path + D-09 retry success + D-09 hard-fail + polling VALID/TIMEOUT/FAILED + D-17 tester/group failure + D-19 default group fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added `AppleConfig.testflightTesters?: string[]`**
- **Found during:** Task 3 implementation (typecheck of `runTestFlightUploadPhase` which references `apple.testflightTesters`).
- **Issue:** The plan's `<must_haves>` references `apple.testflightTesters` as a config field and the test fixture `APPLE` in `testflight-upload-phase.test.ts` sets `testflightTesters: ['alice@example.com']`, but `AppleConfig` in `packages/core/src/types-config.ts` did not model this field. Building against the existing type would have forced a cast.
- **Fix:** Appended `testflightTesters?: string[]` with a doc comment to `AppleConfig` (1 field, 3 lines). Rebuilt `@appifex/core` so `dist/` stays in sync for downstream consumers. No behaviour change outside this plan's consumers.
- **Files modified:** `packages/core/src/types-config.ts`
- **Verification:** `pnpm -C packages/core exec tsc --noEmit` and `pnpm -C packages/provision exec tsc --noEmit` both exit 0; all 72 provision tests pass; no regressions.
- **Committed in:** `47c8d87` (Task 3 commit)

**2. [Rule 1 — Bug] vi.mock hoisting fix in altool.test.ts**
- **Found during:** Task 3 first test run (Cannot access 'fsMocks' before initialization).
- **Issue:** `vi.mock('node:fs/promises', () => fsMocks)` is hoisted to the top of the file by vitest, so the factory referenced `fsMocks` before the local `const fsMocks = {...}` line ran. This is a well-known vitest hoisting trap.
- **Fix:** Wrapped the mock registry in `vi.hoisted(() => ({...}))` so the registry is created together with the hoisted `vi.mock` call. The test body still mutates the same object via `fsMocks.mkdir.mockClear()` / `fsMocks.stat.mockReset()` etc.
- **Files modified:** `packages/provision/__tests__/altool.test.ts`
- **Verification:** All 11 altool tests pass.
- **Committed in:** `47c8d87` (Task 3 commit — same file as the implementation because the fix was needed to turn RED → GREEN; the Task 1 commit left the RED "Cannot find module" state unchanged).

**3. [Rule 1 — Bug] D-15 TIMEOUT warning message includes 'ASC'**
- **Found during:** Task 3 first test run (assertion `/processing.*check ASC|ASC/i` failed on original message).
- **Issue:** Task 2's test was written with a regex asserting the TIMEOUT warning message contains "ASC" — the three-letter shorthand for App Store Connect. My initial implementation used the full "App Store Connect" which doesn't contain the substring "ASC".
- **Fix:** Changed the TIMEOUT warning to `"...Check ASC (App Store Connect) for status..."` — preserves the three-letter shorthand while keeping the expansion for first-time users.
- **Files modified:** `packages/provision/src/testflight-upload-phase.ts`
- **Verification:** All 9 testflight-upload-phase tests pass.
- **Committed in:** `47c8d87` (Task 3 commit)

### Out-of-scope / deferred

None introduced by this plan.

---

**Total deviations:** 3 auto-fixed (1 blocking type extension, 2 TDD bugs). No architectural changes. No scope creep.

## Issues Encountered

- **Pre-existing lint error:** `pnpm -w run lint` fails with 1 pre-existing ESLint error in `cli/__tests__/pipeline-epipe.test.ts` (`Function` type — originates from Phase 02-03 commit `4309186`) plus ~201 pre-existing warnings. None of these originate from this plan's files; `pnpm -C packages/core exec tsc --noEmit` and `pnpm -C packages/provision exec tsc --noEmit` are both clean. Per scope boundary rule, this was not fixed.
- **Stray orphan file in Task 1 commit:** The Task 1 commit (`d63c2ef`) accidentally included a pre-staged `.planning/phases/02-foundation-hardening/02-VALIDATION.md` that was in `git add` index at worktree startup (inherited from the wave-1 merge state). This file is unrelated to Plan 05 but does no harm. Noting here so the orchestrator can squash/cleanup during wave merge if desired.
- **Worktree stray files:** `git status` at start showed `M .planning/ROADMAP.md`, `D SECURITY.md`, `?? GoogleService-Info.plist`, `M packages/build/src/swift-archive.ts` — all pre-existing worktree state, not touched by this plan. Explicit staging (`git add <specific-files>`) was used for Task 3 to avoid dragging them in.
- **`asc` community-CLI shell-out still present in `asc-client.ts`:** The grep guard `! grep -rE "runner\.exec\(['\"]asc['\"]" packages/provision/src/` fails because `packages/provision/src/asc-client.ts` still exists (Plan 06 will delete it). The plan's acceptance criterion is scoped to `altool.ts` + `testflight-upload-phase.ts` — both clean.

## Threat Flags

None introduced beyond the plan's declared threat model (T-5-01 / T-5-03 / T-5-04 / T-5-05 / T-5-06 / T-5-07 / T-5-12 / T-5-13). All are fully mitigated:

- **T-5-01 (altool spoofing):** altool consumes the .p8 at the standard path; dtc only ensures the symlink. No JWT handling inside altool.ts. Verified by the absence of `signAscJwt` import in `altool.ts`.
- **T-5-03 (.p8 tampering):** `ensureKeyAtStandardPath` creates the dir with mode `0o700`; `stat`-first ensures we never overwrite.
- **T-5-04 (info disclosure via altool errors):** `parseAltoolOutput` extracts only `{ message, code, itmsCode }` — never `Authorization` headers. altool itself never prints JWT material.
- **T-5-05 (add-only testers):** `reconcileTesters` from Plan 03 is add-only; no `DELETE` call path in this plan's code.
- **T-5-06 (group idempotency):** `findOrCreateInternalGroup` from Plan 03 GETs before POSTing.
- **T-5-07 (ITSAppUsesNonExemptEncryption placement):** Upload driver does not touch `project.yml`; placement is owned by Plans 01/02/04.
- **T-5-12 (Xcode 26 silent-failure):** parseAltoolOutput Tier 3 (ContentDelivery regex) catches the exit-0 + stderr-error pattern. Plan 06's D-16 ASC cross-check will add a second safety net at integration.
- **T-5-13 (45-min stall):** D-17 soft-fail returns `completed_with_warnings` with "check ASC" guidance; pipeline exits 0.

## Known Stubs

None. All exported functions are fully implemented. No TODO placeholders, no hardcoded empty returns.

## User Setup Required

From the plan's `user_setup` block (informational; the setup wizard in Plan 03 handles this):

- Apple Developer → App Store Connect → Users and Access → Integrations — generate an in-house API key (.p8 file + keyId + issuerId).
- Populate `~/.dtc/config.json`:
  - `apple.ascAppId` (numeric App Store Connect app ID)
  - `apple.ascKeyId` (10-char key ID)
  - `apple.ascIssuerId` (UUID)
  - `apple.ascKeyPath` (absolute path to the downloaded .p8)
  - `apple.bundleId` (matches Xcode target)
  - `apple.testflightTesters` (optional array of tester emails; solo founder default: their own ASC team email)
  - `apple.ascTestFlightGroup` (optional; defaults to `'dtc-internal'`)

No new environment variables.

## Next Plan Readiness

**Ready for Plan 06 (pipeline wiring):**
- Import `runTestFlightUploadPhase` + `TestFlightUploadPhaseOpts` + `TestFlightUploadPhaseResult` from `@appifex/provision`.
- Pipeline needs to add `'testflight_upload'` to `PHASE_ORDER` (currently the polling emitter defaults to `'provision'`; Plan 06 can pass `phaseId: 'testflight_upload'` via the (optional) PollOpts override if it extends the PhaseId enum first).
- Phase 05 Plan 06 will also delete `packages/provision/src/asc-client.ts` and its barrel re-exports, as documented in Plan 03's summary.

---

## Self-Check: PASSED

**Files verified (exist):**
- `packages/provision/src/altool.ts` — FOUND
- `packages/provision/src/testflight-polling.ts` — FOUND
- `packages/provision/src/testflight-upload-phase.ts` — FOUND
- `packages/provision/src/index.ts` — FOUND (modified with new re-exports)
- `packages/core/src/types-config.ts` — FOUND (AppleConfig.testflightTesters added)
- `packages/provision/__tests__/altool.test.ts` — FOUND
- `packages/provision/__tests__/testflight-upload-phase.test.ts` — FOUND

**Commits verified (exist in git log):**
- `d63c2ef` — FOUND: test(05-05): add Wave-0 RED tests for altool subprocess driver
- `50f4534` — FOUND: test(05-05): add Wave-0 RED tests for testflight_upload phase handler
- `47c8d87` — FOUND: feat(05-05): implement altool + polling + testflight_upload phase (TF-01, TF-04)

**Test suite check:**
- `pnpm vitest run packages/provision/__tests__/` — 72/72 pass (52 pre-existing + 20 new)
- `pnpm -C packages/provision exec tsc --noEmit` — clean
- `pnpm -C packages/core exec tsc --noEmit` — clean

---
*Phase: 05-xcode-archive-testflight-upload*
*Plan: 05*
*Completed: 2026-04-18*
