# Architecture

**Analysis Date:** 2026-04-14

## Pattern Overview

**Overall:** pnpm monorepo with a phased, pipeline-oriented domain architecture. A single CLI entrypoint orchestrates ~18 focused workspace packages, each owning one stage of a "design → spec → test-gen → codegen → build → validate → fix → deliver" pipeline. Packages depend via explicit `workspace:*` ranges on a shared `@dtc/core` kernel holding types, config, progress/checkpoint, and skill loading.

**Key Characteristics:**
- Workspace layout defined in `pnpm-workspace.yaml` (`packages/*`, `cli`). `vitest.config.ts` aliases each `@dtc/*` to its `src/index.ts` for in-repo testing.
- Ports-and-adapters: `Runner` port in `packages/core/src/types.ts` with three adapters in `packages/runner/src/{local-runner,e2b-runner,remote-runner}.ts` plus a decorator `packages/mcp-server/src/command-collecting-runner.ts`. Same for `AgentAdapter` (`packages/agent/src/types.ts`, `packages/agent/src/adapters/{claude,codex,gemini,base}.ts`).
- Ordered pipeline phases defined once in `packages/core/src/run-context.ts::PHASE_ORDER` and consumed across `cli/src/pipeline.ts`, `packages/core/src/checkpoint.ts`, and `packages/mcp-server`. Each phase emits `ProgressEvent`s and persists a `CheckpointData` row keyed by `PhaseId` (`packages/core/src/types-pipeline.ts`).
- DI-style phase functions: `runTestRegenPhase`, `runDesignDeltaPhase`, `createSkipGate`, `generatePreBuildSummary` in `cli/src/pipeline.ts` take "deps bundles" so they are unit-testable in isolation.
- Dual surfaces: Ink/React terminal UI (`cli/src/views/*.tsx`) and an MCP server (`packages/mcp-server/src/server.ts`) exposing the same stages as MCP tools (one per verb under `packages/mcp-server/src/tools/`).
- Skills pattern: platform-specific prompt fragments under `packages/core/skills/{swiftui,kotlin-compose,shared}/{codegen,fix,spec}/*.md`, loaded by `createBundledSkillProvider` / `createFileSkillProvider` in `packages/core/src/skill-loader.ts`.

## Layers

**CLI / UI (`cli/`)**
- Purpose: parse argv, wizard setup, render terminal UI, invoke pipeline.
- Key files: `cli/src/entry.ts` (shebang + command dispatch), `cli/src/cli.ts` (arg parser), `cli/src/pipeline.ts` (orchestration, package `appifex-dtc`), `cli/src/setup.ts`, `cli/src/setup-wizard.ts`, `cli/src/doctor.ts`, `cli/src/preflight.ts`, `cli/src/resume-bootstrap.ts`, `cli/src/snapshot-revert.ts`, `cli/src/providers/copilot.ts`, views in `cli/src/views/*.tsx`.
- Depends on: every `@dtc/*` plus `ink`, `ink-spinner`, `react`, `@clack/prompts`, `chalk`, `@anthropic-ai/sdk`, `@github/copilot-sdk`.
- Used by: the `dtc` binary (`bin/dtc` → `cli/dist/entry.js`) and the MCP server when it re-runs the pipeline.

**Kernel (`@dtc/core`)**
- Purpose: single source of truth for domain types, config, progress, token budget, checkpoint, run-context, debug logging, prerequisites, skill loading, snapshot sidecar.
- Key files: `packages/core/src/types.ts` (barrel of `types-{design,testing,validation,pipeline,config,context}.ts`), `config.ts`, `progress.ts`, `token-budget.ts`, `checkpoint.ts` (SQLite via `better-sqlite3`), `run-context.ts` (JSON `.dtc/run-context.json`), `debug-logger.ts`, `prerequisites.ts`, `skill-loader.ts`, `snapshot-sidecar.ts`, `baas-recommend.ts`, `backend-context.ts`.
- Depends on: `better-sqlite3` only.
- Used by: every other `@dtc/*` package + the CLI.

