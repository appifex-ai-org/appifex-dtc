# Phase 7: Design Parity, MCP Surface & Observability — Context

**Gathered:** 2026-04-18
**Updated:** 2026-04-19 (post-execution corrections: haiku pricing, token field priority, security patterns)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 is the finishing-work phase on top of the stable pipeline delivered by Phases 1–6. It closes three independent tracks in parallel:

1. **Design adapter parity (DESIGN-01..04)** — All four adapters (Pencil, Figma-REST, Figma-Make, Stitch) import a single shared `sanitizeLayerName` function from `@appifex/design/sanitize.ts`, and all four pass the same layer-name fixture suite (whitespace, emoji, duplicates, reserved words). A Pencil-authored reference design is the canonical source; Stitch/Figma-REST/Figma-Make parity fixtures are derived from the Pencil IR at fixture-generation time. A single `PlatformSpec + DesignTokens` parity test asserts normalized deep-equal across all four adapters.

2. **MCP tool surface (MCP-01, MCP-02)** — Three new tools registered in `packages/mcp-server`: `dtc_firebase_provision`, `dtc_testflight_upload`, `dtc_get_pipeline_status`. Each takes an explicit `projectDir` argument (same contract as `dtc_run_pipeline`). Errors flow through the existing `wrapToolHandler` CliError translator (FOUND-04). Status tool returns a flat `{ runId, phases[], currentPhase, lastError }` snapshot.

3. **Manifest + user-edit preservation (MCP-03)** — New `.dtc-manifest.json` written once per run after codegen (before build). It lists every generated source file + `project.yml` with `{ path, sha256, generatedAt, phase }`. Subsequent runs compare current on-disk sha256 against the manifest; edited files are preserved by default with a yellow warning. A `--overwrite-user-edits` flag opts back into overwrite.

4. **Observability (OBS-01..03)** — A hardcoded `PRICING_USD_PER_MTOK` table in `@appifex/core` (with as-of date) drives token → USD conversion. The live terminal UI (`PipelineView`) shows tokens + USD inline on each phase row plus a run-total footer. Pipeline exit writes `.dtc-report/report.json` (canonical machine-readable) + `.dtc-report/report.md` (human rendering). On failure, `.dtc-debug/bundle-<ts>.zip` is written automatically; `--export-debug-bundle` forces the zip on green runs too.

**In scope:** DESIGN-01..04, MCP-01..02, MCP-03 (`.dtc-manifest.json`), OBS-01..03. New `packages/design/src/sanitize.ts` module. New design-parity fixture harness + round-trip test. Three new MCP tools + status shape types. `.dtc-manifest.json` read/write plus per-file sha256 guard in pipeline write sites. Hardcoded pricing table + token→USD math in `TokenBudget` (or adjacent). `PipelineView` per-phase $USD column + footer. `@appifex/report` `buildReport` extension to emit `report.json` + `report.md` under `.dtc-report/`. Debug-bundle zip writer in `packages/core` (alongside `debug-logger.ts`). CLI flags: `--overwrite-user-edits`, `--export-debug-bundle`.

**Out of scope:** `dtc_e2e_gate` MCP tool (not part of MCP-01..02; revisit only if user demand surfaces). `dtc_archive` split from `dtc_testflight_upload`. Interactive per-file overwrite prompts. 3-way merge for user-edited files. Config-driven pricing (hardcoded table only in v1). Billing-API-based live pricing. Real-time cost streaming from providers. Template-origin / dtc-version metadata in the manifest. Non-Swift+Firebase pricing accuracy (Kotlin path still renders tokens; USD may drift for non-primary paths — acceptable v1 posture). Report hosted viewer.

</domain>

<decisions>
## Implementation Decisions

### Design Adapter Parity (DESIGN-01..04)

