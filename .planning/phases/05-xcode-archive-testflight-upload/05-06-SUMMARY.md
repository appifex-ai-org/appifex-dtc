---
phase: 05-xcode-archive-testflight-upload
plan: 06
subsystem: pipeline
tags: [pipeline-wiring, phase-order, cli-flag, wizard, soft-fail, d-03, d-04, d-17, d-18, tf-01, tf-04]

# Dependency graph
requires:
  - phase: 05-xcode-archive-testflight-upload
    plan: 01
    provides: project-yml shared helpers
  - phase: 05-xcode-archive-testflight-upload
    plan: 02
    provides: archiveSwift rewrite with marketingVersion + buildNumber opts
  - phase: 05-xcode-archive-testflight-upload
    plan: 03
    provides: asc-rest primitives + ArchiveError/TestFlightError
  - phase: 05-xcode-archive-testflight-upload
    plan: 04
    provides: runXcodeArchivePhase orchestrator
  - phase: 05-xcode-archive-testflight-upload
    plan: 05
    provides: runTestFlightUploadPhase orchestrator + AppleConfig.testflightTesters
provides:
  - PhaseId union extended with 'xcode_archive' + 'testflight_upload'
  - CheckpointData branches for both new phases (incl. D-17 warnings[])
  - PHASE_ORDER slotted: ...deliver → xcode_archive → testflight_upload → report
  - cli/src/pipeline.ts xcode_archive + testflight_upload phase blocks
  - cli/src/pipeline.ts iOS branch of legacy 'provision' phase DELETED
  - cli/src/entry.ts --skip-testflight flag + PipelineOpts.skipTestflight
  - cli/src/entry.ts `dtc provision submit` iOS path rewritten to use orchestrators
  - packages/mcp-server/src/tools/provision.ts iOS handler rewritten likewise
  - cli/src/setup/apple.ts testflightTesters comma-separated prompt (D-18)
  - packages/provision/src/asc-client.ts DELETED (community CLI shell-out removed)
  - Integration test suite: phase-05-wiring + phase-05-soft-fail
affects:
  - All future runs of `dtc run --platform swiftui`
  - Phase 6 (Maestro gate) — can now insert between 'fix' and 'xcode_archive' without renumbering

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated phase blocks per responsibility — xcode_archive and testflight_upload emit distinct progress/checkpoint rows (vs. one monolithic 'provision' row); mirrors firebase_provision shape"
    - "Checkpoint-driven inter-phase handoff — testflight_upload reads xcode_archive's checkpoint row for ipaPath/buildNumber/marketingVersion instead of passing an in-memory object"
    - "D-17 soft-fail at the wiring layer — completed_with_warnings status from the orchestrator is translated to progress-event 'completed' (NOT 'failed') so exit code stays 0 while warnings surface in the message"
    - "Source-level verification tests — phase-05-soft-fail.test.ts regex-matches pipeline.ts source to lock the D-17 branch shape at CI time; prevents silent regressions during future pipeline edits"

key-files:
  created:
    - cli/__tests__/phase-05-wiring.test.ts
    - cli/__tests__/phase-05-soft-fail.test.ts
    - .planning/phases/05-xcode-archive-testflight-upload/05-06-SUMMARY.md
  modified:
    - packages/core/src/types-pipeline.ts
    - packages/core/src/run-context.ts
    - cli/src/pipeline.ts
    - cli/src/entry.ts
    - cli/src/setup/apple.ts
    - packages/provision/src/index.ts
    - packages/provision/README.md
    - packages/mcp-server/src/tools/provision.ts
  deleted:
    - packages/provision/src/asc-client.ts
    - packages/provision/__tests__/provision.test.ts

