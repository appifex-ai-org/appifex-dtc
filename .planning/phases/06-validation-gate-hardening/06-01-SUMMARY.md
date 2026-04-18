---
phase: 06-validation-gate-hardening
plan: 01
subsystem: infra
tags: [typescript, phase-id, checkpoint-data, phase-order, cli-error-hierarchy, e2e-gate]

# Dependency graph
requires:
  - phase: 06-validation-gate-hardening (00)
    provides: Wave 0 RED test phase-order-e2e-gate.test.ts that asserts 'e2e_gate' appears once in PHASE_ORDER, between 'deliver' and 'xcode_archive'
  - phase: 02-foundation-hardening (FOUND-04)
    provides: CliError hierarchy that E2eGateError extends
  - phase: 05-xcode-archive-testflight-upload (TF-01 D-02)
    provides: PHASE_ORDER slot reservation between 'deliver' and 'xcode_archive' + Phase 5 error-class precedents (ArchiveError / TestFlightError)
provides:
  - E2eGateError domain error class (extends CliError; flowFile + maestroError fields)
  - 'e2e_gate' PhaseId literal + CheckpointData.e2e_gate branch
  - 'e2e_gate' entry in PHASE_ORDER between 'deliver' and 'xcode_archive'
  - PHASE_LABELS 'E2E gate' label for terminal UI
affects: [06-06 (e2e_gate handler), 06-07 (pipeline wiring), any plan consuming PhaseId / CheckpointData / PHASE_ORDER]

# Tech tracking
tech-stack:
  added: []  # Type-only and constant-string additions; no new dependencies
  patterns:
    - CliError subclass with optional string fields (flowFile, maestroError) — mirrors TestFlightError itmsCode precedent
    - PhaseId union member + CheckpointData branch added together in types-pipeline.ts for consistency
    - PHASE_ORDER insertion preserving adjacency comments (Phase 5 annotations intact)

key-files:
  created: []
  modified:
    - packages/core/src/errors.ts (+14 lines — E2eGateError class)
    - packages/core/src/index.ts (+2 lines — barrel re-export)
    - packages/core/src/types-pipeline.ts (+11 lines — union member + CheckpointData branch)
    - packages/core/src/run-context.ts (+1 line — PHASE_ORDER entry)
    - cli/src/views/format.ts (+1 line — PHASE_LABELS entry)

key-decisions:
  - "E2eGateError constructor signature matches D-06: (message, flowFile?, maestroError?) with both optional fields held as public readonly properties (TestFlightError itmsCode pattern)"
  - "Explicit barrel export in packages/core/src/index.ts rather than wildcard — matches existing errors block convention at lines 38-49"
  - "CheckpointData.e2e_gate fields (flowFile, passed, totalFlows, failureSummary) all optional to keep CheckpointBase shape compatibility with existing fresh-app call sites (Phase 13 D-02 pattern)"
  - "Did NOT add xcode_archive/testflight_upload to PHASE_LABELS — preserved Phase 5 precedent of default-formatter fall-through for those two phases"

patterns-established:
  - "Phase 6 type-only scaffolding first — downstream plans (06-06, 06-07) compile against real PhaseId literals, no 'as any' or TODOs"
  - "// Phase 6 (VAL-XX D-YY): <what + why> comment convention preserved on every new block"

requirements-completed: [VAL-01]

# Metrics
duration: 3min
completed: 2026-04-18
---

# Phase 06 Plan 01: Types Foundation Summary

**E2eGateError domain error class + 'e2e_gate' PhaseId literal + CheckpointData branch + PHASE_ORDER slot + PHASE_LABELS entry — Wave 0 RED test (`phase-order-e2e-gate.test.ts`) transitioned RED (3/3 failing) → GREEN (3/3 passing).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-18T05:35:51Z
- **Completed:** 2026-04-18T05:39:14Z
- **Tasks:** 4 (plus one out-of-scope revert)
- **Files modified:** 5 (errors.ts, index.ts, types-pipeline.ts, run-context.ts, format.ts)

## Accomplishments

