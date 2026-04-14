# Testing Patterns

**Analysis Date:** 2026-04-14

## Test Framework

**Runner:**
- Vitest `^4.0.0` (`package.json:16`)
- Root config: `vitest.config.ts`
- Per-package config override: `packages/baas/vitest.config.ts` (scoped include pattern `src/__tests__/**/*.test.ts`)

**Assertion Library:** Vitest built-in `expect` (`import { describe, it, expect } from 'vitest'`)

**Run Commands** (`package.json:7-13`):
```bash
pnpm test           # vitest run — full suite
pnpm test:watch     # vitest — watch mode
pnpm lint           # tsc --noEmit (type-check only, no test runtime)
```

## Test File Organization

**Location:**
- Root includes: `packages/**/__tests__/**/*.test.ts`, `cli/__tests__/**/*.test.ts` (`vitest.config.ts:6`)
- `testTimeout: 10_000` ms (`vitest.config.ts:7`)
- Tests live in a sibling `__tests__/` directory to `src/` — NEVER co-located next to source

**Naming:** `<feature>.test.ts` mirrors the source module — `packages/core/__tests__/checkpoint.test.ts` ↔ `packages/core/src/checkpoint.ts`

**Structure:**
```
packages/<pkg>/
├── src/<feature>.ts
└── __tests__/
    └── <feature>.test.ts

cli/
├── src/<feature>.ts
└── __tests__/
    ├── <feature>.test.ts
    ├── helpers/<phase-N>-harness.ts   # integration harnesses
    └── __fixtures__/                  # golden files
```

## Test Structure

**Imports:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
```

**Suite organization** (`packages/core/__tests__/config.test.ts:10-20`):
```typescript
describe('config', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-test-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('returns default config when no file exists', async () => { … })
})
```

**Patterns:**
- One top-level `describe` per module/class; nested `describe` for feature slices — `packages/core/__tests__/checkpoint.test.ts` uses `describe('Checkpoint', …)` + `describe('Phase 13: generic savePhase + lastCompletedPhase', …)`
- `beforeEach` creates tmpdir via `mkdtempSync(join(tmpdir(), '<prefix>-'))`; `afterEach` tears down with `rmSync(…, { recursive: true, force: true })`
- For async setup, `beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), '<prefix>-')) })` with `rm(…, { recursive: true, force: true })` (`packages/core/__tests__/snapshot-sidecar.test.ts:10-12`)
- Descriptive `it(…)` names state behavior ("returns default config when no file exists", "overwrites existing phase data")

## Mocking

**Framework:** `vi` from Vitest — `vi.fn()`, `vi.mock()`, `vi.fn().mockResolvedValue(…)`, `vi.fn().mockImplementation(…)`

**Factory-style mock for injected interfaces** (`packages/validate/__tests__/validate.test.ts:5-15`, `cli/__tests__/copilot-provider.test.ts:12-21`):
```typescript
function mockRunner(overrides: Partial<{ exec: unknown }> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: { hasMaestro: true, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'linux' },
    ...overrides,
  }
}
```

**Conditional exec mock by command/args** (`packages/validate/__tests__/validate.test.ts:42-59`):
```typescript
function maestroExec(overrides = {}) {
  return vi.fn().mockImplementation((cmd: string, args?: string[]) => {
    if (cmd === 'maestro') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 5000 })
    if (cmd === 'xcrun' && args?.[0] === 'simctl') return Promise.resolve({ exitCode: 0, … })
    …
  })
}
```

**Module-level `vi.mock()` for SDK substitution** (`packages/design/__tests__/pencil-mcp-client.test.ts:5-21`):
```typescript
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const mockCallTool = vi.fn()
  class MockClient { connect = vi.fn(); close = vi.fn(); callTool = mockCallTool }
  return { Client: MockClient, __mockCallTool: mockCallTool }
})
```

**Mock `fetch` with queued responses** (`packages/design/__tests__/figma-rest-client.test.ts:19-30`):
```typescript
function mockFetch(responses) {
  let callIndex = 0
  return vi.fn().mockImplementation(async () => {
    const resp = responses[callIndex++] ?? { ok: false, text: 'No more responses' }
    return { ok: resp.ok, json: async () => resp.json, text: async () => resp.text ?? '' }
  })
}
```

Dependency injection via optional constructor param — `FigmaRestClient({ token, fetchImpl })` accepts `fetchImpl` override.

**What to Mock:**
- External SDKs (`@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `@github/copilot-sdk`)
- `Runner` interface (exec, readFile, writeFile, exists, glob) — never actual shell or FS
- Network: `fetch` passed as `fetchImpl` option
- LLM `createMessage` functions — passed as `CreateMessageFn` callbacks

