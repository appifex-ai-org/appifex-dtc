# Deferred Items (Phase 02 — Foundation Hardening)

Out-of-scope discoveries logged during plan execution. Fix in a dedicated plan/phase, not here.

## From Plan 02-03 (FOUND-03, 2026-04-15)

- **Pre-existing typecheck failures in `packages/mcp-server/src/server.ts`** (unrelated to Plan 03 scope):
  - `TS2305: Module '"@appifex/core"' has no exported member 'CliError'.` at `server.ts:2:10`
  - `TS18046: 'err' is of type 'unknown'.` at `server.ts:27:46` and `server.ts:27:59`
  - Verified pre-existing via `git stash && pnpm -r exec tsc --noEmit && git stash pop` before our changes were applied.
  - Likely cause: `mcp-server/package.json` missing `@appifex/core` dep update, or the file expects a `CliError` symbol that hasn't been wired through `mcp-server` since Plan 02-01 landed.
  - Impact: `pnpm -r exec tsc --noEmit` fails on `@appifex/mcp-server`. Per-package runtime, tests, and build scripts not affected by this (mcp-server `build: tsc` would also fail — needs its own follow-up).