- **D-01:** Shared sanitization lives in `packages/design/src/sanitize.ts` as a pure function `sanitizeLayerName(name: string, taken: Set<string>): string`. All four adapters (`pencil-adapter.ts`, `figma-rest-client.ts`, `figma-make-adapter.ts`, `stitch-adapter.ts`) import it and apply it at the point where raw layer names become `PlatformSpec` node identifiers. Exported from `@appifex/design` barrel. Rationale: adapter concerns stay in the adapter package; no cross-package indirection for a 20-line helper.

- **D-02:** Sanitization rules:
  1. **Whitespace / punctuation** → collapse to camelCase; strip leading non-letters.
  2. **Emoji / non-ASCII symbols** → dropped entirely (no transliteration).
  3. **Reserved words** → Swift (`class`, `func`, `struct`, `enum`, `let`, `var`, …) and Kotlin (`class`, `fun`, `val`, `var`, `object`, `interface`, …) hit a shared reserved-set; collision gets `_` suffix (`class_`, `func_`).
  4. **Duplicates within a scope** → numeric suffix `_2`, `_3`, … (caller passes `taken` set; sanitizer mutates it).
  Deterministic and safe for both SwiftUI + Kotlin codegen. No `DesignError` throws — sanitization is always productive.

- **D-03:** Parity fixture topology — **Pencil is authoritative**. A single reference `.pen` file (checked into `packages/design/__tests__/fixtures/parity/`) is the canonical source. The fixture-generation script reads the Pencil IR and derives equivalent Stitch `.zip`, Figma-REST JSON dump, and Figma-Make JSON payloads. Script is run manually when the reference design changes (not on every test run). Each adapter test reads its own derived fixture; the parity test wires all four through their respective adapters and diffs the resulting IR.

- **D-04:** Parity comparison — **normalized deep-equal on core fields**. Before diff:
  1. Sort all node/token arrays by `id`.
  2. Strip adapter-specific provenance (`raw`, `_source`, adapter-origin metadata) from both sides.
  3. Apply sanitization before comparison so pre-sanitization diffs don't register.
  Fields that must match: `screens[]`, `tokens.colors`, `tokens.typography`, `tokens.spacing`, node hierarchy, `accessibilityIdentifier` (post-sanitize). Fields explicitly ignored: adapter internal IDs, raw layer names, timestamps. Uses `vitest` `expect(...).toEqual(...)` after normalization.

### MCP Tool Surface (MCP-01, MCP-02)

- **D-05:** Three new tools only in Phase 7 — no `dtc_e2e_gate`, no archive/upload split:
  1. `dtc_firebase_provision` — runs the Phase 4 `firebase_provision` pipeline stage standalone against a pre-existing generated app.
  2. `dtc_testflight_upload` — runs the Phase 5 `xcode_archive` + `testflight_upload` stages standalone.
  3. `dtc_get_pipeline_status` — reads `.dtc/run-context.json` + `.dtc/checkpoint.db` for a project and returns a snapshot.
  Matches MCP-01/MCP-02 roadmap wording verbatim. Respects PROJECT.md Key Decisions (`MCP server maturity deferred`) — no extra polish tools in v1.

- **D-06:** `dtc_get_pipeline_status` response shape — flat JSON object:
  ```ts
  {
    runId: string
    currentPhase: PhaseId | null    // null when idle / complete
    phases: Array<{
      id: PhaseId
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
      startedAt?: string            // ISO timestamp when started
      durationMs?: number
      tokens?: number               // tokens consumed in this phase
      costUsd?: number              // OBS-01 per-phase cost
    }>
    lastError?: {
      name: string                  // e.g. 'ProvisionError'
      message: string
      phase: PhaseId
    }
  }
  ```
  Sourced from `loadRunContext()` + `Checkpoint.getPhase()` — no new persistence. Flat shape maps 1:1 to agent decision logic (resume vs restart).

- **D-07:** Tool location — every new tool takes a required `projectDir: string` input (plus tool-specific args). No ambient server-side state, no run-registry. Matches `dtc_run_pipeline` signature. `configDir?: string` is optional per existing convention.