- `E2eGateError` class added to `packages/core/src/errors.ts` (extends `CliError`, exitCode=1, `flowFile?` + `maestroError?` optional readonly fields). Re-exported from `@appifex/core` via explicit barrel list in `packages/core/src/index.ts`.
- `PhaseId` union gains `'e2e_gate'` literal at the correct position (after `'deliver'`, before `'xcode_archive'`).
- `CheckpointData.e2e_gate` discriminated-union branch with `{ flowFile?, passed?, totalFlows?, failureSummary? }` + `CheckpointFailed | CheckpointSkipped`.
- `PHASE_ORDER` array literal gains `'e2e_gate'` between `'deliver'` and `'xcode_archive'` — matches Phase 5 D-02 reserved slot.
- `cli/src/views/format.ts::PHASE_LABELS` gains `e2e_gate: 'E2E gate'` for terminal UI status row rendering.
- Wave 0 RED test `packages/core/__tests__/phase-order-e2e-gate.test.ts` transitioned from 3/3 failing to 3/3 passing.

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor contention mitigation):

1. **Task 1: E2eGateError class + barrel export** — `96a60d1` (feat)
2. **Task 2: PhaseId 'e2e_gate' literal + CheckpointData.e2e_gate branch** — `1d0ad1c` (feat)
3. **Task 3: PHASE_ORDER insertion** — `433f051` (feat) — turns Wave 0 RED → GREEN
4. **Task 4: PHASE_LABELS 'E2E gate' entry** — `b1aee39` (feat) — see Deviations for the revert that followed
5. **Revert: drop out-of-scope signup-view.swift.eta changes picked up in Task 4 commit** — `25c3c47` (revert)

## Files Created/Modified

Diff-style before/after for each change:

### 1. `packages/core/src/errors.ts` (lines 117–129 — after `TestFlightError` at original line 115)

Before (EOF after TestFlightError closing brace):
```ts
export class TestFlightError extends CliError {
  constructor(
    message: string,
    public readonly itmsCode?: string,
  ) {
    super(message, 1)
    this.name = 'TestFlightError'
  }
}
```

After:
```ts
export class TestFlightError extends CliError {
  constructor(
    message: string,
    public readonly itmsCode?: string,
  ) {
    super(message, 1)
    this.name = 'TestFlightError'
  }
}

// Phase 6 (VAL-01 D-06): thrown by e2e_gate phase on Maestro failure when --skip-validation-gate is not set.
// Soft-fail per D-16: the phase handler catches this in the pipeline and either (a) rethrows to block
// xcode_archive, or (b) records in report and continues when --skip-validation-gate is true.
export class E2eGateError extends CliError {
  constructor(
    message: string,
    public readonly flowFile?: string,
    public readonly maestroError?: string,
  ) {
    super(message, 1)
    this.name = 'E2eGateError'
  }
}
```

### 2. `packages/core/src/index.ts` (lines 38, 50 — barrel re-export)

Before:
```ts
// Phase 02 Plan 01 (FOUND-04): typed CliError hierarchy
// Phase 5 (TF-01, TF-04 D-05): ArchiveError + TestFlightError appended
export {
  CliError,
  PreflightError,
  ConfigError,
  ResumeAbortError,
  BudgetExhaustedError,
  EpipeError,
  ProvisionError,
  SecurityLintError,
  ArchiveError,
  TestFlightError,
} from './errors.js'
```

After:
```ts
// Phase 02 Plan 01 (FOUND-04): typed CliError hierarchy
// Phase 5 (TF-01, TF-04 D-05): ArchiveError + TestFlightError appended
// Phase 6 (VAL-01 D-06): E2eGateError appended
export {
  CliError,
  PreflightError,
  ConfigError,
  ResumeAbortError,
  BudgetExhaustedError,
  EpipeError,
  ProvisionError,
  SecurityLintError,
  ArchiveError,
  TestFlightError,
  E2eGateError,
} from './errors.js'
```

### 3. `packages/core/src/types-pipeline.ts` — PhaseId union (line 23) + CheckpointData branch (lines 117–126)

PhaseId before:
```ts
  | 'deliver'
  | 'xcode_archive' // Phase 5 (TF-01 D-02): after deliver, before report
  | 'testflight_upload' // Phase 5 (TF-01 D-02): after xcode_archive, before report
```

