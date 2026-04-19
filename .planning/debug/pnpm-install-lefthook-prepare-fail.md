---
status: resolved
trigger: "pnpm install fails on fresh setup — lefthook prepare hook errors because core.hooksPath is set locally to .git/hooks. ELIFECYCLE exit 1."
created: 2026-04-15T00:00:00Z
updated: 2026-04-19T00:00:00Z
---

## Current Focus

hypothesis: Root `package.json` `prepare` script runs `lefthook install` unconditionally. Lefthook refuses when `core.hooksPath` is set locally (even to the default `.git/hooks`), and that condition holds on any standard macOS checkout because `.git/config` commonly has it set. Result: `prepare` exits non-zero → `pnpm install` aborts with ELIFECYCLE.
test: Read `package.json` prepare script, `lefthook.yml`, and `.git/config`; cross-reference with all four Plan 02 SUMMARY files and UAT.
expecting: Evidence that prepare is unguarded AND core.hooksPath is set AND lefthook treats that as fatal.
next_action: Report diagnosis. Do not fix.

## Symptoms

expected: `pnpm install` from a clean state exits 0 so `./bin/dtc --help` can run.
actual: `prepare` lifecycle fails with `lefthook install` error: "core.hooksPath is set locally to '/Users/rayliu/dev/appifex-dtc/.git/hooks' ... Run 'lefthook install --force' ..." → ELIFECYCLE exit 1.
errors: "core.hooksPath is set locally to '/Users/rayliu/dev/appifex-dtc/.git/hooks'" — lefthook abort; pnpm ELIFECYCLE exit 1.
reproduction: `pnpm install` from repo root with default `.git/config` (core.hooksPath set, as is the case on this host).
started: Existed throughout Phase 02; documented in all four Plan 02 SUMMARY files as a deferred / known issue.

## Evidence

- checked: root `package.json:20`
  found: `"prepare": "lefthook install"` — runs unconditionally on every `pnpm install`; no guard, no `|| true`, no `--force`.
  implication: Any non-zero exit from `lefthook install` kills the install.

- checked: `lefthook.yml`
  found: Only `pre-commit` and `commit-msg` sections. No `hooks_path:` key — i.e., the repo expects lefthook's default hooks directory.
  implication: Lefthook is not being reconfigured; it's the mere *presence* of a locally-set `core.hooksPath` (even one that matches the default) that trips its guard.

- checked: `.git/config` lines 1–8
  found: `[core] hooksPath = /Users/rayliu/dev/appifex-dtc/.git/hooks` — an explicit local override, pointing to the default path.
  implication: Lefthook's install logic detects the local override and refuses to proceed without `--force` or `--reset-hooks-path`. This is by design in lefthook (guard against stomping on husky/simple-git-hooks setups).

- checked: `git config --local/global --get core.hooksPath`
  found: local returns the path; global is unset.
  implication: It's a repo-local setting. On many dev machines (VS Code, husky leftovers, earlier tool runs) this gets set automatically; the repo cannot assume it's unset.

- checked: `.planning/phases/02-foundation-hardening/02-01-SUMMARY.md:133`, `02-02-SUMMARY.md:128`, `02-04-SUMMARY.md:76`, `02-UAT.md:22,57`
  found: All four Plan 02 SUMMARY files log the identical symptom and workaround (`pnpm install --ignore-scripts`). UAT Test 1 marks it `failed`, severity `major`.
  implication: Pre-existing, reproducible, unaddressed in Phase 02. Pure repo-tooling bug, not a CLI bug (confirmed: `packages/core/src/prerequisites.ts` + preflight are unrelated).

## Resolution

root_cause: The root `package.json` `prepare` script (`"prepare": "lefthook install"`) is unguarded. Lefthook's `install` subcommand fails fast when `git config --local core.hooksPath` is set — which is the default state on this machine and common on many dev environments. Because `prepare` is a pnpm lifecycle hook, its non-zero exit causes the entire `pnpm install` to abort with ELIFECYCLE, preventing any dependencies (including post-install native builds like `better-sqlite3`) from completing.
fix: Plan 02-05 (commit 7933531) — changed prepare to `test -d .git && lefthook install --force || true`. Guards against missing .git dir (tarball/npm-pack) and uses --force to bypass the core.hooksPath check safely (repo owns lefthook.yml; no other hook manager in use).
verification: Closes Phase 02 UAT Gap (severity: major). Confirmed fixed in commit 7933531 (2026-04-15).
files_changed: [package.json]