- **D-08:** Error shape — reuse existing `wrapToolHandler` (Phase 2 FOUND-04). Errors return `{ isError: true, content: [{ type: 'text', text: '<ErrorName>: <message>' }] }`. No new structured-error JSON; CliError hierarchy already gives the class name. Keeps every new tool to a few lines of registration code.

### Manifest + User-Edit Preservation (MCP-03)

- **D-09:** `.dtc-manifest.json` schema — flat JSON array of entries:
  ```ts
  {
    manifestVersion: 1
    generatedAt: string             // ISO timestamp (run-level)
    runId: string
    entries: Array<{
      path: string                  // relative to outputDir
      sha256: string                // sha256 hex of file contents at generation
      generatedAt: string           // per-file (fix loop may re-write)
      phase: PhaseId                // phase that last wrote this file
    }>
  }
  ```
  `manifestVersion: 1` reserves a migration path. No template-origin or dtc-version fields in v1 (D-09 deferred in `<deferred>`).

- **D-10:** User-edit detection semantics — on pipeline start, if `.dtc-manifest.json` exists and a file's current sha256 differs from the manifest, treat it as user-edited. Default behavior: **skip-with-warning**:
  - Print a `chalk.yellow` warning listing all preserved paths.
  - Pipeline proceeds; the phase that would have rewritten the file logs a `skipped: user-edited` per-file event and leaves the file alone.
  - `--overwrite-user-edits` flag bypasses the skip (logs what was overwritten for traceability).
  - No interactive prompt, no 3-way merge — solo-founder "one command" posture.