PhaseId after:
```ts
  | 'deliver'
  | 'e2e_gate' // Phase 6 (VAL-01 D-01): real-Firebase e2e gate before TestFlight
  | 'xcode_archive' // Phase 5 (TF-01 D-02): after deliver, before report
  | 'testflight_upload' // Phase 5 (TF-01 D-02): after xcode_archive, before report
```

CheckpointData before (after `deliver` branch):
```ts
  deliver: CheckpointBase | CheckpointFailed | CheckpointSkipped
  // Phase 5 (TF-01 D-01): xcode_archive checkpoint — stores .ipa path + version for idempotent resume (D-16)
  xcode_archive:
```

CheckpointData after:
```ts
  deliver: CheckpointBase | CheckpointFailed | CheckpointSkipped
  // Phase 6 (VAL-01 D-01): e2e_gate checkpoint — stores flow file + pass/fail state for idempotent resume
  e2e_gate:
    | (CheckpointBase & {
        flowFile?: string
        passed?: boolean
        totalFlows?: number
        failureSummary?: string
      })
    | CheckpointFailed
    | CheckpointSkipped
  // Phase 5 (TF-01 D-01): xcode_archive checkpoint — stores .ipa path + version for idempotent resume (D-16)
  xcode_archive:
```

### 4. `packages/core/src/run-context.ts` — PHASE_ORDER (line 65)

Before:
```ts
  'deliver',
  'xcode_archive', // Phase 5 (TF-01 D-02)
  'testflight_upload', // Phase 5 (TF-01 D-02)
  'report',
]
```

After:
```ts
  'deliver',
  'e2e_gate', // Phase 6 (VAL-01 D-01): real-Firebase e2e gate before TestFlight
  'xcode_archive', // Phase 5 (TF-01 D-02)
  'testflight_upload', // Phase 5 (TF-01 D-02)
  'report',
]
```

### 5. `cli/src/views/format.ts` — PHASE_LABELS (line 37)

Before:
```ts
  deliver: 'Deliver',
  report: 'Report',
}
```

After:
```ts
  deliver: 'Deliver',
  e2e_gate: 'E2E gate', // Phase 6 (VAL-01 D-01)
  report: 'Report',
}
```

## Wave 0 Test Transition

- **Before:** `packages/core/__tests__/phase-order-e2e-gate.test.ts` — 3 failing (`Test 1: contains e2e_gate`, `Test 2: between deliver and xcode_archive`, `Test 3: appears exactly once`).
- **After Task 3 commit (`433f051`):** 3/3 passing. Wave 0 RED → GREEN transition achieved.
- **Regression check:** `pnpm vitest run packages/core` — 164/164 tests passing (18 test files). No existing core tests regressed.

## Typecheck Confirmation

- `pnpm --filter @appifex/core exec tsc --noEmit` — clean exit after every task.
- `pnpm --filter @appifex/cli exec tsc --noEmit` — clean exit after Task 4 (PHASE_LABELS uses `Record<string, string>`, so the new key widens the map without type surface impact).
- `pnpm typecheck` (workspace-wide `pnpm -r exec tsc --noEmit`) — clean exit after all tasks.

## Decisions Made

- **Explicit barrel re-export over wildcard** — `packages/core/src/index.ts` already listed each error class explicitly (lines 38–49). Added `E2eGateError` to the explicit list rather than converting to `export * from './errors.js'`, preserving the existing convention.
- **All CheckpointData fields optional** — `flowFile`, `passed`, `totalFlows`, `failureSummary` are all `?:` so the branch remains compatible with fresh-app call sites that use `CheckpointBase` bare (Phase 13 D-02 / Pitfall 7 pattern).
- **xcode_archive / testflight_upload PHASE_LABELS gap preserved** — per plan instruction, those two entries remain absent; default formatter (`phase.id.charAt(0).toUpperCase() + phase.id.slice(1)`) renders them. Only `e2e_gate` got an explicit label.

## Deviations from Plan

### Out-of-scope change auto-reverted

