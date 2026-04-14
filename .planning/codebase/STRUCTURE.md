# Directory Structure

**Analysis Date:** 2026-04-14

## Directory Layout

```
appifex-dtc/
├── bin/
│   └── dtc                      # Executable shim → cli/dist/entry.js
├── cli/                         # Workspace package "appifex-dtc"
│   ├── src/
│   │   ├── cli.ts               # Argv parser (parseArgs, COMMANDS)
│   │   ├── entry.ts             # Main CLI dispatch (shebang)
│   │   ├── pipeline.ts          # runPipeline orchestrator (published lib)
│   │   ├── setup.ts
│   │   ├── setup-wizard.ts      # Interactive `dtc setup`
│   │   ├── doctor.ts            # `dtc doctor` prerequisite check
│   │   ├── preflight.ts         # Fast-fail gate before `dtc run`
│   │   ├── resume-bootstrap.ts  # --resume / --add-feature bootstrap
│   │   ├── snapshot-revert.ts   # Snapshot/revert helper
│   │   ├── providers/
│   │   │   └── copilot.ts       # GitHub Copilot LLM provider
│   │   └── views/
│   │       ├── RunApp.tsx       # Ink entry for `dtc run`
│   │       ├── PipelineView.tsx
│   │       ├── FixLoopView.tsx
│   │       ├── ValidationView.tsx
│   │       ├── ReportView.tsx
│   │       └── format.ts
│   ├── __tests__/
│   │   ├── __fixtures__/phase-13-golden/
│   │   └── helpers/
│   ├── dist/                    # tsc output (bin target)
│   ├── package.json             # "bin": { "dtc": "./dist/entry.js" }
│   └── tsconfig.json
├── packages/                    # All @dtc/* workspace packages
│   ├── core/                    # Kernel (types, config, progress, checkpoint, skills)
│   │   ├── src/{types,types-*,config,progress,token-budget,checkpoint,run-context,
│   │   │       debug-logger,prerequisites,skill-loader,snapshot-sidecar,
│   │   │       baas-recommend,backend-context,index}.ts
│   │   ├── skills/
│   │   │   ├── shared/{spec,codegen}/*.md
│   │   │   ├── swiftui/{codegen,fix}/*.md
│   │   │   └── kotlin-compose/{codegen,fix}/*.md
│   │   ├── __tests__/
│   │   └── dist/
│   ├── runner/                  # Runner port adapters
│   │   └── src/{local-runner,e2b-runner,remote-runner,create-runner,index}.ts
│   ├── agent/                   # Interactive agent CLI adapters
│   │   └── src/{registry,prompt-builder,prompt-sections-design,
│   │             prompt-sections-platform,progress,util,types,index}.ts
│   │       adapters/{base,claude,codex,gemini}.ts
│   ├── design/                  # Design tool adapters (Pencil, Stitch, Figma Make)
│   ├── spec/                    # Spec extraction + translation
│   ├── test-gen/                # Maestro + unit test generators
│   ├── codegen/                 # LLM-driven code generation (ClaudeAdapter, layered)
│   ├── build/                   # Swift/Kotlin build/archive/bundle
│   ├── validate/                # Maestro + unit tests + Semgrep
│   ├── fix/                     # Red→green fix loop
│   ├── analysis/                # Scanner, nav-graph, modification planning, deltas
│   ├── baas/                    # Firebase/Supabase/mock templates + SDK init
│   │   └── src/templates/{firebase,supabase,mock}/
│   ├── baas-check/              # BaaS integration/parity lints
│   │   └── src/patterns/{kotlin,swift}-firebase.ts
│   ├── mock/                    # Mock data services
│   ├── mock-check/              # Mock layer parity checks
│   │   └── src/signature-extract/{kotlin,react,swift}.ts
│   ├── provision/               # TestFlight + Play Console clients
│   ├── deliver/                 # git + GitHub PR delivery
│   ├── report/                  # PipelineReport + Markdown formatter
│   └── mcp-server/              # MCP façade exposing pipeline as tools
│       └── src/tools/*.ts
├── sidecar/
│   └── dist/{server,llm}.js     # Compiled remote sidecar (no TS source)
├── package.json                 # Workspace root scripts (build, test, lint, setup)
├── pnpm-workspace.yaml          # Declares packages/* and cli
├── pnpm-lock.yaml
├── tsconfig.json                # Shared TS base (ES2022, Node16 ESM, strict)
├── vitest.config.ts             # Test globs + workspace path aliases
├── README.md
└── .planning/codebase/          # GSD mapping output
```

