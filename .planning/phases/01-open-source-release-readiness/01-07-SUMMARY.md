---
phase: 01-open-source-release-readiness
plan: 07
subsystem: ci-e2e-gate
tags: [gate-02, d-07, d-08, e2e, fixture, ci, design-ir]
requires: [01-01, 01-03]
provides:
  - "GATE-02 two-tier E2E smoke gate (e2e-build on PR, e2e-simulator on push)"
  - "Hermetic tiny-mock fixture for offline-safe codegen runs"
  - "--design-ir CLI flag bypassing Pencil-MCP design phase via pre-extracted PlatformSpec JSON"
affects:
  - cli/src/cli.ts
  - cli/src/pipeline.ts
  - cli/src/entry.ts
tech-stack:
  added: []
  patterns: ["IR-fallback escape hatch (mutually-exclusive with --design)"]
key-files:
  created:
    - fixtures/tiny-mock/design-ir.json
    - fixtures/tiny-mock/design.pen
    - fixtures/tiny-mock/mock-baas-config.json
    - fixtures/tiny-mock/README.md
    - fixtures/tiny-mock/maestro/login-flow.yml
    - .github/workflows/e2e.yml
    - cli/__tests__/design-ir-flag.test.ts
  modified:
    - cli/src/cli.ts
    - cli/src/pipeline.ts
    - cli/src/entry.ts
decisions:
  - "Spike outcome assumed (c) per orchestrator — live offline Pencil MCP test skipped; --design-ir fallback implemented unconditionally"
  - "design.pen committed as a placeholder (not a real .pen) — IR JSON is the authoritative input"
  - "e2e-build runs --design-ir on every PR; e2e-simulator gated on push only per D-07 cost tradeoff"
  - "Mutual exclusion enforced in parseArgs (not pipeline) so the CLI fails fast before any I/O"
metrics:
  duration: ~25min
  completed: 2026-04-15
requirements: [GATE-02]
---

# Phase 01 Plan 07: GATE-02 Two-Tier E2E Smoke Gate + Tiny Hermetic Fixture Summary

Two-tier E2E gate landed: `e2e-build` (PR, ~10min, codegen → xcodebuild compile) and `e2e-simulator` (push, ~30min, full simulator + Maestro), both backed by a hermetic `fixtures/tiny-mock/` Login+Home fixture and a `--design-ir` CLI flag that bypasses Pencil MCP entirely by hydrating `PlatformSpec` + `DesignTokens` from a committed JSON snapshot.

## What Shipped

- **`fixtures/tiny-mock/`** — hand-authored `design-ir.json` (Login + Home screens matching the `PlatformSpec` shape produced by `packages/spec/src/translate.ts`), placeholder `design.pen`, `mock-baas-config.json` (mock email auth + items collection), `maestro/login-flow.yml` (8-step golden path), and a `README.md` whose body ends with the machine-greppable `**Outcome:** (c)` line + the literal `## Offline spike result: (c)` heading required by the orchestrator.
- **`--design-ir <path>` CLI flag** — typed `designIrPath` field on `ParsedArgs`, mutual-exclusion guard (`Pass exactly one of --design or --design-ir`) enforced in `parseArgs` so the failure is fast and pre-I/O, threaded through `entry.ts → renderRunApp → PipelineOpts.designIrPath`.
- **Pipeline wiring** — at the top of the design phase, `opts.designIrPath` triggers IR-JSON load + validation (existence, JSON parse, `spec.screens[]` shape), then short-circuits both the design phase (`savePhase('design', { designFile: irPath })`) and the spec phase (writes `spec.json`, emits `completed`, `savePhase('spec', { platformSpec })`, sets `specSkipped = true`). All downstream phases (test_gen, codegen, build) consume the hydrated `platformSpec` unchanged.
- **`.github/workflows/e2e.yml`** — two jobs on `macos-14` per D-07. Both use `--design-ir fixtures/tiny-mock/design-ir.json --out fixtures/tiny-mock/out`; `e2e-simulator` gated on `github.event_name == 'push'`. Top-of-file comment cites the spike-outcome decision.
- **5-test vitest suite** (`cli/__tests__/design-ir-flag.test.ts`) — parses to `designIrPath`, undefined when absent, `--design` alone leaves `designIrPath` undefined, mutual-exclusion in either flag order. All pass; full 22-test cli arg suite still green (no regression).

## Commits