**What NOT to Mock:**
- `Checkpoint` (real `better-sqlite3` with `:memory:` or tmpdir file — `packages/core/__tests__/checkpoint.test.ts:76`)
- `writePreAgentSnapshotSidecar` / `readPreAgentSnapshotSidecar` — exercised against real tmpdirs
- `node:fs/promises`, `node:os` — tests use real `mkdtempSync`/`mkdtemp` + `tmpdir()`
- Pure helpers (`parseArgs`, `decidePenFileStrategy`, `formatPreBuildSummary`, `TokenBudget`) — tested directly

## Fixtures and Factories

**Test Data Factories** (`cli/__tests__/pipeline-helpers.test.ts:6-16`, `cli/__tests__/format.test.ts:6-25`):
```typescript
function makeAppContext(screenNames: string[]): AppContext {
  return {
    platform: 'swiftui',
    inventory: screenNames.map(name => ({ name, type: 'screen', filePath: `Sources/Views/${name}View.swift` })),
    navGraph: [],
    entryPoint: null,
    scannedAt: Date.now(),
  }
}

function makeSummary(overrides: Partial<PreBuildSummary> = {}): PreBuildSummary {
  return { newScreens: [], modifiedFiles: [], designStrategy: 'extend', testFilesToGenerate: [], tokenCount: 5, enrichedPrompt: 'Add dark mode', ...overrides }
}
```

Factories use the `overrides: Partial<T> = {}` + spread pattern.

**Integration harnesses:** `cli/__tests__/helpers/phase-14-harness.ts`, `cli/__tests__/helpers/phase-13-harness.ts` — drive real `Checkpoint`, real `writePreAgentSnapshotSidecar`, real `runResumeBootstrap` against a tmp workdir. Preferred over full-pipeline mocking when "faithful simulation" of a resume is required.

**Golden files:** `cli/__tests__/__fixtures__/phase-13-golden/` used by byte-identical tests (`cli/__tests__/byte-identical.test.ts`).

**Inline constants for large payloads:** `PASSING_JUNIT` / `FAILING_JUNIT` XML at top of `packages/validate/__tests__/validate.test.ts:17-39`.

## Coverage

**Requirements:** None enforced. No coverage thresholds in `vitest.config.ts`; no coverage script in `package.json`.

**View Coverage:**
```bash
pnpm vitest run --coverage   # ad-hoc — no dedicated script
```

## Test Types

**Unit Tests:** Pure-function assertions + class contracts — `packages/core/__tests__/token-budget.test.ts`, `packages/core/__tests__/config.test.ts`, `cli/__tests__/cli.test.ts`, `cli/__tests__/format.test.ts`, `cli/__tests__/pipeline-helpers.test.ts`

**Integration Tests:** Real filesystem + SQLite, mocked external services — `packages/core/__tests__/checkpoint.test.ts`, `packages/core/__tests__/snapshot-sidecar.test.ts`, `cli/__tests__/pipeline-resume-checkpoint.test.ts`, `cli/__tests__/pipeline-checkpoint-trail.test.ts`, `packages/validate/__tests__/e2e-baas-validation.test.ts`

**Resume / scenario tests:** Built on the phase-13/phase-14 harnesses — `cli/__tests__/pipeline-add-feature-resume.test.ts`, `cli/__tests__/pipeline-baas.test.ts`, `cli/__tests__/resume-bootstrap.test.ts`, `cli/__tests__/snapshot-revert.test.ts`

**E2E Tests:** No Playwright / Maestro / Cypress runner wired into the repo's test suite. Maestro integration logic is itself unit-tested with a mocked `Runner` (`packages/validate/__tests__/validate.test.ts`).

## Common Patterns

**Async Testing:**
```typescript
it('loads config from config.json in the given directory', async () => {
  await saveConfig(configDir, custom)
  const loaded = await loadConfig(configDir)
  expect(loaded).toEqual(custom)
})
```

**Error Testing** (`packages/design/__tests__/figma-rest-client.test.ts:13-15`):
```typescript
it('throws for invalid URL', () => {
  expect(() => extractFileKey('https://example.com/foo')).toThrow('Cannot extract file key')
})
```

**Environment/Global Mutation (with restore):** `cli/__tests__/pipeline-noninteractive.test.ts:6-18` — captures `process.stdin.isTTY` in `beforeEach`, restores in `afterEach` via `Object.defineProperty(…, { configurable: true })`.

**Tmpdir Isolation:** Always `mkdtempSync(join(tmpdir(), '<prefix>-'))` with teardown — never write to repo paths. Prefixes: `dtc-test-`, `dtc-ckpt-`, `sidecar-`, `phase14-`.

**In-memory SQLite:** `new Checkpoint(':memory:')` for unit tests that don't need persistence (`packages/core/__tests__/checkpoint.test.ts:76`).

**RED-state marker:** `// @ts-expect-error Wave 1 helper — module does not yet exist (expected RED state)` — used when TDD tests land before impl (`packages/core/__tests__/snapshot-sidecar.test.ts:6-7`).
