# CONCERNS

Technical debt, bugs, security, performance, and fragile areas surfaced during codebase mapping.

## Tech Debt

- **Monolithic pipeline orchestrator:** `cli/src/pipeline.ts` is ~2,900 lines and orchestrates every phase plus four inline LLM providers in `buildCreateMessageFn`. Extract provider adapters into `cli/src/providers/` and phase runners into `cli/src/phases/`.
- **Duplicated LLM provider dispatch:** Copilot logic exists in both `cli/src/providers/copilot.ts` (`createCopilotGenerateFn` / `createCopilotFixFn`) AND reimplemented inline at `cli/src/pipeline.ts:622-645`. Same for claude-cli (`cli/src/pipeline.ts:588-620` duplicates `packages/codegen/src/claude-cli-generate.ts` and `packages/fix/src/claude-cli-fix.ts`).
- **Placeholder GitHub Client ID:** `cli/src/setup-wizard.ts:12` hardcodes `'Iv1.dtc_placeholder'`; Copilot auth aborts unless `DTC_GITHUB_CLIENT_ID` env var is set, which is undocumented.
- **Broken `bin/dtc` symlink:** Points to absolute `/Users/rayliu/dev/appifex/packages/appifex-dtc/cli/dist/entry.js` (another checkout on this machine). Will not work on any other machine/CI. Should be relative: `../cli/dist/entry.js`.
- **No lint/format config:** Root `pnpm lint` is only `tsc --noEmit`. No `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, or `biome.json` in repo.
- **Heavy `as any` / `as unknown as` usage:** 33 occurrences in src. Notable:
  - `cli/src/pipeline.ts:592-595, 625-633` (`content: any`, `p: any`)
  - `cli/src/pipeline.ts:633` (CopilotClient cast)
  - `packages/spec/src/generate-spec.ts`
  - `packages/design/src/stitch-adapter.ts`
  - `packages/mcp-server/src/tools/pipeline.ts`
  - `packages/mcp-server/src/tools/report.ts`

## Known Bugs

- **Swallowed EPIPE:** `cli/src/pipeline.ts:606` silently swallows stdin EPIPE from `claude --print` for large prompts.
- **Silent catch in Copilot fix path:** `cli/src/providers/copilot.ts:206-208` returns empty result on any error with no logging.
- **Brittle LLM-response JSON extraction:** Regex `/\{[\s\S]*"files"[\s\S]*\}/` at `cli/src/providers/copilot.ts:127, 193` will match prose containing the word `"files"` before the real payload and crash on `JSON.parse`.

## Security Considerations

- **Shell interpolation of paths:**
  - `packages/design/src/figma-make-adapter.ts:79-84`: `sh -c "echo '${b64}' | base64 -d > '${path}'"` — path not escaped.
  - `packages/design/src/stitch-zip.ts:32`: `execSync(\`unzip -o -q "${zipPath}" -d "${extractDir}"\`)` — paths interpolated into double-quoted shell string.
  - `packages/runner/src/e2b-runner.ts:99` and `packages/runner/src/remote-runner.ts:96`: `sh -c "ls -1 ${pattern} 2>/dev/null"` — unquoted pattern expansion.
  - `packages/build/src/emulator.ts:48`: `nohup emulator -avd ${avd} …` — `avd` interpolated into shell.
- **Token redaction gap:** `cli/src/pipeline.ts:582` only redacts `apiKey` on config log; verify `githubToken`, `figmaToken`, `pencilKey` are also redacted before `debug.logJson('config.json', …)`.
- **Android keystore passwords in plaintext:** `packages/build/src/kotlin-bundle.ts:94-96` writes `RELEASE_STORE_PASSWORD` / `RELEASE_KEY_PASSWORD` into a gradle properties file during bundling. Ensure generated projects `.gitignore` it.

## Performance Bottlenecks

- **Fix loop file cap:** `cli/src/providers/copilot.ts:156-163` globs all `src/**/*.{ts,tsx}` + `Sources/**/*.swift`, takes first 20 files indiscriminately. Should rank by failing-test locality (see `packages/analysis/src/modified-screens.ts`).
- **Coarse token estimate:** `packages/analysis/src/token-cap.ts:3` and `packages/analysis/src/modification-planner.ts:4` both hardcode `CHARS_PER_TOKEN = 4`; underestimates code and unicode.
- **Device-flow polling:** `cli/src/providers/copilot.ts:37-62` ignores OAuth `slow_down` error (no back-off) and has no jitter.

## Fragile Areas

- **Skip-gate logic:** `cli/src/pipeline.ts:36, 75-101` — overlapping inputs (runMode, previousContext status, checkpoint resumeState) plus special cases (add-feature forces `spec`; force-rerun set for validate/fix/deliver/report). Covered by `cli/__tests__/pipeline-add-feature-skip-gate.test.ts`, `pipeline-resume-checkpoint.test.ts`, `pipeline-checkpoint-*.test.ts`.
- **Mass `process.exit` in CLI:** 50+ calls across `cli/src/entry.ts`, 22 in `cli/src/setup-wizard.ts`, and `cli/src/pipeline.ts:872, 896`. Blocks embedding CLI as a library (the MCP server at `packages/mcp-server/src/tools/pipeline.ts` tries to).
- **vitest aliases src, build produces dist:** `vitest.config.ts:12-30` aliases every `@dtc/*` to `src/index.ts`; tests never exercise `dist/`. No post-build smoke test.

## Dependencies at Risk

- **`@github/copilot-sdk` untyped:** Imported dynamically and cast `as any` / `as unknown as CopilotClientLike` at `cli/src/pipeline.ts:633` and `cli/src/providers/copilot.ts:106`.
- **System `unzip` required:** `packages/design/src/stitch-zip.ts:32`; not declared in `packages/core/src/prerequisites.ts`.
- **`better-sqlite3` native module:** `package.json` `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` — ABI-sensitive; fresh installs may break on unusual platforms.

## Missing Critical Features

- No real lint (eslint/biome) pipeline.
- No coverage reporting in `vitest.config.ts` / `package.json`.
- No integration test against built `dist/`.
- No CI config (no `.github/workflows/`, no `.gitlab-ci.yml`).

## Test Coverage Gaps

- **High — LLM provider dispatch:** `cli/src/pipeline.ts:588-~800` inline provider branches (claude-cli/copilot/google/anthropic) have no direct unit tests (the extracted `cli/src/providers/copilot.ts` is covered by `cli/__tests__/copilot-provider.test.ts` but the pipeline-embedded duplicate is not).
- **Medium — shell-string construction:** No escaping tests for `packages/design/src/figma-make-adapter.ts:83`, `packages/design/src/stitch-zip.ts:32`, `packages/build/src/emulator.ts:48`.
- **Medium — resume edge cases:** `previousContext` + `runMode='add-feature'` combination not exercised (`cli/src/pipeline.ts:88` short-circuits).
- **Medium — design adapter end-to-end:** `packages/design/__tests__/figma-make-adapter.test.ts` and `packages/design/__tests__/stitch-adapter.test.ts` mock the MCP/ZIP clients.
- **Medium — built distributable:** No test that `cli/dist/entry.js` runs after `pnpm build`.