| Task | Hash | Summary |
| ---- | ------- | ------- |
| 1    | c8701ce | Tiny-mock fixture (design-ir.json, mock-baas-config.json, README, .pen placeholder) |
| 1b   | d9d55fe | --design-ir CLI flag + PlatformSpec hydration + 5 vitest cases |
| 2    | 0798943 | e2e.yml two-tier gate + Maestro golden flow |

## Deviations from Plan

### Resolved by Orchestrator (pre-checkpoint)

**1. [Orchestrator decision] Skipped live Pencil MCP offline spike**
- **Plan called for:** Toggling Wi-Fi off and running `node bin/dtc run --design fixtures/tiny-mock/design.pen ...` to determine outcome (a/b/c).
- **What was done:** Spike skipped per orchestrator instruction; outcome assumed to be (c) ("fully offline does NOT work"); Task 1b (`--design-ir` fallback) implemented unconditionally.
- **Documentation:** `fixtures/tiny-mock/README.md` ends with the literal `## Offline spike result: (c) — assumed by orchestrator decision; --design-ir fallback path implemented.` heading.
- **Side effect:** `design.pen` is a placeholder text file rather than a real Pencil-MCP artifact. The README documents this and the regen procedure for when a real `.pen` becomes available.

**2. [Orchestrator decision] Auto-confirmed Task 3 checkpoint**
- **Plan called for:** Human verification by running the `e2e-build` steps locally (`pnpm install && pnpm build && dtc run --design-ir ... && xcodebuild build`).
- **What was done:** Auto-confirmed per orchestrator instruction after validating `.github/workflows/e2e.yml` parses as YAML (PyYAML `safe_load` succeeded; required keys present: two named jobs, `macos-14`, `fixtures/tiny-mock`, `--design-ir`, push gate).
- **User will manually verify** via PR run or `act`.

### Auto-fixed Issues

None — beyond the orchestrator-resolved items above, the plan executed as written.

## Authentication Gates

None encountered.

## Verification

- `pnpm vitest run cli/__tests__/design-ir-flag.test.ts` — 5/5 pass
- `pnpm vitest run cli/__tests__/cli.test.ts cli/__tests__/design-ir-flag.test.ts` — 22/22 pass (no regression)
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/e2e.yml').read())"` — OK; required keys (`e2e-build`, `e2e-simulator`, `macos-14`, `fixtures/tiny-mock`, push gate, `--design-ir`) all present
- `python3 -c "import yaml; list(yaml.safe_load_all(open('fixtures/tiny-mock/maestro/login-flow.yml').read()))"` — OK, 2 docs (header + 8 steps)
- `node -e "JSON.parse(require('fs').readFileSync('fixtures/tiny-mock/design-ir.json','utf8'))"` — OK
- `jq -e '.provider == "mock"' fixtures/tiny-mock/mock-baas-config.json` — true
- `grep -qE "^\*\*Outcome:\*\*\s*\(?[abc]\)?" fixtures/tiny-mock/README.md` — true (matches `**Outcome:** (c)`)

### Pre-existing (out of scope)

`pnpm --filter @appifex/cli exec tsc --noEmit` reports unresolved `@appifex/*` and `react`/`ink`/`chalk` modules in `cli/src/views/*.tsx`. These are pre-existing build-order issues (workspace packages need `pnpm build` first to materialize `dist/` for `exports` resolution) and unrelated to this plan's changes. Logged for future cleanup; no fix attempted per the SCOPE BOUNDARY rule.

## Known Stubs

- `fixtures/tiny-mock/design.pen` is an intentional placeholder, not a real `.pen` file. CI does not consume it (uses `--design-ir` exclusively); the README documents the regen procedure for when Pencil MCP is available.

## Threat Flags

None — fixture additions touch only hermetic mock data and a CI workflow that runs without live credentials.

## Self-Check: PASSED

Files (FOUND):
- `fixtures/tiny-mock/design-ir.json`
- `fixtures/tiny-mock/design.pen`
- `fixtures/tiny-mock/mock-baas-config.json`
- `fixtures/tiny-mock/README.md`
- `fixtures/tiny-mock/maestro/login-flow.yml`
- `.github/workflows/e2e.yml`
- `cli/__tests__/design-ir-flag.test.ts`
- `cli/src/cli.ts`, `cli/src/pipeline.ts`, `cli/src/entry.ts` (modified)

Commits (FOUND): `c8701ce`, `d9d55fe`, `0798943`
