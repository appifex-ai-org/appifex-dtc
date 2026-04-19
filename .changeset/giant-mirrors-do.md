---
'@appifex/cli': patch
'@appifex/core': minor
'@appifex/analysis': minor
'@appifex/design': patch
'@appifex/runner': patch
'@appifex/build': patch
---

v2.0 low-effort hardening — 13 targeted fixes:

- Fix `bin/dtc` broken symlink (was hardcoded to a specific user's checkout)
- Redact all four secret fields (`llm.apiKey`, `llm.githubToken`, `design.apiKey`, `design.figmaToken`) in debug config dumps
- Route EPIPE from `claude --print` and Copilot fix-path errors through `DebugLogger` instead of silently swallowing
- Add `unzip` preflight check with clear error message
- Add vitest v8 coverage provider + `pnpm test:coverage` script
- Replace brittle greedy-regex Copilot JSON extraction with balanced-brace walker (new `cli/src/providers/json-extract.ts`)
- Document `DTC_GITHUB_CLIENT_ID` setup requirement in `docs/copilot-auth.md`; wizard error now references it
- Consolidate `CHARS_PER_TOKEN` into a single export in `@appifex/core`
- Honour RFC 8628 `slow_down` with back-off + ±15% jitter in Copilot OAuth device-flow
- Add `pnpm smoke` CI job to exercise the built `dist/` on every push
- Extract 5 per-provider message factories from `cli/src/pipeline.ts::buildCreateMessageFn` (~270 → 36 lines); neutralise the `logClaudeStdinError` duplication via a shared `cli/src/debug-helpers.ts`
- Rank Copilot fix-loop source files by failure locality (new `rankFilesByFailureLocality` in `@appifex/analysis`) instead of blindly taking the first 20 glob hits
- Neutralise 5 shell-injection sites across `@appifex/design`, `@appifex/runner`, `@appifex/build` using `execFileSync`, `fs.writeFile`, `assertSafeGlobPattern` allowlist (new `packages/runner/src/shell-safe.ts`), and `shell-quote`

No public API changes; behaviour-preserving refactor + shell safety + observability improvements.
