---
phase: 05-xcode-archive-testflight-upload
plan: 01
subsystem: build
tags: [xcodegen, js-yaml, project-yml, swift, firebase, testflight]

# Dependency graph
requires:
  - phase: 04-firebase-integration
    provides: FIRE-02 inline js-yaml REVERSED_CLIENT_ID URL-scheme mutation in swift.ts:128-168 (now refactored onto the shared helper)
provides:
  - Shared project-yml mutator module (readProjectYml / writeProjectYml / setBuildSetting / setInfoProperty / findAppTargetName)
  - API-level Info.plist vs build-settings split (Pitfall 1 correction of D-10)
  - Pitfall 2 guard (YES/NO preserved as quoted strings — no DEFAULT_SCHEMA coercion)
  - Pitfall 11 guard (round-trip structural equivalence under no-op load/dump)
  - Shared fixture `fixtures/project-yml/minimal.yml` consumed by this plan and Plan 04
affects: [05-02-swift-archive-rewrite, 05-04-archive-phase-handler, 05-05-release-hygiene]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ports-and-adapters (Runner) — readProjectYml/writeProjectYml take Runner for testability with in-memory mock filesystem"
    - "API-level invariants — setInfoProperty vs setBuildSetting prevent Pitfall 1 miswrites at call sites"
    - "TDD gate (RED fixture + RED tests → GREEN impl + refactor)"

key-files:
  created:
    - packages/build/src/project-yml.ts
    - packages/build/__tests__/project-yml.test.ts
    - .planning/phases/05-xcode-archive-testflight-upload/fixtures/project-yml/minimal.yml
  modified:
    - packages/build/src/swift.ts

key-decisions:
  - "setInfoProperty and setBuildSetting are distinct APIs to make Pitfall 1 (Info.plist vs settings) impossible at the call site"
  - "Serialization options locked to { lineWidth: -1, noRefs: true, quotingType: '\"' } matching XcodeGen output style"
  - "Swift.ts:118 (packages block insertion via regex) kept as-is — out of scope for TF-02 first half; Plan 02 addresses it"

patterns-established:
  - "Pattern 1: project-yml mutation — always parse via readProjectYml, mutate via setBuildSetting/setInfoProperty, serialize via writeProjectYml. No direct yaml.load/yaml.dump in build pipeline code."
  - "Pattern 2: test fixtures stored under .planning/phases/XX/fixtures/ and consumed via path.resolve from __tests__/"

requirements-completed: [TF-02]

# Metrics
duration: ~5min
completed: 2026-04-17
---

# Phase 05 Plan 01: project.yml js-yaml mutator extraction Summary

**Shared `readProjectYml → setBuildSetting / setInfoProperty → writeProjectYml` helper module extracted from swift.ts:128-168; Phase 4 Firebase URL-scheme injection now uses it unchanged, and Plans 02/04 have a single mutator surface to call.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T19:26:13Z
- **Completed:** 2026-04-17T19:31:19Z
- **Tasks:** 3 (all auto, TDD)
- **Files created:** 3
- **Files modified:** 1

## Accomplishments

- New module `packages/build/src/project-yml.ts` (82 lines) with 5 exports + 1 exported type
- 13 unit tests covering Pitfall 1 (Info.plist vs settings split), Pitfall 2 (YES/NO preservation), Pitfall 11 (round-trip structural equivalence), base-shape settings, idempotency, and error cases
- `swift.ts:128-168` refactored to use the new helpers — inline `yaml.load` / `yaml.dump` calls eliminated
- Phase 4 FIRE-02 regression suite (`swift-patch.test.ts`, 8 tests) continues to pass unchanged
- Shared fixture `minimal.yml` committed for reuse by Plan 04 (swift-archive-hygiene)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared fixture minimal.yml** — `b751b00` (test)
2. **Task 2: RED — failing tests for project-yml helpers** — `dafca64` (test)
3. **Task 3: GREEN — implement project-yml.ts + refactor swift.ts** — `2f32f8c` (feat)

_TDD gate sequence: test → test → feat. REFACTOR step not needed (implementation was minimal and clean per plan spec)._

## Files Created/Modified

### Created
- `packages/build/src/project-yml.ts` — Shared js-yaml parse/mutate/serialize helpers. Exports `readProjectYml`, `writeProjectYml`, `setBuildSetting`, `setInfoProperty`, `findAppTargetName`, and the `ProjectYml` type.
- `packages/build/__tests__/project-yml.test.ts` — 13 unit tests with in-memory mock Runner and fixture-driven round-trip checks.
- `.planning/phases/05-xcode-archive-testflight-upload/fixtures/project-yml/minimal.yml` — Shared XcodeGen project.yml fixture (24 lines) with App + AppTests targets.

### Modified
- `packages/build/src/swift.ts` — Removed `import yaml from 'js-yaml'`; replaced inline `yaml.load(...)` / target-walking / `yaml.dump(...)` block with `readProjectYml` + `setInfoProperty` + `writeProjectYml` calls. Phase 4 FIRE-02 behavior preserved exactly (writes `CFBundleURLTypes` under `info.properties` on the app target).

## Module API Surface

| Export | Signature | Purpose |
|--------|-----------|---------|
| `readProjectYml` | `(runner: Runner, ymlPath: string) => Promise<ProjectYml>` | Parse via js-yaml DEFAULT_SCHEMA (no YES/NO coercion) |
| `writeProjectYml` | `(runner: Runner, ymlPath: string, doc: ProjectYml) => Promise<void>` | Serialize with `{ lineWidth: -1, noRefs: true, quotingType: '"' }` |
| `setBuildSetting` | `(doc, targetName, key, value) => void` | Write into `targets.{name}.settings` (flat or `{ base: ... }` shape-aware) |
| `setInfoProperty` | `(doc, targetName, key, value) => void` | Write into `targets.{name}.info.properties` (creates block if missing) |
| `findAppTargetName` | `(doc) => string` | First non-`*Tests` target; throws if none |
| `ProjectYml` (type) | `{ name, targets, packages?, [key]: unknown }` | Structural shape for the parsed document |