**1. [Rule 1 — Scope] Reverted signup-view.swift.eta changes inadvertently included in Task 4 commit**
- **Found during:** Post-Task-4 stat check (`git diff c80f22b HEAD --stat` showed `packages/baas/src/templates/firebase/signup-view.swift.eta | 14 ++++++++++++++`).
- **Issue:** Template file for `signIn_existingAccount` affordance + signup accessibility IDs (VAL-01 D-05) was modified in the worktree before Task 4 (likely residue from sibling agent or worktree setup). The `git add cli/src/views/format.ts` + `git commit` flow picked it up. This file is out of scope per the plan frontmatter `files_modified` (only four paths listed, no `.eta` templates) and belongs to a different Phase 6 plan that handles template wiring for D-05.
- **Fix:** `git checkout c80f22b -- packages/baas/src/templates/firebase/signup-view.swift.eta` to restore file to plan base, then committed the restoration as a separate `revert(06-01):` commit so the final worktree diff matches the plan's `files_modified` list exactly.
- **Files modified:** `packages/baas/src/templates/firebase/signup-view.swift.eta` (restored to base).
- **Verification:** `git diff c80f22b HEAD --stat` now lists exactly 5 files matching `files_modified` + the in-scope barrel export (`index.ts`).
- **Committed in:** `25c3c47` (revert commit after `b1aee39`).

---

**Total deviations:** 1 auto-fixed (scope-scrub; no functional impact on Plan 01 artifacts).
**Impact on plan:** Zero — revert preserves plan scope exactly. Wave 0 test transition, typecheck cleanliness, and all four task artifacts are untouched. The D-05 template changes will be re-introduced by the plan that owns them.

## Issues Encountered

None beyond the scope-scrub noted above. Every task's verify block exited 0 on first attempt.

## User Setup Required

None — type-only and constant-string additions. No credentials, no env vars, no dashboards.

## Next Phase Readiness

- **06-06 (e2e_gate handler):** Can now import `E2eGateError` from `@appifex/core`, reference `PhaseId === 'e2e_gate'`, and persist via `checkpoint.savePhase(runId, 'e2e_gate', { ... })` with typed payload. No `as any` needed.
- **06-07 (pipeline wiring):** `PHASE_ORDER` already contains `'e2e_gate'` at the correct index; pipeline iteration / `canSkipPhase('e2e_gate')` / progress-emitter `emit('e2e_gate', ...)` all type-check.
- **Terminal UI:** `PipelineView.tsx` / `ReportView.tsx` render `● E2E gate` label via `formatPhaseStatus` without further work.
- **No blockers.**

## Self-Check: PASSED

Verified against acceptance criteria:
- `grep -q "export class E2eGateError extends CliError" packages/core/src/errors.ts` — FOUND (line 120)
- `grep -q "this.name = 'E2eGateError'" packages/core/src/errors.ts` — FOUND (line 127)
- `grep -q "flowFile" packages/core/src/errors.ts` — FOUND
- `grep -q "maestroError" packages/core/src/errors.ts` — FOUND
- `grep -q "// Phase 6 (VAL-01 D-06)" packages/core/src/errors.ts` — FOUND (line 117)
- `grep -q "'e2e_gate'" packages/core/src/types-pipeline.ts` — FOUND (line 23)
- `grep -c "e2e_gate" packages/core/src/types-pipeline.ts` — returns 3 (union + checkpoint comment + checkpoint key) — meets >= 2 threshold
- `grep -q "'e2e_gate', // Phase 6 (VAL-01 D-01)" packages/core/src/run-context.ts` — FOUND (line 65)
- `grep -c "'e2e_gate'" packages/core/src/run-context.ts` — returns 1 (no duplicates)
- `grep -q "e2e_gate: 'E2E gate'" cli/src/views/format.ts` — FOUND (line 37)
- Commits verified: 96a60d1, 1d0ad1c, 433f051, b1aee39, 25c3c47 all present in `git log --oneline`.
- Wave 0 test: `pnpm vitest run packages/core/__tests__/phase-order-e2e-gate.test.ts` → 3/3 pass.
- Typecheck: `pnpm typecheck` exits 0.

---
*Phase: 06-validation-gate-hardening*
*Completed: 2026-04-18*
