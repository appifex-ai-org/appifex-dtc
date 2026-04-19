---
phase: 02-foundation-hardening
plan: 04
subsystem: cli-bin
tags: [cli, foundation, found-01, bugfix]
requirements: [FOUND-01]
dependency-graph:
  requires: []
  provides:
    - "bin/dtc works from any clone (not tied to original dev machine)"
  affects:
    - "local-clone CLI entry point"
tech-stack:
  added: []
  patterns:
    - "Node ESM dynamic import launcher (shebang + import())"
key-files:
  created:
    - cli/__tests__/bin-dtc-launcher.test.ts
  modified:
    - bin/dtc
decisions:
  - "Used tiny ESM launcher (import('../cli/dist/entry.js')) per CONTEXT.md, avoiding dependency on the missing scripts/build-and-link.mjs"
  - "Pinned --help as the smoke-test flag; confirmed supported in cli/src/cli.ts:37 and entry.ts:121, no fallback needed"
metrics:
  tasks-completed: 2
  duration-minutes: ~5
  completed-date: 2026-04-15
---

# Phase 02 Plan 04: bin/dtc launcher replacement Summary

One-liner: Replaced the broken absolute symlink `bin/dtc` with a Node ESM launcher that dynamically imports `../cli/dist/entry.js`, making the CLI usable on any clone and adding a regression test.

## What Was Built

- **`bin/dtc`** — Regular executable file (mode 0755), replacing the prior absolute symlink that pointed at `/Users/rayliu/dev/appifex/packages/appifex-dtc/cli/dist/entry.js` (a path only present on the original dev machine). New content:
  ```js
  #!/usr/bin/env node
  import('../cli/dist/entry.js')
  ```
  Relative import resolves from `bin/` to the repo-root `cli/dist/entry.js`, so it works from any checkout.

- **`cli/__tests__/bin-dtc-launcher.test.ts`** — Regression test with two assertions:
  1. `bin/dtc` is a regular file (not a symlink).
  2. Spawning `bin/dtc --help` exits 0 with stdout containing the literal `dtc`.

## Execution Trace (TDD gates)

| Gate      | Task  | Commit    | Result                                                       |
| --------- | ----- | --------- | ------------------------------------------------------------ |
| RED       | 1     | `a6faded` | Test added; failed on "is not symlink" (confirmed RED).      |
| GREEN     | 2     | `c344c2b` | Symlink removed; launcher written; `chmod +x`; monorepo build ran to produce `cli/dist/entry.js`; test now passes 2/2. |

## Verification

- `pnpm vitest run cli/__tests__/bin-dtc-launcher.test.ts` → `Test Files 1 passed (1) / Tests 2 passed (2)`.
- `test ! -L bin/dtc && test -f bin/dtc && test -x bin/dtc` → all pass.
- Manual: `./bin/dtc --help` from repo root exits 0, prints help text beginning with `dtc — Design-to-Code Toolkit v0.1.0`.
- `cli/package.json` `bin.dtc` mapping unchanged.

## Decisions Made

- **Tiny-launcher over build-and-link script.** CONTEXT.md specifically chose this to avoid depending on `scripts/build-and-link.mjs`, which does not exist in the repo (see Known Issues below).
- **`--help` as canonical smoke-test flag.** Confirmed during plan authoring by reading `cli/src/cli.ts:37` (`parseArgs` returns `{ command: 'help' }` for `--help`) and `cli/src/entry.ts:121` (`case 'help': printHelp(); break;` — exits 0 naturally). No fallback flag added.

## Deviations from Plan

None — plan executed exactly as written. The TDD RED → GREEN sequence landed on the expected commits; no Rule 1/2/3 auto-fixes were needed.

The plan required a `pnpm build` to produce `cli/dist/entry.js` before the GREEN test; this was performed as specified in Task 2 step 4. `pnpm install --frozen-lockfile` was run once up front in this worktree because vitest/TypeScript toolchain was not yet installed in this scratch checkout — that is standard worktree bootstrap, not a plan deviation.

## Known Issues / Flagged for Later

- **`scripts/build-and-link.mjs` is still missing.** The root `package.json` `setup` script references it (`"setup": "node scripts/build-and-link.mjs"`) but the file does not exist. Out of scope for this plan per CONTEXT.md. Recommend addressing in a later housekeeping plan (e.g., either create the script or remove/rename the `setup` npm script).
- **`prepare` hook lefthook conflict** was observed during `pnpm install` (core.hooksPath set locally). Unrelated to FOUND-01; does not block the fix.

## Threat Flags

None — this change only substitutes one launcher shim for another; no new network, auth, file-access, or schema surface introduced.

## Self-Check: PASSED

- `bin/dtc` exists as regular executable file, not a symlink (verified via `ls -la`, `test -f`, `test -x`, `test ! -L`).
- `cli/__tests__/bin-dtc-launcher.test.ts` exists and passes under Vitest (2/2).
- Commits `a6faded` (test) and `c344c2b` (fix) present in worktree branch history.
