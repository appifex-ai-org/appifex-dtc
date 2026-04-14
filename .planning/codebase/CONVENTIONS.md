# Coding Conventions

**Analysis Date:** 2026-04-14

## Naming Patterns

**Files:**
- Source files: `kebab-case.ts` — `packages/core/src/run-context.ts`, `packages/core/src/token-budget.ts`, `packages/core/src/snapshot-sidecar.ts`, `cli/src/resume-bootstrap.ts`, `cli/src/setup-wizard.ts`
- React/Ink view components: `PascalCase.tsx` — `cli/src/views/PipelineView.tsx`, `cli/src/views/FixLoopView.tsx`, `cli/src/views/RunApp.tsx`, `cli/src/views/ValidationView.tsx`, `cli/src/views/ReportView.tsx`
- View helpers as siblings in kebab-case: `cli/src/views/format.ts`
- Type-only modules: `types-<domain>.ts` under `packages/core/src/` (`types-design.ts`, `types-config.ts`, `types-pipeline.ts`, `types-context.ts`, `types-testing.ts`, `types-validation.ts`) re-exported via barrel `packages/core/src/types.ts`
- Tests: `<source>.test.ts` inside a sibling `__tests__/` directory — e.g. `packages/core/__tests__/checkpoint.test.ts` tests `packages/core/src/checkpoint.ts`
- Test harnesses/helpers: `cli/__tests__/helpers/phase-14-harness.ts`, `cli/__tests__/helpers/phase-13-harness.ts`

**Functions:**
- `camelCase` — `loadConfig`, `saveConfig`, `writePreAgentSnapshotSidecar`, `parseArgs`, `createSkipGate`, `buildContextSummary`, `terminalProgressListener`
- Factories prefixed `create*` — `createDebugLogger`, `createSkipGate`, `createFileSkillProvider`, `createBundledSkillProvider`, `createDefaultGenerateFn`, `createClaudeCliGenerateFn`, `createCopilotGenerateFn`, `createRunner`
- Domain verbs — `assessBaasAppropriateness`, `extractBaasSignals`, `checkPrerequisites`, `detectBaasProvider`, `inferBaasSchema`
- Booleans `is`/`has`/`can` — `isInteractive`, `isLayeredCodegenResult`, `canConsume`, `canConsumePhase`, `canSkipPhase`

**Variables / Constants:**
- Locals `camelCase`; module-level constants `SCREAMING_SNAKE_CASE` — `PHASE_ORDER`, `FORCE_RERUN_PHASES`, `CONFIG_FILE`, `CONTEXT_DIR`, `CONTEXT_FILE`, `DEFAULT_CONFIG`, `STATUS_ICONS`, `PHASE_LABELS`, `COMMANDS`, `SCHEMA_INFERENCE_PROMPT`, `VALID_FIELD_TYPES`

**Types / Interfaces:**
- `PascalCase` without `I` prefix — `DtcConfig`, `RunContext`, `PhaseId`, `Checkpoint`, `TokenBudget`, `ProgressEmitter`, `SnapshotSidecarPayload`, `SkipGateInputs`, `ParsedArgs`, `Runner`, `ExecResult`
- `interface` for public shapes (`SkipGate`, `DebugLogger`, `ParsedArgs`); `type` for unions/aliases (`Command`, `PhaseDisplayStatus`, `ProgressListener`)
- `as const` tuples drive literal unions — `COMMANDS` in `cli/src/cli.ts`, `VALID_FIELD_TYPES` in `packages/baas/src/infer-schema.ts`

## Code Style