key-decisions:
  - "Delete legacy 'provision' PhaseId iOS branch entirely (not re-point it at new orchestrators) — the new dedicated phases own iOS; Android path stays on 'provision' pending a later Kotlin→Play hardening milestone. Cleaner mental model than overloading a single phase for both platforms"
  - "testflight_upload reads archive metadata from the xcode_archive checkpoint row (not from an in-memory pipeline variable) — makes resume work correctly: if the pipeline crashes between phases, a restart finds the archive metadata in SQLite and doesn't re-archive"
  - "D-17 soft-fail translation lives in pipeline.ts (not in the orchestrator) — the orchestrator returns an explicit status discriminant ('completed' | 'completed_with_warnings'), and pipeline.ts translates both to ProgressEvent status='completed'. This keeps the orchestrator policy-agnostic; callers can treat completed_with_warnings as failure if they want, but the default pipeline does not"
  - "Delete provision.test.ts entirely instead of trimming to play-console tests — play-console.test.ts already covers that surface; keeping an empty/partial provision.test.ts would invite future AscClient-style ad-hoc additions"
  - "Source-level regex test for pipeline.ts D-17 branch — a pure functional test would require spinning up the whole pipeline with mocks; the regex assertion catches the structural invariant (emit('testflight_upload','completed',...) reachable from the completed_with_warnings branch) at essentially zero runtime cost. Paired with a functional test of the orchestrator to guard the contract end-to-end"
  - "--skip-testflight gates ONLY testflight_upload (xcode_archive still runs) — solo founders sometimes want the .ipa on disk to test via Xcode directly before uploading; skipping both would make the flag useless for the common case"
  - "Wizard preserves existing testers on empty input — typing nothing keeps the current list rather than wiping it; prevents accidental tester loss during re-runs of `dtc setup apple`"

patterns-established:
  - "Pipeline phase block template: started emit → try { orchestrator call → checkpoint save → completed/skipped emit } catch { savePhase failed → emit failed → flushContext → rethrow }. All four phases added in Phase 5 (xcode_archive + testflight_upload) follow this shape, matching firebase_provision from Phase 4"
  - "Soft-fail discriminated union at orchestrator → pipeline boundary: orchestrators return { status: 'completed' | 'completed_with_warnings', ... }, pipeline translates completed_with_warnings to emit('completed') while persisting warnings[] in the checkpoint. Gives future phases a canonical pattern for 'succeeded but with caveats' — emit green, log the caveats"

requirements-completed: [TF-01, TF-04]

# Metrics
duration: ~25min
completed: 2026-04-18
---

# Phase 05 Plan 06: Pipeline Wiring + Orchestration Summary

**Wire the Phase 5 Plans 01-05 artifacts into the pipeline: extend PhaseId/PHASE_ORDER/CheckpointData, add two new phase blocks (xcode_archive + testflight_upload), delete the community `asc` CLI shell-out permanently, thread `--skip-testflight` from CLI to pipeline, and capture internal TestFlight tester emails in the setup wizard — so `dtc run --platform swiftui` with ASC creds now delivers an archived + uploaded + tester-assigned TestFlight build with zero manual Xcode / ASC UI steps.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-18T07:59:00Z
- **Completed:** 2026-04-18T08:16:00Z
- **Tasks:** 4/4
- **Files created:** 3 (2 test files + this SUMMARY)
- **Files modified:** 8
- **Files deleted:** 2

## Task Commits

1. **Task 1: Extend types + run-context + AppleConfig** — `621e185` (feat)
2. **Task 2: Delete asc-client.ts, scrub stale references (D-03)** — `13bebb7` (refactor)
3. **Task 3: Pipeline wiring + CLI flag + wizard extension** — `e9b7046` (feat)
4. **Task 4: Integration tests — phase-05-wiring + phase-05-soft-fail** — `7450583` (test)

## PHASE_ORDER Diff

```
  ...
  'fix',
  'deliver',
+ 'xcode_archive',      // Phase 5 (TF-01 D-02)
+ 'testflight_upload',  // Phase 5 (TF-01 D-02)
  'report',
```