- **D-11:** Manifest write point — **once per run, after codegen, before build**. Concretely: a single write site at the end of `runCodegenPhase` (or the codegen path's equivalent). Fix-loop file rewrites update the manifest entry in place (`phase: 'fix'`, refreshed `sha256`, refreshed `generatedAt`) — so the next run sees "fix-loop output" as the baseline, not an edit. Files written by later phases (`firebase_provision`, `xcode_archive`) are appended to the manifest as they're created.

- **D-12:** Manifest scope — covers every file the pipeline writes under the target project directory:
  - **Included:** `Sources/**/*.swift`, `Sources/**/*.kt`, `project.yml`, `*.entitlements`, `*.plist` (generated), `.maestro/**/*.yaml`, `security.rules`, `firestore.rules`, generated config files.
  - **Excluded:** `.dtc-*` (context, debug, report, manifest itself), `.git/**`, `node_modules/**`, `Pods/**`, `DerivedData/**`, `*.xcodeproj/**` (regenerated by xcodegen), `*.xcworkspace/**`, `GoogleService-Info.plist` (downloaded by provision; not generated — flagged separately if needed).
  Exclusion list lives alongside the manifest writer as `MANIFEST_EXCLUDE_GLOBS`.

### Observability (OBS-01..03)

- **D-13:** Pricing source — **hardcoded `PRICING_USD_PER_MTOK` table** in `packages/core/src/pricing.ts`. Authoritative values live in `07-RESEARCH.md` §"Pricing (verified 2026-04-18)"; planner implements from that table. Shape:
  ```ts
  /** Prices per 1M tokens in USD. As of 2026-04-18. Update via PR. */
  export const PRICING_USD_PER_MTOK = {
    'claude-opus-4-7':   { input: 5.00,  output: 25.00 },
    'claude-opus-4-6':   { input: 5.00,  output: 25.00 },
    'claude-opus-4-5':   { input: 5.00,  output: 25.00 },
    'claude-opus-4-1':   { input: 15.00, output: 75.00 }, // older model, old pricing
    'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
    'claude-sonnet-4-5': { input: 3.00,  output: 15.00 },
    'claude-haiku-4-5':  { input: 1.00,  output: 5.00 },  // haiku-4-5, NOT haiku-3-5
    'claude-haiku-3-5':  { input: 0.80,  output: 4.00 },
    'gpt-5':             { input: 0.625, output: 5.00 },
    'gpt-5-mini':        { input: 0.250, output: 2.00 },
    'gemini-2-5-pro':    { input: 1.25,  output: 10.00 },
    'gemini-2-5-flash':  { input: 0.30,  output: 2.50 },
  } as const
  export const PRICING_AS_OF = '2026-04-18'
  ```
  Updated via PR when pricing shifts. No config surface, no billing-API fetch. Models not in the table fall back to `null` USD (UI renders a `—` placeholder instead of `$0.00`). **Note:** Earlier draft of this decision showed Opus at `$15/$75`; research verified live rates are `$5/$25` (3× lower). Similarly, an early sketch showed `claude-haiku-4-5` at `$0.80/$4.00` — that is the `haiku-3-5` rate; `haiku-4-5` is `$1.00/$5.00` (verified in 07-RESEARCH.md). Both corrections leave the shape decision (hardcoded table + as-of stamp) unchanged.

- **D-14:** UI layout — per-phase inline + run-total footer. `PipelineView` phase row gains a `$USD` column to the right of tokens:
  ```
  ◐ codegen        42,318 tok  $0.23
  ✓ validate        8,104 tok  $0.05
  ```
  Footer line: `Total: 187,432 tok / $1.12`. Live-updating as phases consume tokens. Costs come from `TokenBudget` (extended with per-phase input/output breakdown) + the pricing table. Token breakdown needs input-vs-output separation (current `TokenBudget` only tracks total — extension required). **Token field priority (WR-02):** When a `ProgressEvent` carries both `tokensInput`/`tokensOutput` and the legacy `tokensUsed` field, `PipelineView` accumulates from `tokensInput`/`tokensOutput` only; `tokensUsed` is a fallback for events that predate the split. This prevents double-counting.

- **D-15:** `.dtc-report` shape — **JSON canonical + markdown rendering**, both written:
  - `.dtc-report/report.json` — `PipelineReport`-shaped JSON (extends current `buildReport` output). Includes: per-phase status + duration + tokens + cost, platform results, fix-loop stats, validation artifacts, error details. This is the agent/CI-facing file.
  - `.dtc-report/report.md` — human rendering via `@appifex/report/formatters.ts`. Extended to include per-phase cost and remediation hints on failures.
  - Both files are written at the end of the `report` phase. Replaces the current in-memory-only `PipelineReport` — on-disk becomes the canonical record.

- **D-16:** Debug bundle trigger — **automatic on any failed run + `--export-debug-bundle` for success**:
  - On non-zero pipeline exit, write `.dtc-debug/bundle-<ISO-ts>.zip`.
  - Bundle contents: every file under `.dtc-debug/` (logs, LLM prompts, LLM outputs, fix-loop transcripts), a copy of `.dtc/run-context.json`, a copy of `.dtc/checkpoint.db`, `.dtc-report/report.json`, and a top-level `manifest.txt` listing file provenance.
  - Secrets scrubbing: redact any file containing `apiKey`, `private_key`, `asc_key`, `service_account` patterns before zipping. Pattern list lives next to the bundler.
  - `--export-debug-bundle` CLI flag forces the bundle on success too (for bug reporting without a crash).

### Claude's Discretion

- Exact MCP tool descriptions / Zod schemas beyond the shapes in D-06/D-07 (researcher fills in).
- Name of the sanitization entry point (`sanitizeLayerName` vs `normalizeLayerName` — both acceptable).
- Per-phase cost column width in `PipelineView` vs compact formatting (e.g. `$1.23` vs `$1.2K`).
- Exact sha256 implementation (Node's `crypto.createHash('sha256')` is obvious).
- Zip library choice — `adm-zip` vs `archiver` vs `yazl`. Default to `archiver` (streaming, maintained, no native deps).
- Manifest diff output format (table vs bullet list).
- Pricing fallback display string (`—` vs `(unknown model)` vs empty).
- Whether `dtc_get_pipeline_status` supports a `verbose: true` flag for full progress-event history (optional; D-06 baseline is sufficient).

### Folded Todos

None — `gsd-tools list-todos` returned 0 pending items matching Phase 7 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap
- `.planning/ROADMAP.md` §"Phase 7: Design Parity, MCP Surface & Observability" — phase goal, 5 success criteria (covers DESIGN-04 parity, MCP tools, manifest, cost UI, debug bundle).
- `.planning/REQUIREMENTS.md` §"Design Adapter Parity", §"MCP / Agent Surface", §"Observability" — DESIGN-01..04, MCP-01..03, OBS-01..03 requirement text.
- `.planning/PROJECT.md` §"Key Decisions" — "MCP server maturity deferred" (gates D-05). §"Constraints" — no-secrets-in-generated-apps (gates D-16 scrubbing). §"Context" — design adapter parity framing.

### Prior phase contexts (carry-forward decisions)
- `.planning/phases/02-foundation-hardening/02-CONTEXT.md` FOUND-04 — `CliError` hierarchy + no `process.exit` outside `entry.ts`. D-08 reuses `wrapToolHandler` built on this foundation; new MCP tools never call `process.exit`. FOUND-02 — Swift token density (3 chars/token). D-14 cost math consumes this when converting prompt chars → tokens → USD.
- `.planning/phases/04-firebase-integration/04-CONTEXT.md` D-04 — `firebase_provision` phase handler. D-05 — idempotent checkpoint. `dtc_firebase_provision` (D-05) dispatches into this exact phase.
- `.planning/phases/05-xcode-archive-testflight-upload/05-CONTEXT.md` D-02 — `xcode_archive` + `testflight_upload` phase slots. `dtc_testflight_upload` (D-05) dispatches into these.
- `.planning/phases/06-validation-gate-hardening/06-CONTEXT.md` §Deferred — `dtc_e2e_gate` MCP tool: explicitly deferred from Phase 6; Phase 7 D-05 keeps it deferred to v2 (roadmap names only MCP-01/MCP-02).

### Codebase files Phase 7 edits or creates
#### Design parity
- `packages/design/src/sanitize.ts` — **NEW** pure module exporting `sanitizeLayerName` + reserved-word sets (D-01, D-02).
- `packages/design/src/pencil-adapter.ts` — import `sanitizeLayerName`; apply at IR-build site (D-01).
- `packages/design/src/figma-rest-client.ts` — same (D-01).
- `packages/design/src/figma-make-adapter.ts` — same (D-01).
- `packages/design/src/stitch-adapter.ts` — same (D-01).
- `packages/design/src/index.ts` — export `sanitizeLayerName` from barrel (D-01).
- `packages/design/__tests__/fixtures/parity/` — **NEW** directory: `reference.pen`, derived `stitch.zip`, `figma-rest.json`, `figma-make.json`, plus a `fixture-gen.ts` script (D-03).
- `packages/design/__tests__/adapter-parity.test.ts` — **NEW** parity test (D-04).
- Each adapter's existing test file picks up the sanitization fixture suite (whitespace/emoji/duplicates/reserved words).

#### MCP surface
- `packages/mcp-server/src/tools/provision.ts` — **NEW** `handleFirebaseProvision` (D-05, D-07).
- `packages/mcp-server/src/tools/testflight.ts` — **NEW** `handleTestflightUpload` (D-05, D-07). *(file name TBD by planner; could live in existing `pipeline.ts`.)*
- `packages/mcp-server/src/tools/status.ts` — **NEW** `handleGetPipelineStatus` returning D-06 shape.
- `packages/mcp-server/src/server-tools-pipeline.ts` — register the three new tools via `server.tool(...)` (D-05, D-08).
- `packages/mcp-server/src/server.ts` — no changes; existing `wrapToolHandler` handles D-08 error translation.

#### Manifest
- `packages/core/src/manifest.ts` — **NEW** `readManifest()`, `writeManifest()`, `diffManifest()` (D-09, D-11).
- `packages/core/src/index.ts` — export manifest API.
- `cli/src/pipeline.ts` — write manifest after codegen phase (D-11); diff manifest on pipeline start; emit warnings and enforce `--overwrite-user-edits` gate (D-10); fix-loop rewrites update manifest entries in place.
- `cli/src/cli.ts` — parse `--overwrite-user-edits` flag.
- `cli/src/entry.ts` — surface flag in help text.

#### Observability
- `packages/core/src/pricing.ts` — **NEW** `PRICING_USD_PER_MTOK` + `PRICING_AS_OF` + helper `tokensToUsd(model, inputTok, outputTok)` (D-13).
- `packages/core/src/token-budget.ts` — extend `TokenBudget` to track input vs output per phase; add `costUsd(model)` getter per phase (D-14).
- `cli/src/views/PipelineView.tsx` — add `$USD` column per phase + footer total (D-14).
- `cli/src/views/format.ts` — `formatUsd(n: number): string` helper.
- `packages/report/src/report.ts` — extend `PipelineReport` with per-phase cost fields (D-15).
- `packages/report/src/formatters.ts` — extend markdown renderer with cost column + remediation hints on failures (D-15).
- `cli/src/pipeline.ts` — write `.dtc-report/report.json` + `.dtc-report/report.md` at end of `report` phase (D-15).
- `packages/core/src/debug-bundle.ts` — **NEW** zip writer + secrets scrubber (D-16).
- `cli/src/pipeline.ts` — trigger `debug-bundle.ts` on non-zero exit and when `--export-debug-bundle` is set (D-16).
- `cli/src/cli.ts` — parse `--export-debug-bundle`.
- `cli/src/entry.ts` — surface flag in help text.

### External references (research surface)
- Anthropic pricing (current reference values) — `https://docs.anthropic.com/en/docs/about-claude/pricing` (D-13; researcher verifies model IDs + current rates at phase start).
- Node `archiver` library (streaming zip writer) — `https://www.npmjs.com/package/archiver` (D-16; confirm current version + API).
- Node `crypto.createHash('sha256')` — `https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options` (D-09 sha256).
- MCP SDK `server.tool(name, desc, schema, cb)` — `https://github.com/modelcontextprotocol/typescript-sdk` (D-05; existing `server-tools-pipeline.ts` is the precedent).
- Zod schemas for MCP tool inputs — existing `packages/mcp-server/src/server-tools-*.ts` is the in-repo precedent (D-07).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/design/src/{pencil,figma-rest,figma-make,stitch}-adapter.ts` + `-client.ts` — all four adapters exist with per-adapter tests. Phase 7 adds a shared sanitization import; adapter surface otherwise unchanged.
- `packages/core/src/debug-logger.ts` — writes plain files to `.dtc-debug/`. D-16 bundler zips that directory; `debug-logger.ts` itself needs no changes.
- `packages/core/src/checkpoint.ts::Checkpoint.getPhase()` + `run-context.ts::loadRunContext()` — `dtc_get_pipeline_status` (D-05) reads both and emits the D-06 shape.
- `packages/report/src/report.ts::buildReport()` + `formatters.ts` — `PipelineReport` already exists; `@appifex/report` renders markdown. D-15 extends both sides (JSON writer + enriched markdown).
- `packages/agent/src/types.ts::AgentResult.costUsd` — agent-run USD is already captured for Claude CLI runs; D-13 unifies USD math across direct-SDK + CLI paths.
- `packages/mcp-server/src/server.ts::wrapToolHandler` — Phase 2 CliError translator wraps every tool. D-08 reuses it for free.
- `packages/mcp-server/src/server-tools-pipeline.ts` — ~7 existing tool registrations are the precedent; new tools follow the same pattern (D-05, D-07).
- `packages/core/src/token-budget.ts::TokenBudget` — existing per-phase token tracker; D-14 extends with input/output split + `costUsd` getter consuming the D-13 pricing table.
- `cli/src/views/PipelineView.tsx` — already renders per-phase rows + total token bar. Adding a USD column is a local addition (D-14).
- `cli/src/pipeline.ts:3048 / :3271 / :3741` — three existing `.dtc-report` directory usages; D-15 extends them to write JSON + markdown to the same dir.

### Established Patterns
- ESM + `.js` relative imports; `@appifex/*` workspace aliases; `verbatimModuleSyntax`, `isolatedModules`.
- Zod schemas at the MCP tool boundary; `server.tool(name, desc, schema, cb)` shape.
- `chalk.yellow` for warnings (D-10 user-edit preservation notice), `chalk.red` for errors.
- `PhaseId` + `CheckpointData` discriminated union — extended only when adding a phase. Phase 7 adds no new `PhaseId` (all new work lands in existing phases or post-phase hooks).
- `createDebugLogger(outputDir, enabled).log(name, content)` — D-16 bundler iterates the same `.dtc-debug/` directory.
- Phase-numbered comments: `// Phase 7 (DESIGN-XX | MCP-XX | OBS-XX): ...` on non-obvious logic.
- Secrets-never-committed principle — D-16 bundle scrubber enforces it at bundle time (defense in depth vs `~/.dtc/config.json` being the only secrets home).
- **Shell-arg escaping (CR-01):** Any code that interpolates user-controlled or externally-sourced values into shell strings must sanitize with `value.replace(/'/g, "'\\''")` and wrap in single quotes. Use `printf '%s'` rather than `echo` for base64 payloads. Applied in `FigmaMakeAdapter.writeBinary`.
- **No module-level mutable state in Ink components (CR-02):** All mutable variables used inside a render function (`totalTokens`, timers, spinners, etc.) must be declared inside the function, not at module scope. Module-level state persists across `renderRunApp` calls in the same process, causing cross-run token/cost pollution. Applied in `RunApp.tsx`.

### Integration Points
- `packages/core/src/run-context.ts::PHASE_ORDER` — **no insertions**. Phase 7 adds no new `PhaseId` slots.
- `packages/core/src/types-pipeline.ts` — no `PhaseId` union changes.
- `cli/src/pipeline.ts` — three insertion points: manifest read on start + diff gate (D-10, D-11); manifest write after codegen (D-11); `.dtc-report/report.{json,md}` write at end of `report` phase (D-15); debug-bundle trigger on non-zero exit and `--export-debug-bundle` (D-16).
- `~/.dtc/config.json` — **no new fields**. Pricing is hardcoded (D-13); manifest/bundle are output-dir-local; MCP tools read existing config.
- `.dtc-report/` directory — already created on disk (existing pipeline passes `reportDir` to phase handlers); D-15 makes it the canonical write target.
- `.dtc-debug/` directory — already populated by `createDebugLogger`; D-16 adds a zip step alongside.
- `.dtc/run-context.json` + `.dtc/checkpoint.db` — `dtc_get_pipeline_status` (D-05) reads both; no write changes.

</code_context>

<specifics>
## Specific Ideas

- **Pencil is authoritative for the parity fixture** (D-03): The .pen file is the single source of truth for the reference design. Stitch/Figma-REST/Figma-Make fixtures are *derived* from the Pencil IR at fixture-gen time, not hand-authored. This avoids the "three hand-maintained fixtures silently diverge" failure mode. The derivation script is a one-shot utility that runs when the reference design changes, not on every test.
- **Sanitization is always productive** (D-02): No `DesignError` throws for bad layer names. Even `"🎉 My Button"` becomes something safe (`myButton`). The "one command" promise outranks surfaceing designer-side typos — the generated code compiles regardless of what the designer did.
- **Skip-with-warning is the default for user-edits** (D-10): The solo-founder pipeline cannot stall on an interactive prompt. Silent-skip-with-warning respects user work without breaking unattended runs. The `--overwrite-user-edits` flag is the explicit opt-in for "I know what I'm doing, blow away my changes."
- **Manifest write happens once, not per phase** (D-11): After codegen and before build — a single write site. Fix-loop mutates entries in place (same `path`, refreshed `sha256`, refreshed `generatedAt`, `phase: 'fix'`). This means a re-run after fix-loop output is not flagged as a user-edit — the baseline is the final post-fix state, not the first codegen output.
- **Hardcoded pricing with PRICING_AS_OF stamp** (D-13): Prices shift; the stamp is the honesty contract. When users see `$4.38` on a run, the `PRICING_AS_OF` date tells them how stale that number is. PR-based updates are the review surface.
- **Debug bundle scrubs secrets even though `~/.dtc/config.json` is the only secret home** (D-16): Defense in depth. Logs may transiently embed tokens from header dumps, provider error payloads, or debug traces. The scrubber redacts them at bundle time so shared bundles are publishable.
- **MCP tools are the Phase 4/5 pipeline stages, not wrappers** (D-05): Each MCP tool dispatches to the same phase handler the CLI uses. Agents get identical semantics to `dtc` — skip flags, idempotency, checkpoint-aware resume. No agent-specific code paths.
- **`dtc_get_pipeline_status` is read-only** (D-06): Never mutates run state; never advances the pipeline. Agents use it for "should I resume or restart?" planning. Mutation lives in `dtc_run_pipeline` with `mode: 'resume'`.

</specifics>

<deferred>
## Deferred Ideas

- **`dtc_e2e_gate` MCP tool** — roadmap names only MCP-01/MCP-02; `e2e_gate` stays CLI-driven in v1. Revisit if agent-driven flows need to gate their own builds. Carried forward from Phase 6 `<deferred>`.
- **Split archive/upload MCP tools** — `dtc_archive` + `dtc_testflight_upload` as separate tools (dry-run archive without upload). Not in roadmap; revisit if users want archive-only verification.
- **Config-driven pricing (`~/.dtc/config.json llm.pricing`)** — enterprise users with negotiated rates. v2 surface once hardcoded table stabilizes.
- **Billing-API-based live pricing** — fetch rates from Anthropic/OpenAI billing endpoints per run. More accurate, more network. Revisit if pricing-drift complaints surface.
- **Interactive per-file user-edit prompt** — `overwrite / preserve / diff?` per file. Contradicts "one command" promise; v2 surface if solo-founders ask for it.
- **3-way merge for user-edited files** — git-style merge of new template output and user edits. Ambitious; changes the generated-code contract. v2+.
- **Template-origin + dtc-version metadata in manifest** — `templateSource` + `dtcVersion` fields. Useful for migration but currently log-level noise. Reserve via `manifestVersion: 1`.
- **Manifest for `.xcodeproj` / `Pods` / regenerated artifacts** — regenerated every run; tracking them creates noise. Excluded in D-12.
- **`GoogleService-Info.plist` tracking** — downloaded by `firebase_provision` rather than generated. May need separate "provisioned artifact" tracking in v2.
- **Report hosted viewer** — `.dtc-report/report.md` is terminal-readable enough; no web UI in v1.
- **Real-time cost streaming from providers** — request-level cost deltas instead of phase aggregates. OBS-01 aggregates are sufficient for the "see where the budget went" v1 use case.
- **Dedicated `TokenCostView` Ink component** — keeps `PipelineView` tight; fold into D-14 inline display for v1.
- **Debug bundle on non-failure with no flag** — always-on. Eats disk + CPU on happy path. Explicit flag is the right default.
- **MCP tool discovery UX** — e.g. `dtc mcp list-tools` subcommand with descriptions. Not needed in v1; MCP SDK handles discovery via protocol.
- **`dtc_get_pipeline_status` with full progress-event history** — richer audit trail. Optional `verbose: true` flag deferred; baseline D-06 shape is enough for agent decision-making.

</deferred>

---

*Phase: 07-design-parity-mcp-surface-observability*
*Context gathered: 2026-04-18*