## Test Coverage Map

| Test | Scenario | Pitfall Reference |
|------|----------|-------------------|
| Test 1 | readProjectYml on minimal.yml yields both targets | — |
| Test 2 | findAppTargetName returns App (excludes AppTests) | — |
| Test 3 | findAppTargetName throws when only *Tests targets exist | — |
| Test 4 | setBuildSetting writes flat settings | — |
| Test 5 | setBuildSetting respects `settings.base` shape | — |
| **Test 6** | ENABLE_BITCODE="NO" preserved as quoted string in dump | **Pitfall 2** |
| **Test 7** | ITSAppUsesNonExemptEncryption=false dumped unquoted | **Pitfall 1** |
| Test 8 | setInfoProperty creates info block when missing | — |
| **Test 9** | Round-trip readProjectYml → writeProjectYml preserves structure | **Pitfall 11** |
| Test 10 | Double-set idempotency | — |
| Test 11 | writeProjectYml emits no anchors + no line folding for long values | — |
| Test 12 | setBuildSetting throws on unknown target (name in message) | — |
| Test 13 | setInfoProperty throws on unknown target (name in message) | — |

## swift.ts Refactor Summary

**Before (lines 128-168):** 41 lines of inline `yaml.load` + in-place object-walk + `yaml.dump({ lineWidth: -1 })`.
**After:** 28 lines calling `readProjectYml` / `findAppTargetName` / `setInfoProperty` / `writeProjectYml`. `import yaml from 'js-yaml'` removed; added `import { readProjectYml, writeProjectYml, setInfoProperty, findAppTargetName } from './project-yml.js'`.

**Behavior preservation:** Tested via `swift-patch.test.ts` (8 tests, Phase 4 FIRE-02 regression) — all green after refactor. The `CFBundleURLTypes` entry is written at the same path (`info.properties.CFBundleURLTypes`) with the same shape (`[{ CFBundleURLSchemes, CFBundleURLName }]`).

**Intentionally out of scope:** The `yml.replace(/(targets:)/m, ...)` regex hack at swift.ts:123 (packages block insertion) and the `\n {2}\w+Tests:` regex at line 129 (target-deps insertion). Plan 02 addresses these as part of the swift-archive rewrite.

## Decisions Made

- **API-level Pitfall 1 enforcement.** Two distinct mutator functions (`setInfoProperty` vs `setBuildSetting`) instead of one generic `setTargetKey` so callers physically cannot write `ITSAppUsesNonExemptEncryption` under `settings`. This is the D-10 correction encoded in the type signature, not a comment.
- **findAppTargetName suffix heuristic.** `!k.endsWith('Tests')` matches both `AppTests` and `{AppName}Tests` patterns (DEFAULT_PROJECT_YML derives test-target names by appending `Tests` to the app name). Documented as throw-with-message on the all-tests edge case.
- **Fixture location under `.planning/phases/05/fixtures/`.** Co-located with the plan artifacts so Plan 04 can reference the same fixture path.

## Deviations from Plan

None — plan executed exactly as written. Tests, fixture, module signatures, serialization options, and swift.ts refactor all match the plan spec byte-for-byte.

## Issues Encountered

- **Worktree branch base mismatch.** The agent-a7b5b64b worktree was initially based on `eec5bc03` (main) instead of the expected feature HEAD `8ba33c8e`. Resolved per the worktree_branch_check protocol via `git reset --hard 8ba33c8e…` before any other work.
- **vitest 4.x `--bail` flag change.** Initial verification call `vitest run ... --bail` fails because vitest 4.x requires `--bail=<n>`. Switched to `--bail=1`. Noting here so Plans 02-06 use the 4.x syntax.
- **Pre-existing lint error.** `pnpm -w run lint` reports 1 ESLint error in `cli/__tests__/entry-error-handling.test.ts` (pre-existing `Function` type usage). Out of scope for this plan; logged for future cleanup. The per-package `pnpm --filter @appifex/build build` (tsc --noEmit) is clean for the files touched here.

## User Setup Required

None — no external service configuration required.

## Self-Check

- [x] `packages/build/src/project-yml.ts` exists at commit 2f32f8c
- [x] `packages/build/__tests__/project-yml.test.ts` exists at commit dafca64
- [x] `.planning/phases/05-xcode-archive-testflight-upload/fixtures/project-yml/minimal.yml` exists at commit b751b00
- [x] `packages/build/src/swift.ts` imports from `./project-yml.js` (no remaining `yaml.load(` / `yaml.dump(` calls)
- [x] `pnpm vitest run packages/build/__tests__/project-yml.test.ts packages/build/__tests__/swift-patch.test.ts --bail=1` → 21/21 green
- [x] `pnpm --filter @appifex/build build` → tsc clean

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 02 (swift-archive rewrite)** can now import `readProjectYml / setBuildSetting / setInfoProperty / writeProjectYml` from `@appifex/build` internal path and drop its own regex-based mutations.
- **Plan 04 (archive phase handler)** can consume the same fixture at `fixtures/project-yml/minimal.yml` for its `swift-archive-hygiene.test.ts` coverage of ITSAppUsesNonExemptEncryption + DEBUG_INFORMATION_FORMAT writes.
- **TF-02 first half complete.** No open blockers; the mutator surface is unified.

---
*Phase: 05-xcode-archive-testflight-upload*
*Plan: 01*
*Completed: 2026-04-17*