**Execution Port (`@dtc/runner`)**
- Files: `packages/runner/src/{local-runner,e2b-runner,remote-runner,create-runner,index}.ts`. Capabilities probe in `LocalRunner` via `which` for `maestro`, `xcodebuild`, `xcodegen`, `semgrep`, `java`, `gradle`, `adb`, `emulator`, plus `ANDROID_HOME` check.

**Design input (`@dtc/design`)** — `packages/design/src/{pencil-adapter,pencil-mcp-client,stitch-adapter,stitch-zip,figma-make-adapter,figma-rest-client,adapter-factory,xcassets-writer}.ts`.

**Spec (`@dtc/spec`)** — `packages/spec/src/{extract,pen-extractor,pen-navigation,mcp-extractor,stitch-extractor,figma-make-extractor,translate,icon-mapping,generate-spec}.ts`.

**Test generation (`@dtc/test-gen`)** — `packages/test-gen/src/{ui-tests,unit-tests,index}.ts` (Maestro flows + XCTest/Gradle tests).

**Codegen (`@dtc/codegen`)** — `packages/codegen/src/{claude-adapter,default-generate,claude-cli-generate,layered-prompt,layered-generate,types}.ts`.

**Agent runtime (`@dtc/agent`)** — `packages/agent/src/{registry,prompt-builder,prompt-sections-design,prompt-sections-platform,progress,util,types,index}.ts` with `adapters/{claude,codex,gemini,base}.ts`.

**Build (`@dtc/build`)** — `packages/build/src/{swift,swift-archive,swift-precheck,kotlin,kotlin-bundle,simulator,emulator,types}.ts`.

**Validate/Security (`@dtc/validate`)** — `packages/validate/src/{maestro,unit-tests,validate-all,junit-parser,semgrep}.ts`.

**Fix loop (`@dtc/fix`)** — `packages/fix/src/{fix-loop,default-fix,claude-cli-fix}.ts`.

**Analysis (`@dtc/analysis`)** — `packages/analysis/src/{scanner,nav-graph,modification-planner,modified-screens,design-delta,token-cap,run-context-backup,types}.ts`.

**BaaS (`@dtc/baas`, `@dtc/baas-check`)** — `packages/baas/src/{auth-deep-link,auth-templates,config-stubs,data-services,detect-provider,infer-schema,render-templates,sdk-init,security-lint}.ts` with `templates/{firebase,supabase,mock}`; checks in `packages/baas-check/src/{baas-integration,baas-parity,comment-strip}.ts` + `patterns/{kotlin,swift}-firebase.ts`.

**Mock layer (`@dtc/mock`, `@dtc/mock-check`)** — `packages/mock/src/{index,types}.ts`; `packages/mock-check/src/{mock-layer,mock-parity}.ts` + `signature-extract/{kotlin,react,swift}.ts`.

**Provision (`@dtc/provision`)** — `packages/provision/src/{asc-client,play-console-client}.ts`.

**Deliver (`@dtc/deliver`)** — `packages/deliver/src/{deliver,git-client,github}.ts`.

**Report (`@dtc/report`)** — `packages/report/src/{report,formatters}.ts`.

**MCP server (`@dtc/mcp-server`)** — `packages/mcp-server/src/{server,server-tools-pipeline,server-tools-dev,command-collecting-runner}.ts` + `tools/{add-feature,analysis,build,config,deliver,design,fix,pipeline,provision,refine,refine-feature,refine-keywords,report,spec,test-gen,validate}.ts`.

**Remote sidecar (`sidecar/`)** — ships as compiled JS only: `sidecar/dist/{server,llm}.js`. Targeted by `RemoteRunner`.

## Data Flow — `dtc run` (in `cli/src/pipeline.ts::runPipeline`)