## Directory Purposes

- **`bin/`** — user-facing shims; committed. Only `bin/dtc` (Node shebang pointing at `cli/dist/entry.js`).
- **`cli/`** — the `appifex-dtc` workspace package; holds argv parsing, the Ink UI, wizard, doctor/preflight, and the exported `runPipeline` orchestrator.
- **`cli/src/views/`** — Ink/React TUI components, one per major UX surface.
- **`cli/src/providers/`** — pluggable LLM/runtime providers consumed inline by `pipeline.ts` (`copilot.ts`).
- **`cli/__tests__/`** — vitest specs and fixtures (golden outputs under `__fixtures__/phase-13-golden/`).
- **`packages/`** — all `@dtc/*` workspace packages. Each follows the same shape: `src/`, `__tests__/`, `dist/`, `package.json`, `tsconfig.json`, optional `README.md`.
- **`packages/core/`** — the dependency-free kernel (only `better-sqlite3`). Everything else depends on it.
- **`packages/core/skills/`** — bundled markdown prompt fragments shipped with `@dtc/core` (see `"files": ["dist","skills"]` in `packages/core/package.json`).
- **`packages/mcp-server/src/tools/`** — one file per MCP tool (`add-feature.ts`, `analysis.ts`, `build.ts`, `config.ts`, `deliver.ts`, `design.ts`, `fix.ts`, `pipeline.ts`, `provision.ts`, `refine.ts`, `refine-feature.ts`, `refine-keywords.ts`, `report.ts`, `spec.ts`, `test-gen.ts`, `validate.ts`).
- **`sidecar/`** — compiled-only companion HTTP service; no TS source in-repo. Targeted by `RemoteRunner`.
- **`.planning/`** — GSD planning artifacts; `.planning/codebase/` holds the mapping docs.

## Key File Locations

**Entry points:**
- `bin/dtc` — CLI shim.
- `cli/src/entry.ts` → `cli/dist/entry.js` — actual CLI main.
- `cli/src/pipeline.ts::runPipeline` — the pipeline orchestrator (also exported as the `appifex-dtc` library).
- `packages/mcp-server/src/server.ts::createDtcMcpServer` — MCP entry.