**Formatting:**
- No Prettier, ESLint, or Biome config anywhere in repo (no `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, `biome.json`)
- De-facto style:
  - 2-space indentation
  - Single quotes
  - Semicolons OMITTED at statement ends (see `cli/src/cli.ts`, `cli/src/pipeline.ts`, `packages/core/src/config.ts`, `packages/core/src/checkpoint.ts`)
  - Trailing commas on multi-line objects/arrays
  - Arrow functions for callbacks/factories; `function` keyword for exported module-level functions
- Sole enforcement: `pnpm lint` → `tsc --noEmit` (`package.json:10`)

**TypeScript Config (`tsconfig.json`):**
- `target: ES2022`, `module: Node16`, `moduleResolution: Node16`
- `strict: true`, `forceConsistentCasingInFileNames: true`, `isolatedModules: true`, `verbatimModuleSyntax: true`
- `declaration: true`, `declarationMap: true`, `sourceMap: true`, `outDir: dist`, `rootDir: src`

**Module System:**
- ESM only (`"type": "module"` in every package). Relative imports MUST include `.js` extension in `.ts` sources — e.g. `import { Checkpoint } from '../src/checkpoint.js'`, `import type { DtcConfig } from './types.js'`
- `verbatimModuleSyntax` requires explicit `import type` for type-only imports

## Import Organization

**Observed order** (`cli/src/pipeline.ts`, `packages/runner/src/local-runner.ts`):
1. Workspace `@dtc/*` imports (value + type mixed)
2. Node built-ins: `node:fs/promises`, `node:path`, `node:os`, `node:crypto`, `node:child_process`
3. Third-party: `chalk`, `react`, `ink`, `better-sqlite3`, `@anthropic-ai/sdk`, `@github/copilot-sdk`, `@clack/prompts`
4. Relative imports (with `.js` suffix)
5. `import type { … }` groups trailing or interleaved

**Path Aliases:**
- Workspace aliases `@dtc/<pkg>` → `packages/<pkg>/src/index.ts` in `vitest.config.ts:10-29`. Runtime uses pnpm `workspace:*` in each package's `dependencies`
- CLI alias `'appifex-dtc' → cli/src/pipeline.ts` (`vitest.config.ts:28`)

## Error Handling

- `try { … } catch { return DEFAULT }` for soft-failure reads — `loadConfig` defaults on failure (`packages/core/src/config.ts:13-24`); `loadRunContext` returns `null` (`packages/core/src/run-context.ts:17-29`)
- `try { … } catch (err) { throw new Error(\`<context>: ${String(err)}\`) }` to re-throw with attribution — `Checkpoint.getPhase` wraps JSON parse error with run/phase context (`packages/core/src/checkpoint.ts:52-57`)
- Structural validation after `JSON.parse` — `loadRunContext` checks `runId`, `platform`, `phases` shape (`packages/core/src/run-context.ts:22-25`)
- Custom error classes for domain failures — `SidecarCorruptError` (`packages/core/src/snapshot-sidecar.ts`)
- Early-return guard clauses over nested ifs — `createSkipGate` (`cli/src/pipeline.ts:75-100`)
- Idempotent close tracking on stateful resources — `Checkpoint.closed` flag prevents double-close (`packages/core/src/checkpoint.ts:9, 77-88`)
- `process.exit(1)` on CLI fatal paths after printing guidance (`cli/src/preflight.ts:27`)

## Logging

**Framework:** None. `console.log` / `console.error` with `chalk` colorization (`cli/src/preflight.ts`, `cli/src/views/format.ts`).

**Patterns:**
- Progress via `ProgressEmitter` + `terminalProgressListener(write)` (`packages/core/src/progress.ts`)
- Standardized status icons `● ◐ ✓ ✗ ○ –` (`packages/core/src/progress.ts:29-36`, `cli/src/views/format.ts:13-19`)
- Debug artifacts to `.dtc-debug/` via opt-in `DebugLogger` (`packages/core/src/debug-logger.ts`); `logJson` pretty-prints 2-space
- Chalk conventions: `chalk.red` fatal, `chalk.dim` hints/secondary, `chalk.cyan` running, `chalk.green` success

## Comments

**When to Comment:**
- Phase-numbered change markers anchor non-obvious logic to `.planning/phases/` — e.g. `// Phase 13 (WR-02): …`, `// Phase 14 (D-09): …`, `// Phase 18 Plan 01 (Bug A fix): …` (see `cli/src/pipeline.ts:32-36, 81-87`, `packages/core/src/checkpoint.ts:7-9, 25-35`)
- Block comments on exported functions document runtime contracts — `writePreAgentSnapshotSidecar` (`packages/core/src/snapshot-sidecar.ts:19-36`)
- Cross-file line references — e.g. `See pipeline.ts:1588-1594`

**JSDoc/TSDoc:**
- Short `/** … */` summaries above exports — `createSkipGate`, `savePhase`, `saveRunContext`, `loadRunContext`, `buildContextSummary`
- Multi-paragraph doc blocks for algorithmic invariants (atomic write, deterministic hash, force-rerun rules)
- `//` for single-line rationale

## Function Design

**Size:** Small, single-purpose. Pure helpers extracted out of closures for testability — `createSkipGate` extracted from `runPipeline` inline closure (`cli/src/pipeline.ts:75-100`); `decidePenFileStrategy` and `generatePreBuildSummary` exported from `cli/src/pipeline.ts` for direct unit testing.

**Parameters:**
- Object bags for 3+ args: `createSkipGate({ runMode, isContinuation, previousContext, resumeState })`
- Positional for 1-2 args: `writePreAgentSnapshotSidecar(dtcDir, runId, snapshot)`
- Option interfaces declared: `SkipGateInputs`, `Phase14ScenarioOpts`, `SetupAnswers`, `CopilotProviderOpts`

**Return Values:**
- Explicit return types on exports — `async function loadConfig(configDir: string): Promise<DtcConfig>`
- `null` (not `undefined`) for "not found" — `getPhase`, `loadRunContext`, `lastCompletedPhase`
- Tagged object shapes — `SnapshotSidecarMetadata { path, sha256, fileCount }`

## Module Design

**Exports:**
- Named exports only (no `default` exports across `packages/*/src/` or `cli/src/`)
- Mixed value + type re-exports — `export { Checkpoint } from './checkpoint.js'` alongside `export type { DebugLogger } from './debug-logger.js'`

**Barrel Files:**
- Each package exposes `src/index.ts` as its public surface (`packages/core/src/index.ts`, `packages/baas/src/index.ts`, `packages/runner/src/index.ts`)
- `packages/core/src/types.ts` is a pure barrel re-exporting domain-split `types-*.ts` files (header: "Barrel re-export — domain modules split per v0.4.3 Phase 29")
- Package `package.json` `exports` restricts consumers to `./dist/index.js` (`cli/package.json:8`, `packages/core/package.json:7-12`)

## TypeScript Conventions

- Generic checkpoint typing: `savePhase<P extends PhaseId>(runId, phase, data: CheckpointData[P])` (`packages/core/src/checkpoint.ts:36`)
- Type predicates for narrowing: `function isLayeredCodegenResult(result): result is LayeredCodegenResult` (`cli/src/pipeline.ts:42-46`)
- `readonly` / `ReadonlySet` for immutable module state — `FORCE_RERUN_PHASES: ReadonlySet<PhaseId>` (`cli/src/pipeline.ts:36`)
- Getter properties for computed state — `TokenBudget.totalUsed`, `TokenBudget.totalRemaining`, `ProgressEmitter.history`