1. `cli/src/entry.ts::main` parses argv (`cli/src/cli.ts::parseArgs`), validates platform/BaaS, runs preflight (`cli/src/preflight.ts`), then calls `renderRunApp` (`cli/src/views/RunApp.tsx`) which invokes `runPipeline` with a `ProgressEmitter`.
2. `loadConfig(~/.dtc)` → `createRunner(config.runner)` → `new TokenBudget(...)` → skill provider loaded.
3. `loadRunContext(outputDir)` reads `{outputDir}/.dtc/run-context.json`; `Checkpoint` opens `{outputDir}/.dtc/checkpoint.db`. `createSkipGate` decides per-phase skip based on `runMode`, previous context, and `resumeState` (`cli/src/pipeline.ts:64-101`).
4. Phases execute in `PHASE_ORDER = ['analysis','design','spec','design_delta','baas_recommend','baas_schema','baas_auth','mock_service','test_gen','codegen','test_regen','build','validate','security','fix','deliver','report']` (`packages/core/src/run-context.ts:31`). `FORCE_RERUN_PHASES = {validate, fix, deliver, report}` always re-run (`cli/src/pipeline.ts:36`).
5. Per phase: `emit(phase,'started')` → adapter-package call → `ctxBuilder.recordPhase(...)` → `saveRunContext` + `Checkpoint.write` → `emit(phase,'completed'|'skipped'|'failed')`.
6. Agent-driven codegen/fix use `@dtc/agent::createAgent`/`buildAgentPrompt`; text-only LLM calls go through an LLM message fn that either uses `@anthropic-ai/sdk` or shells to `claude --print` when `config.llm.provider === 'claude-cli'` (`cli/src/pipeline.ts:588-600`).
7. Artifacts land in user project: source tree, `.maestro/`, `__tests__/`, `.dtc-report/`, `.dtc-debug/`. Resume state lives only in `.dtc/`.
8. `buildReport` + `formatMarkdown` (`@dtc/report`) produce `PipelineResult`; optionally `deliver()` commits/pushes/PRs.

**State management:**
- In-memory accumulator: `RunContextBuilder` (`packages/core/src/run-context.ts:76+`).
- Durable run state: `{outputDir}/.dtc/run-context.json` via `saveRunContext`/`loadRunContext`.
- Resume index: SQLite `{outputDir}/.dtc/checkpoint.db` via `Checkpoint` (`packages/core/src/checkpoint.ts`); payload is `CheckpointData` discriminated union (`packages/core/src/types-pipeline.ts:36-73`).
- Snapshot/revert for add-feature: `snapshotSourceFiles` + `revertUnexpectedChanges` (`cli/src/pipeline.ts:226-284`) + tamper-evident sidecar (`packages/core/src/snapshot-sidecar.ts`).
- Token budget: `TokenBudget` (`packages/core/src/token-budget.ts`).
- User config: `~/.dtc/config.json` via `loadConfig`/`saveConfig`.

## Key Abstractions

- **`Runner`** — port at `packages/core/src/types.ts` (`exec`, `readFile`, `writeFile`, `glob`, `mkdir`, `capabilities`). Adapters: `packages/runner/src/{local,e2b,remote}-runner.ts`. Decorator: `packages/mcp-server/src/command-collecting-runner.ts`. Factory: `packages/runner/src/create-runner.ts`.
- **`AgentAdapter`** — unifies `claude`/`codex`/`gemini` CLI drivers behind `run(opts)`. `packages/agent/src/types.ts`, adapters in `packages/agent/src/adapters/`, factory in `packages/agent/src/registry.ts::createAgent`/`detectAgent`.
- **`ProgressEmitter` / `ProgressEvent`** — single pub/sub channel. `packages/core/src/progress.ts`. Subscribed by `cli/src/views/PipelineView.tsx`, `FixLoopView.tsx`, `ValidationView.tsx`, `ReportView.tsx`.
- **`PhaseId` + `CheckpointData`** — enumerated stages + per-phase discriminated payload. `packages/core/src/types-pipeline.ts`, `packages/core/src/run-context.ts::PHASE_ORDER`.
- **`SkillProvider` / `SkillContent`** — platform skill markdown loader. `packages/core/src/skill-loader.ts`, bundled fragments under `packages/core/skills/`.
- **`PlatformSpec` / `DesignTokens`** — platform-neutral (then translated) app representation. `packages/core/src/types-design.ts`; translators in `packages/spec/src/translate.ts`.
- **`RunContext` / `RunContextBuilder`** — durable run state and its builder. `packages/core/src/types-context.ts`, `packages/core/src/run-context.ts`.