The legacy `'provision'` PhaseId remains in the union for type completeness (it's still written to by the Android branch) but is NOT in PHASE_ORDER — Pitfall 1 preserved.

## Type Extensions

**PhaseId** gains two literals:
- `'xcode_archive'`
- `'testflight_upload'`

**CheckpointData** gains two branches:

```ts
xcode_archive:
  | (CheckpointBase & {
      ipaPath?: string
      archivePath?: string
      buildNumber?: string
      marketingVersion?: string
      bundleId?: string
    })
  | CheckpointFailed
  | CheckpointSkipped

testflight_upload:
  | (CheckpointBase & {
      buildId?: string
      processingState?: 'PROCESSING' | 'VALID' | 'INVALID' | 'FAILED'
      groupId?: string
      testersAdded?: number
      warnings?: string[]  // D-17 soft-fail
    })
  | CheckpointFailed
  | CheckpointSkipped
```

**AppleConfig.testflightTesters** already existed from Plan 05 (D-18); this plan added wizard capture for it.

## pipeline.ts Diff Summary

Legacy `// 10. Provision` block:
- **Removed:** entire iOS branch (~55 lines) — was `if (opts.platform === 'swiftui' && hasFullAscCreds && ...)` doing `archiveSwift` + `new AscClient(...)` + `asc.submitTestFlight(...)`.
- **Kept:** Android/Play Console branch + `else if (opts.platform === 'kotlin-compose' ...)` skip branches.
- **Simplified:** fall-through branches since SwiftUI no longer emits `provision` events.

Two **new** phase blocks added directly after the legacy provision block:

- **`xcode_archive`** (~55 lines): calls `runXcodeArchivePhase(...)`, branches on `archive.skipped` (D-16 idempotent short-circuit) vs. success, persists ipaPath/buildNumber/marketingVersion/bundleId to the checkpoint row, emits `completed` or `skipped`. Gated by `opts.platform === 'swiftui' && hasFullAscCreds && report.summary.allGreen`.

- **`testflight_upload`** (~75 lines): reads the xcode_archive checkpoint row for metadata (ipaPath/buildNumber/marketingVersion); calls `runTestFlightUploadPhase(...)`; D-17 soft-fail translator converts `completed_with_warnings` → `emit('completed', ...)` + checkpoint row with `status:'completed'` + `warnings[]`. Gated by `opts.platform === 'swiftui' && !opts.skipTestflight && hasFullAscCreds && report.summary.allGreen`.

Both blocks support the `canSkipPhase()` checkpoint-resume path — re-running `dtc run` on a completed checkpoint emits `skipped (checkpoint complete)`.

Imports removed from pipeline.ts: `AscClient`, `archiveSwift` (both unused post-removal). Imports added: `runXcodeArchivePhase` from `@appifex/build`, `runTestFlightUploadPhase` from `@appifex/provision`.

## --skip-testflight Wiring

1. Parsed in `cli/src/cli.ts` via the generic bare-flag loop (no whitelist changes needed).
2. Read in `cli/src/entry.ts`: `const skipTestflight = args.flags['skip-testflight'] === true`.
3. Threaded into `renderRunApp({ ..., skipTestflight })` → `PipelineOpts.skipTestflight` → consumed at the testflight_upload phase gate.
4. Help text line added: `--skip-testflight       Skip testflight_upload phase (xcode_archive still runs for local .ipa)`.

When `--skip-testflight` is set: `xcode_archive` runs (produces `.ipa`), `testflight_upload` emits `'skipped (--skip-testflight)'`, pipeline exits 0.

## Wizard Extension (D-18)

`cli/src/setup/apple.ts` gained a final prompt inside `p.group({ ... })`:

```
? TestFlight internal tester emails (comma-separated, optional — press Enter to skip)
  alice@example.com,bob@example.com
```

Parsing: trim + split on `,` + filter blanks. **Empty input preserves existing testers** (non-destructive re-run of `dtc setup apple`). Result stored as `apple.testflightTesters: string[] | undefined`.

## asc-client.ts Deletion (D-03)

- Deleted: `packages/provision/src/asc-client.ts` (AscClient + env-var based `asc` CLI shell-out).
- Deleted: `packages/provision/__tests__/provision.test.ts` (100% AscClient tests; new coverage is in `asc-rest.test.ts` from Plan 03).
- Purged from `packages/provision/src/index.ts` barrel (AscClient + related types no longer re-exported).
- Rewrote `cli/src/entry.ts` `provision submit` iOS branch to use `runXcodeArchivePhase` + `runTestFlightUploadPhase` — handles both the fresh-archive case and the pre-built-`--ipa` case (requires explicit `--marketing-version` + `--build-number` flags for the latter).
- Rewrote `packages/mcp-server/src/tools/provision.ts` `handleIosSubmit` similarly.
- Updated `packages/provision/README.md` to reference `xcrun altool --upload-package` instead of `brew install asc`.

Grep guard (VALIDATION 5-06-02) now finds **zero** `runner.exec('asc', ...)` or `exec('asc', ...)` shell-out sites anywhere in `packages/` or `cli/src/`.

## Integration Test Coverage

### phase-05-wiring.test.ts (9 tests, GREEN)

Covers VALIDATION rows 5-06-01 + 5-06-02:

| # | Assertion | VALIDATION row |
|---|-----------|----------------|
| 1 | `PHASE_ORDER.indexOf('xcode_archive') === PHASE_ORDER.indexOf('deliver') + 1` | 5-06-01 |
| 2 | `PHASE_ORDER.indexOf('testflight_upload') === PHASE_ORDER.indexOf('xcode_archive') + 1` | 5-06-01 |
| 3 | `PHASE_ORDER.indexOf('report') === PHASE_ORDER.indexOf('testflight_upload') + 1` | 5-06-01 |
| 4 | `Checkpoint.savePhase/getPhase` round-trips full `xcode_archive` payload (ipaPath, buildNumber, marketingVersion, bundleId) | 5-06-01 |
| 5 | `Checkpoint.savePhase/getPhase` round-trips full `testflight_upload` payload including `warnings[]` | 5-06-01 |
| 6 | `packages/provision/src/asc-client.ts` does NOT exist | D-03 |
| 7 | Walks `packages/` + `cli/src/`; asserts no file shells out to `asc` CLI via `runner.exec('asc', …)` or `exec('asc', …)` | 5-06-02 |

### phase-05-soft-fail.test.ts (4 tests, GREEN)

Covers VALIDATION row 5-06-03:

| # | Assertion |
|---|-----------|
| 1 | `runTestFlightUploadPhase` with `reconcileTesters` throwing returns `{ status: 'completed_with_warnings', buildId: 'b1', warnings: [...] }` |
| 2 | `runTestFlightUploadPhase` with `reconcileTesters` returning non-empty `warnings[]` surfaces those warnings verbatim |
| 3 | Source-level regex: `pipeline.ts` contains the `completed_with_warnings` branch whose first `emit('testflight_upload', ...)` call passes status literal `'completed'` |
| 4 | Source-level regex: `pipeline.ts` `completed_with_warnings` branch's `savePhase('testflight_upload', { ... })` payload includes `status: 'completed'` + `warnings` |

Functional tests mock `asc-rest.js` / `altool.js` / `testflight-polling.js` via `vi.mock` so the orchestrator runs fully in-process. Source-level tests read `pipeline.ts` and regex-match the branch shape — guards against silent regressions when pipeline.ts is edited in the future.

## Decisions Made

All seven decisions listed in the frontmatter `key-decisions` block. Summary:

1. **Delete legacy provision iOS branch** rather than repointing it — cleaner mental model.
2. **Checkpoint-driven phase handoff** rather than in-memory variable — resume semantics.
3. **D-17 translation at pipeline layer** rather than orchestrator — policy-agnostic orchestrator.
4. **Delete provision.test.ts entirely** rather than trim — prevents AscClient drift.
5. **Source-level regex guard for D-17** in addition to functional test — cheap regression gate.
6. **--skip-testflight gates only upload** (archive still runs) — solo founder workflow.
7. **Wizard preserves testers on empty input** — non-destructive re-runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added narrow check on `archive.ipaPath` before passing to `runTestFlightUploadPhase`**

- **Found during:** Task 2 rewriting `cli/src/entry.ts` + `packages/mcp-server/src/tools/provision.ts` to use the new orchestrators.
- **Issue:** `XcodeArchivePhaseResult` extends `ArchiveResult` which has `ipaPath?: string` (optional — the archive may fail mid-way). Passing `archive.ipaPath` (of type `string | undefined`) to `runTestFlightUploadPhase({ ipaPath: string, ... })` failed `tsc --noEmit` with `Type 'string | undefined' is not assignable to type 'string'`.
- **Fix:** Added a runtime narrow check in each call site: `if (!archive.ipaPath) { /* error out */ }` before the upload call. Keeps the narrow-to-string invariant explicit at each site; avoids tampering with `ArchiveResult` shape (which is stable across Plans 02 and 04).
- **Files modified:** `cli/src/entry.ts`, `packages/mcp-server/src/tools/provision.ts`
- **Verification:** `pnpm -C cli exec tsc --noEmit` exits 0; `pnpm -C packages/mcp-server exec tsc --noEmit` exits 0.
- **Committed in:** `13bebb7` (Task 2).

**2. [Rule 3 — Blocking] Removed unused `archiveSwift` + `TestFlightError` imports from `cli/src/pipeline.ts`**

- **Found during:** Task 2 + Task 3 cleanup.
- **Issue:** After deleting the legacy iOS branch, `archiveSwift` was no longer called in pipeline.ts. Lint flagged it as unused and the import was dead code. Similarly, `TestFlightError` added to the import list in Task 3 for the new phase block ended up unused (the new block uses `ArchiveError` via thrown errors from the orchestrator, but does not construct `TestFlightError` directly).
- **Fix:** Removed both imports; TypeScript + lint both clean.
- **Files modified:** `cli/src/pipeline.ts`
- **Verification:** `pnpm -C cli exec tsc --noEmit` clean.
- **Committed in:** `13bebb7` (archiveSwift removal) + `e9b7046` (TestFlightError never actually landed in the commit — removed before commit in Task 3's lint-staged pass).

**3. [Rule 3 — Blocking] Rebuilt `@appifex/core` + `@appifex/build` + `@appifex/provision` dist after type extensions**

- **Found during:** Task 3 first `tsc --noEmit` run on cli/ — 20 errors all reporting "Argument of type '"xcode_archive"' is not assignable to parameter of type 'PhaseId'" because the cli package resolves `@appifex/core` via `packages/core/dist/` (per `package.json::exports`), and that directory had stale declarations without the two new PhaseId literals.
- **Fix:** `pnpm -C packages/core run build` — rebuilt dist to include the new PhaseId union. Repeat for `packages/build` + `packages/provision` so their dist stays in lockstep with consumers. Also manually removed the stale `dist/asc-client.*` files (tsc doesn't prune deleted source file outputs).
- **Files modified:** `packages/core/dist/**`, `packages/build/dist/**`, `packages/provision/dist/**` (build outputs; gitignored).
- **Verification:** cli/mcp-server/provision tsc all exit 0. Full suite (1484 tests) passes.
- **Committed in:** N/A (dist is gitignored — the rebuild runs at pnpm install/build time for consumers).

**4. [Rule 1 — Bug] Fixed bin-dtc-launcher.test.ts failure after pipeline.ts edits**

- **Found during:** Task 2 first full-suite run.
- **Issue:** `cli/__tests__/bin-dtc-launcher.test.ts` spawns `bin/dtc` (which resolves to `cli/dist/entry.js`) and asserts exit code 0 for `--help`. After removing the AscClient import from `cli/src/pipeline.ts`, the stale `cli/dist/` still imported `AscClient` from `@appifex/provision` — which no longer exports it. Subprocess exited 1.
- **Fix:** `pnpm -C cli run build` rebuilt the cli dist. Test passes. Added a "rebuild cli after pipeline edits" mental note for future runs.
- **Files modified:** `cli/dist/**` (build output; gitignored).
- **Verification:** `pnpm vitest run cli/__tests__/bin-dtc-launcher.test.ts` exits 0.
- **Committed in:** N/A (dist is gitignored; the test picks up the rebuilt file on next run).

---

**Total deviations:** 4 auto-fixed (3 blocking type/build issues, 1 test regression from stale dist).
**Impact on plan:** All four are mechanical build/dist synchronization issues that don't affect the source-level plan scope. No architectural changes. No scope creep.

## Issues Encountered

- **Pre-existing lint error in `cli/__tests__/pipeline-epipe.test.ts`:** `The 'Function' type accepts any function-like value` (originates from commit `4309186` in Phase 02-03). Out of this plan's scope per the scope boundary rule; Plan 06 did not touch that file. Documented here so the verifier knows not to flag it as Plan 06's regression.
- **Pre-existing worktree stray files:** `M .planning/ROADMAP.md`, `D SECURITY.md`, `?? GoogleService-Info.plist` — all inherited from prior phase worktree state. Explicit staging (`git add <specific-files>`) used for every task commit to avoid dragging them in. These remain un-staged after this plan.
- **Lefthook `format-staged` reformatted two files during commit** — `packages/core/src/run-context.ts` and `packages/core/src/types-pipeline.ts` had trailing spaces or comment-style normalizations applied. Content equivalent; no source re-edit needed.
- **Parallel-executor branch topology:** Per the repo's documented Phase 5 parallel-execute pattern (and matching Plan 04 + 05 SUMMARY notes), Wave 3 commits land on `main` directly. This plan's four task commits (`621e185`, `13bebb7`, `e9b7046`, `7450583`) are on `main`. Consistent with the documented pattern.

## Threat Flags

None introduced beyond the plan's declared threat model (T-5-01, T-5-03, T-5-06, T-5-13, T-5-14, T-5-15). All are fully mitigated:

- **T-5-01 (ASC REST propagation):** `hasFullAscCreds` gate checks all four `apple.*` credentials; missing creds → `emit('xcode_archive', 'skipped', 'Apple TestFlight credentials not configured — run dtc setup apple')`.
- **T-5-03 (--skip-testflight flag precedence):** flag gates only `testflight_upload` phase; `xcode_archive` still runs (intentional per D-04).
- **T-5-06 (asc-client.ts deletion safety):** phase-05-wiring.test.ts asserts file gone AND grep guard confirms no remaining imports. CI-gated regression prevention.
- **T-5-13 (D-17 soft-fail integration):** phase-05-soft-fail.test.ts asserts both functional orchestrator contract AND source-level pipeline.ts branch shape. Exit 0 invariant locked.
- **T-5-14 (tester emails in config):** emails stored in `~/.dtc/config.json` (existing 0600 perms from Phase 3 hardening). No new disclosure surface.
- **T-5-15 (community CLI shell-out regression):** phase-05-wiring.test.ts grep guard scans all TS sources in `packages/` + `cli/src/`; CI gate prevents reintroduction.

## Known Stubs

None. All phase blocks have full implementations. No TODO/FIXME/placeholder content in any modified file.

## User Setup Required

Documented in `05-05-SUMMARY.md` (Plan 05) — unchanged by this plan:

- Apple Developer → App Store Connect API key (.p8 + keyId + issuerId).
- Populate `apple.*` fields in `~/.dtc/config.json` via `dtc setup apple` (wizard now prompts for `testflightTesters` in addition to all prior fields).

No new environment variables. No new external service configuration.

## Next Plan Readiness

**Phase 5 is END-TO-END complete.** A `dtc run --platform swiftui --out ./app` against a project with full Apple creds + TestFlight configured will now:

1. Run all 17 prior phases (analysis → deliver).
2. Archive `.ipa` via `xcode_archive` (uses package.json version + ASC-computed next build number; skips if ASC already has a VALID build at that version per D-16).
3. Upload `.ipa` to ASC via `testflight_upload` → poll 45min → assign to internal group → reconcile testers → exit 0. Soft-fail surfaces warnings but keeps exit 0.
4. Final report row includes both new phases.

Phase 6 (Maestro gate) can insert between `'fix'` and `'xcode_archive'` without renumbering — PHASE_ORDER is designed for clean insertion at that boundary.

## TDD Gate Compliance

Plan type is `execute` (per frontmatter `type: execute`), not `tdd`, so the RED/GREEN/REFACTOR gate sequence does not apply as a plan-level requirement. Each task was committed atomically in conventional-commit style:

1. `621e185` — feat(05-06): types + PHASE_ORDER
2. `13bebb7` — refactor(05-06): asc-client deletion + scrub
3. `e9b7046` — feat(05-06): pipeline wiring + CLI flag + wizard
4. `7450583` — test(05-06): integration test suite

The integration tests (Task 4) were written AFTER the implementation (Task 3) since the test targets source-level assertions that require the pipeline.ts edits to exist first. This is a standard "acceptance test" pattern distinct from TDD's pre-implementation RED phase.

## Self-Check

**Files verified (exist):**
- `cli/__tests__/phase-05-wiring.test.ts` — FOUND (9 tests, GREEN)
- `cli/__tests__/phase-05-soft-fail.test.ts` — FOUND (4 tests, GREEN)
- `packages/core/src/types-pipeline.ts` — FOUND (extended with 2 new PhaseId literals + 2 new CheckpointData branches)
- `packages/core/src/run-context.ts` — FOUND (extended PHASE_ORDER)
- `cli/src/pipeline.ts` — FOUND (2 new phase blocks; legacy iOS branch removed)
- `cli/src/entry.ts` — FOUND (--skip-testflight flag + help text + renderRunApp call updated + provision submit iOS rewritten)
- `cli/src/setup/apple.ts` — FOUND (testers prompt added + parsing + config write)
- `packages/provision/src/index.ts` — FOUND (barrel purged of AscClient)
- `packages/provision/src/asc-client.ts` — ABSENT (deleted per D-03)
- `packages/provision/__tests__/provision.test.ts` — ABSENT (deleted along with AscClient)
- `packages/mcp-server/src/tools/provision.ts` — FOUND (iOS handler rewritten)
- `packages/provision/README.md` — FOUND (updated to reference xcrun altool)

**Commits verified (exist in git log):**
- `621e185` — FOUND: feat(05-06): add xcode_archive + testflight_upload to PhaseId + PHASE_ORDER
- `13bebb7` — FOUND: refactor(05-06): delete asc-client.ts and scrub all references (D-03)
- `e9b7046` — FOUND: feat(05-06): wire xcode_archive + testflight_upload phases (TF-01 TF-04)
- `7450583` — FOUND: test(05-06): integration tests for PHASE_ORDER wiring + D-17 soft-fail

**Test suite check:**
- `pnpm vitest run` — 1484 passed | 8 skipped (1492). Zero failures. No regressions from prior-plan suites (1473 tests before Plan 06 Task 4 → 1484 after, +11 new from this plan).
- `pnpm -C cli exec tsc --noEmit` — clean
- `pnpm -C packages/core exec tsc --noEmit` — clean
- `pnpm -C packages/provision exec tsc --noEmit` — clean
- `pnpm -C packages/mcp-server exec tsc --noEmit` — clean

**Acceptance criteria verified (per PLAN must_haves.truths):**
- [x] PhaseId union contains `'xcode_archive'` and `'testflight_upload'` (D-01)
- [x] CheckpointData map has matching entries (D-01)
- [x] PHASE_ORDER: xcode_archive directly after deliver; testflight_upload directly after xcode_archive; report directly after testflight_upload (D-02)
- [x] `cli/src/pipeline.ts` iOS branch of legacy provision deleted; Android/Play Console branch preserved (D-03)
- [x] `packages/provision/src/asc-client.ts` deleted (D-03)
- [x] `AppleConfig.testflightTesters?: string[]` field present; wizard captures it (D-18)
- [x] `--skip-testflight` CLI flag propagates to pipeline and skips only testflight_upload (xcode_archive still runs per D-04)
- [x] Zero runtime shell-out to `asc` community CLI anywhere in `packages/` or `cli/` (TF-01)
- [x] D-17 soft-fail integration: pipeline exits 0 when testflight_upload returns `completed_with_warnings` (functional + source-level tests both GREEN)

## Self-Check: PASSED

---
*Phase: 05-xcode-archive-testflight-upload*
*Plan: 06*
*Completed: 2026-04-18*