**Configuration:**
- `tsconfig.json` — shared TS base: `target ES2022`, `module Node16`, `strict`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`, `rootDir: src`, `outDir: dist`.
- `package.json` — workspace scripts: staged `build` (core+runner first, then rest, then CLI), `test` (`vitest run`), `lint` (`tsc --noEmit`), `clean`, `setup` (`node scripts/build-and-link.mjs`). Engines: Node ≥22, pnpm ≥9.
- `pnpm-workspace.yaml` — `packages/*`, `cli`.
- `vitest.config.ts` — test globs (`packages/**/__tests__/**/*.test.ts`, `cli/__tests__/**/*.test.ts`) + aliases for every `@dtc/*` package to its `src/index.ts` and `appifex-dtc` to `cli/src/pipeline.ts`.
- Per-package `tsconfig.json` + `package.json`; `packages/baas/vitest.config.ts` overrides for that package.
- User config at runtime: `~/.dtc/config.json` (not in repo); schema `DtcConfig` in `packages/core/src/types-config.ts`.

**Core logic:**
- Pipeline orchestration: `cli/src/pipeline.ts`.
- Phase ordering: `packages/core/src/run-context.ts::PHASE_ORDER`.
- Checkpoint schema: `packages/core/src/types-pipeline.ts::CheckpointData`, `packages/core/src/checkpoint.ts`.
- Runner port: `packages/core/src/types.ts` (+ `packages/runner/src/`).
- Agent port: `packages/agent/src/types.ts` (+ `packages/agent/src/adapters/`).
- Skill loader: `packages/core/src/skill-loader.ts`.
- Report assembly: `packages/report/src/{report,formatters}.ts`.

**Testing:**
- Co-located under each package as `<pkg>/__tests__/**.test.ts` (and under `cli/__tests__/`).
- Fixtures under `cli/__tests__/__fixtures__/` and per-package `__tests__` subfolders.
- Package-internal tests inside `packages/baas/src/__tests__/`.

## Naming Conventions

**Files:**
- Source files: `kebab-case.ts` (e.g. `run-context.ts`, `local-runner.ts`, `swift-archive.ts`).
- Type-only domain modules: `types-<area>.ts` barreled through `types.ts` (`packages/core/src/types-design.ts`, etc.).
- Ink views: `PascalCase.tsx` (`RunApp.tsx`, `PipelineView.tsx`).
- Tests: `*.test.ts` under `__tests__/`.
- Skills: numbered markdown (`01-architecture.md`, `02-deprecated-apis.md`) so load order is explicit.

**Directories:**
- Workspace packages: `kebab-case/` under `packages/` matching the `@dtc/<name>` scope.
- Test dirs: `__tests__/` (with `__fixtures__/`, `helpers/`).
- Runtime output dirs (in user projects): `.dtc/`, `.dtc-report/`, `.dtc-debug/`, `.maestro/`, `__tests__/`.

## Where to Add New Code

**New pipeline phase:**
1. Add the phase id to `packages/core/src/types-pipeline.ts::PhaseId` and the default `PHASE_ORDER` in `packages/core/src/run-context.ts`.
2. Add a `CheckpointData` branch for it in `packages/core/src/types-pipeline.ts`.
3. Implement the phase in a new `@dtc/<name>` package under `packages/<name>/src/` (export via `src/index.ts`). Wire into `vitest.config.ts` aliases.
4. Invoke it from `cli/src/pipeline.ts::runPipeline` with `emit` + `ctxBuilder.recordPhase` + `saveRunContext` + `Checkpoint.write`, and optionally gate via `createSkipGate`.
5. If it should always re-run on resume, add to `FORCE_RERUN_PHASES` in `cli/src/pipeline.ts`.
6. Expose as an MCP tool under `packages/mcp-server/src/tools/<phase>.ts` and register in `packages/mcp-server/src/server-tools-pipeline.ts`.

**New CLI subcommand:**
- Add the literal to `COMMANDS` in `cli/src/cli.ts`; if it has subcommands, add to `SUBCOMMAND_COMMANDS`.
- Add a `case '<cmd>':` handler in `cli/src/entry.ts::main`; update `printHelp()`.
- Prefer dynamic `await import(...)` of `@dtc/*` packages for fast CLI startup.

**New Runner adapter:**
- Add `packages/runner/src/<name>-runner.ts` implementing `Runner` from `@dtc/core`.
- Re-export from `packages/runner/src/index.ts` and branch in `packages/runner/src/create-runner.ts` based on `config.runner.type`.
- Extend the `RunnerConfig` discriminated union in `packages/core/src/types-config.ts`.

**New Agent adapter:**
- Add `packages/agent/src/adapters/<name>.ts` extending `base.ts`; register in `packages/agent/src/registry.ts::createAgent` and `detectAgent`.
- Extend `AgentConfigType` in `packages/core/src/types-pipeline.ts`.

**New design tool adapter:**
- Add `packages/design/src/<tool>-adapter.ts` (optionally a `<tool>-client.ts`); re-export from `packages/design/src/index.ts`; branch in `packages/design/src/adapter-factory.ts`.
- Add a matching extractor under `packages/spec/src/<tool>-extractor.ts` and wire into `cli/src/pipeline.ts`.

**New skill fragment:**
- Drop a numbered markdown file under `packages/core/skills/<platform>/<phase>/NN-<topic>.md`; picked up automatically by `createBundledSkillProvider`.

**Utilities / shared helpers:**
- Cross-package: extend `@dtc/core` (`packages/core/src/`) — keep it dependency-light.
- CLI-only: `cli/src/` sibling file.

**Tests:**
- Co-locate under `packages/<pkg>/__tests__/<file>.test.ts` or `cli/__tests__/<file>.test.ts`. Vitest aliases let tests import `@dtc/<pkg>` and hit the source `src/index.ts` directly — no build step needed.

## Special Directories

- **`.dtc/`** (in user output dir) — `run-context.json`, `checkpoint.db`, `snapshot.json`; generated; not committed.
- **`.dtc-debug/`** (in user output dir) — verbose logs; generated; not committed.
- **`.dtc-report/`** (in user output dir) — validation reports; generated; not committed.
- **`dist/`** (every package + `cli/` + `sidecar/`) — tsc output; generated; not committed (aside from `sidecar/dist/`).
- **`packages/core/skills/`** — bundled prompt fragments; committed and shipped per `packages/core/package.json::files`.
- **`.planning/codebase/`** — GSD mapping docs; committed.
- **`node_modules/`** — generated; not committed.