## Entry Points

- **CLI binary:** `bin/dtc` is a thin shebang JS (shim into `cli/dist/entry.js` as declared in `cli/package.json::bin.dtc`). Source is `cli/src/entry.ts`. Triggered by the user running `dtc <command>`.
- **Pipeline library:** `cli/src/pipeline.ts`, published as `appifex-dtc` (`main: dist/pipeline.js`). Triggered by `renderRunApp` (`cli/src/views/RunApp.tsx`) and MCP pipeline tools (`packages/mcp-server/src/tools/pipeline.ts`).
- **MCP server:** `packages/mcp-server/src/server.ts::createDtcMcpServer`. Registers pipeline + dev tools; wraps `Runner` with `CommandCollectingRunner`.
- **Sidecar HTTP server:** `sidecar/dist/server.js` (compiled only; no TS source in repo). Called by `packages/runner/src/remote-runner.ts`.

## Error Handling

**Strategy:** explicit result objects at package boundaries (`{ success, error?, ... }`) combined with thrown `Error`s inside the pipeline caught by `main().catch(...)` in `cli/src/entry.ts:684-687`. User-facing failures print `chalk.red('✗ ...')` and `process.exit(1)`.

**Patterns:**
- Result envelopes: `DesignResult`, `ValidationResult`, `LayeredCodegenResult`, `DeliverResult`, `MaestroResult`, `UnitTestResult`.
- Phase-level try/catch in `runPipeline` emits `failed` and writes a `CheckpointFailed` row (`packages/core/src/types-pipeline.ts:18-23`) before re-throwing.
- Fail-closed guards: `runDesignDeltaPhase` (`cli/src/pipeline.ts:461-497`) throws on breaking drift unless `--accept-drift`; `cli/src/resume-bootstrap.ts` rejects missing/corrupt context; `loadRunContext` validates JSON shape (`packages/core/src/run-context.ts:17-29`).
- Soft-fail: `snapshotSourceFiles` (`cli/src/pipeline.ts:226-248`) and `revertUnexpectedChanges` (`cli/src/pipeline.ts:255-284`) swallow per-file errors.
- `SidecarCorruptError` (`packages/core/src/snapshot-sidecar.ts`) for tamper detection.

## Cross-Cutting Concerns

- **Logging:** `createDebugLogger` (`packages/core/src/debug-logger.ts`) writes to `{outputDir}/.dtc-debug/` when `--verbose`; `chalk` + Ink for UX; `ProgressEmitter` for phase events (`packages/core/src/progress.ts`).
- **Validation:** inline CLI flag validation in `cli/src/entry.ts` (`validatePlatform`, `validateBaasProvider`, `VALID_MODES`); JSON shape validation in `loadRunContext`; static checks via `@dtc/baas-check`, `@dtc/mock-check`, and `packages/validate/src/semgrep.ts`.
- **Authentication:** all creds live in `~/.dtc/config.json` (`DtcConfig` in `packages/core/src/types-config.ts`): `llm.apiKey`, `apple.asc*`, `android.serviceAccountKeyPath` / keystore, `deliver.*`, `design.*`. `@dtc/provision` applies Apple/Play creds; `@dtc/deliver` delegates GitHub auth to the local `gh` CLI; LLM calls use `@anthropic-ai/sdk` or shell to `claude --print` (`cli/src/pipeline.ts:588-600`).
