---
phase: 06-validation-gate-hardening
plan: 05
subsystem: testing
tags: [anthropic-sdk, tool-use, structured-outputs, ranker, fix-loop, path-traversal-guard, swiftui]

# Dependency graph
requires:
  - phase: 06-validation-gate-hardening
    provides: rankFixContext (Plan 06-02), structured-outputs-fixture.test.ts Wave-0 RED (Plan 06-01)
provides:
  - Anthropic tool-use (structured outputs) fix-response parser in default-fix.ts
  - Ranker-driven context selection replacing first-10-glob + type-grep fallback
  - Path-traversal guard on tool-use fix.path (ALLOWED_PREFIXES whitelist + absolute/`..` rejection)
  - D-13 empty-fix envelope when tool_use block missing (circuit-breaker friendly)
  - GATE-02 fixture-mode compat preserved (text-only fixtures → empty-fix envelope)
  - Advisory ranker hint block prepended to Claude CLI prompt (claude-cli-fix.ts)
  - @anthropic-ai/sdk ^0.90.0 across fix, codegen, baas, cli (single lockfile resolution)
affects: [06-06 e2e-gate integration, 06-07 validation wiring, future SDK consumers]

# Tech tracking
tech-stack:
  added:
    - "@anthropic-ai/sdk ^0.90.0 (upgraded from ^0.52.0)"
    - "@appifex/analysis dependency added to @appifex/fix package"
  patterns:
    - "Anthropic tool-use (structured outputs) via tools[] + tool_choice: { type: 'tool', name } forcing schema-valid output"
    - "Path-traversal guard on LLM-provided paths: ALLOWED_PREFIXES whitelist + `..` rejection + absolute-path rejection"
    - "Advisory ranker hint computed BEFORE prompt assembly with its own try/catch (failure does not break shell-out)"
    - "Optional-field extension pattern (opts.platform ?? 'swiftui') for zero-blast-radius interface widening"

key-files:
  created: []
  modified:
    - packages/fix/src/default-fix.ts (rewrite — tool-use + ranker + path guard + D-12 deletions)
    - packages/fix/src/claude-cli-fix.ts (ranker hint prepended to prompt)
    - packages/fix/__tests__/default-fix.test.ts (migrated from delimiter to tool-use contract)
    - packages/fix/package.json (SDK bump + @appifex/analysis dep)
    - packages/codegen/package.json (SDK bump)
    - packages/baas/package.json (SDK bump)
    - cli/package.json (SDK bump — lockfile single-resolution)
    - pnpm-lock.yaml (single resolution @anthropic-ai/sdk@0.90.0)

key-decisions:
  - "Fixture-compat via Option A — packages/core/src/llm-fixture.ts NOT modified. Text-only fixture content naturally falls through to the D-13 empty-fix path under the new tool-use parser, producing { filesChanged: [], tokensUsed: 0 } — exactly what GATE-02 expects."
  - "Public CreateMessageFn accepts a structurally-permissive FixResponseContent shape (type: string, optional text/id/name/input) so pipeline.ts's existing buildCreateMessageFn (which returns the legacy { type: string; text: string } shape) keeps compiling without edits. Runtime narrowing via `c.type === 'tool_use' && c.name === 'submit_fixes'` guards the parser."
  - "Bumped cli/package.json to ^0.90.0 as Rule 3 scope extension (the plan listed 3 packages but lockfile single-resolution required all 4 consumers aligned)."
  - "Added @appifex/analysis as @appifex/fix dependency (Rule 3) — required for the rankFixContext import introduced by this plan."

patterns-established:
  - "Structured outputs via tool_use: register a tool with input_schema (JSON Schema) + force tool_choice to that tool name — parser reads content[].type === 'tool_use' + name === '<tool>'"
  - "Empty-fix envelope as circuit-breaker signal: { filesChanged: [], tokensUsed } when no tool_use block found — fix-loop.ts handles repeated empty envelopes via same_error_repeated and no_progress breakers"
  - "Path-traversal guard for LLM-provided file paths: relative-only + no `..` + whitelisted prefix (Sources/, src/, __tests__/, .maestro/) — silent skip, no throw"
  - "Advisory-hint pattern with own try/catch: computed BEFORE the prompt const, never mutates the prompt const, assembled into a separate finalPrompt const for bisection"

requirements-completed: [VAL-02, VAL-03]

# Metrics
duration: 10min
completed: 2026-04-18
---

# Phase 06 Plan 05: Tool-use fix parser + ranker + path guard

**Anthropic tool-use (`submit_fixes` schema) replaces `===FIX:===` delimiter parser; rankFixContext replaces first-10-glob fallback; path-traversal guard on tool-use input; ranker hint prepended to Claude CLI prompt.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-18T05:50:35Z
- **Completed:** 2026-04-18T06:00:27Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `createDefaultFixFn` now sends `tools: [SUBMIT_FIXES_TOOL]` + `tool_choice: { type: 'tool', name: 'submit_fixes' }` and parses `content[].type === 'tool_use'` + `name === 'submit_fixes'` — the legacy `===FIX:===` delimiter regex and the JSON-extraction fallback are DELETED (D-12)
- `createDefaultFixFn` consumes `rankFixContext` from `@appifex/analysis` for context selection — the first-10-glob fallback and the `errorTypeNames` type-grep loop are DELETED
- Path-traversal guard: each `fix.path` must be relative, `..`-free, and start with one of `Sources/`, `src/`, `__tests__/`, `.maestro/` — rejected entries are silently skipped (no write, no throw)
- D-13 fallback: missing `tool_use` block or empty `fixes[]` returns `{ filesChanged: [], tokensUsed }` — circuit breakers in `fix-loop.ts` handle repeats
- GATE-02 fixture-mode compat preserved verbatim — `if (isFixtureMode()) return loadFixture('fix')` unchanged; text-only fixtures cleanly produce the D-13 empty-fix envelope
- `DefaultFixOpts` + `ClaudeCliFixOpts` gain three OPTIONAL fields (`modifiedScreens?`, `tokenBudget?`, `platform?`) with sane fallbacks — all four existing `createDefaultFixFn` call sites in `cli/src/pipeline.ts` (lines 2982, 3340, 3398, 3477) compile unchanged
- `@anthropic-ai/sdk` bumped to `^0.90.0` across `packages/fix`, `packages/codegen`, `packages/baas`, and `cli` — `pnpm-lock.yaml` resolves to a single `0.90.0` entry
- `claude-cli-fix.ts` prepends a ranker-driven `## Files likely relevant to this fix` block to a new `finalPrompt` const; the shell-out writes `finalPrompt` via stdin; the original `prompt` const is unchanged; ranker-failure is advisory (try/catch, `rankerHint = ''`)
- Wave 0 RED test `packages/fix/__tests__/structured-outputs-fixture.test.ts` transitions from RED to GREEN (both Test 1 GATE-02 compat + Test 2 D-11 tool-use shape)
- Zero regressions: 30/30 fix+ranker tests GREEN; 1508/1508 total workspace tests GREEN (the only failing test — `validate/e2e-gate.test.ts` — is a pre-existing Wave 0 RED for Plan 06-06, out of this plan's scope)

## Before/After Diff Summary (`default-fix.ts`)

- **Old:** 304 lines with `extractJson` helper, `===FIX:===` delimiter regex, JSON fallback block, `errorTypeNames` type-grep loop, first-10-glob `.slice(0, 10)` fallback, full Set-building block (lines 172-218)
- **New:** 309 lines (+5 net) — tool-use parser + `SUBMIT_FIXES_TOOL` constant + ranker call + path-traversal guard + D-13 fallback
- **Deletions (D-12):** `extractJson` helper, `===FIX:===` delimiter loop, JSON-extract fallback, legacy `buildFixPromptJson` helper
- **Deletions (D-07):** `errorTypeNames` type-grep loop, `allSwift`/`allSrc` glob-10 fallback, per-file type-name scan
- **Additions:** `SUBMIT_FIXES_TOOL` module constant, `FixResponseContent` permissive type, ranker block (scanProject + buildNavGraph + rankFixContext), N=0 early-exit, `ALLOWED_PREFIXES` whitelist, path-guard loop

## Tool Definition Excerpt (`SUBMIT_FIXES_TOOL`)

```typescript
const SUBMIT_FIXES_TOOL = {
  name: 'submit_fixes',
  description:
    'Submit a list of files to overwrite with fixed content. Each entry must include the ' +
    'full relative path (Sources/... or src/...) and the COMPLETE fixed file content. Only ' +
    'include files that actually need changes. Do not include reasoning or commentary.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fixes: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            path: { type: 'string' as const, description: 'Full relative file path...' },
            content: { type: 'string' as const, description: 'Complete fixed file content...' },
          },
          required: ['path', 'content'],
        },
      },
    },
    required: ['fixes'],
  },
} as const
```

Called via:
```typescript
const response = await createMessage({
  model, max_tokens: 16384, messages: [{ role: 'user', content: fixPromptText }],
  tools: [SUBMIT_FIXES_TOOL],
  tool_choice: { type: 'tool', name: 'submit_fixes' },
})
```

Parsed via:
```typescript
const toolUse = response.content.find(
  (c) => c.type === 'tool_use' && c.name === 'submit_fixes',
)
if (!toolUse) return { filesChanged: [], tokensUsed }  // D-13
const toolInput = toolUse.input as { fixes?: Array<{ path: string; content: string }> }
const fixes = Array.isArray(toolInput.fixes) ? toolInput.fixes : []
```

## Path-Guard Implementation

```typescript
const ALLOWED_PREFIXES = ['Sources/', 'src/', '__tests__/', '.maestro/'] as const
for (const fix of fixes) {
  if (typeof fix.path !== 'string' || typeof fix.content !== 'string') continue
  if (fix.path.includes('..') || fix.path.startsWith('/')) continue
  if (!ALLOWED_PREFIXES.some((p) => fix.path.startsWith(p))) continue
  const fullPath = `${opts.projectDir}/${fix.path}`
  await opts.runner.writeFile(fullPath, fix.content)
  filesChanged.push(fullPath)
}
```

Mitigations applied:
- **T-6-05-a (Tampering — path-traversal):** absolute-path rejection (`startsWith('/')`) + `..`-segment rejection + prefix whitelist → silent skip
- **T-6-05-d (DoS — 10k-entry array):** `max_tokens: 16384` bounds response size; invalid entries rejected by guard before write

## Fixture-Compat Confirmation

**`packages/core/src/llm-fixture.ts` was NOT modified (Option A).** Analysis:

- Current `FixtureResponse.content` type is `Array<{ type: string; text: string }>` — the validator at `llm-fixture.ts:60` only checks `Array.isArray(p.content)` and `p.usage` presence; no per-item narrowing
- Current `fixtures/tiny-mock/llm-fixtures/fix.json` holds `{ type: 'text', text: '...' }` entries
- Under the new tool-use parser a text-only fixture produces NO `tool_use` block → D-13 empty-fix path returns `{ filesChanged: [], tokensUsed: 0 }` — exactly what GATE-02 expects

GATE-02 smoke verified: `DTC_LLM_MODE=fixture pnpm vitest run packages/fix/__tests__/structured-outputs-fixture.test.ts` → 2/2 GREEN.

## `claude-cli-fix.ts` Diff

- **Line 2-3:** Import `ModifiedScreens`, `Platform`, `TokenBudget` from `@appifex/core` + `rankFixContext`/`scanProject`/`buildNavGraph` from `@appifex/analysis`
- **Line 14-18:** `ClaudeCliFixOpts` gains three OPTIONAL fields (`modifiedScreens?`, `tokenBudget?`, `platform?`)
- **Line 72-106:** `rankerHint` block computed BEFORE the `prompt` const — wrapped in its own try/catch so ranker failure leaves `rankerHint = ''` and shell-out still runs
- **Line 123:** `const finalPrompt = rankerHint + prompt` — new separate const; `prompt` stays `const` and immutable (bisection-friendly)
- **Line 145:** `Buffer.byteLength(finalPrompt, 'utf8')` — EPIPE error reporting reflects actual size sent
- **Line 178:** `child.stdin.write(finalPrompt)` — shell-out uses the final prompt (hint + original)
- **Ordering verified:** `rankerHint` declaration at line 75, `child.stdin.write(finalPrompt)` at line 178 → 75 < 178 ✓

## SDK Bump Confirmation

- `packages/fix/package.json`: `@anthropic-ai/sdk` `^0.52.0` → `^0.90.0` (+ `@appifex/analysis` workspace dep added)
- `packages/codegen/package.json`: `^0.52.0` → `^0.90.0`
- `packages/baas/package.json`: `^0.52.0` → `^0.90.0`
- `cli/package.json`: `^0.52.0` → `^0.90.0` (Rule 3 extension — required for pnpm-lock single resolution)
- `pnpm-lock.yaml`: single resolution `@anthropic-ai/sdk@0.90.0` across workspace (verified: `grep "'@anthropic-ai/sdk@" pnpm-lock.yaml | sort -u` → only `0.90.0` entries)

## Wave 0 Test Transitions

- `packages/fix/__tests__/structured-outputs-fixture.test.ts`: RED → GREEN (2/2)
  - Test 1 (GATE-02 compat): fixture-mode tool-use parser returns `{ filesChanged: [], tokensUsed: 0 }` ✓
  - Test 2 (D-11 NEW parser): `tool_use.input.fixes` read and `['/proj/Sources/X.swift']` written ✓
- `packages/analysis/__tests__/fix-context-ranker.test.ts`: GREEN → GREEN (11/11) — no regression
- `packages/fix/__tests__/default-fix.test.ts`: migrated from delimiter contract to tool-use contract — 2/2 GREEN
- All other fix tests (fix-loop, fix-loop-baas, fix-loop-budget-guard, claude-cli-fix-epipe): 15/15 GREEN (no regression)

## Task Commits

1. **Task 1: SDK bump** - `d688e09` (chore)
2. **Task 2: Rewrite default-fix.ts** - `7a03b4e` (feat)
3. **Task 3: Ranker hint in claude-cli-fix.ts** - `664c6a2` (feat)

**Plan metadata:** (final SUMMARY commit — this commit)

## Files Created/Modified

- `packages/fix/src/default-fix.ts` — Full rewrite: tool-use parser, ranker context selection, path-traversal guard, D-12 deletions, D-13 empty-fix fallback, OPTIONAL new fields
- `packages/fix/src/claude-cli-fix.ts` — Added ranker hint computation + `finalPrompt` const + stdin-write substitution + payloadBytes update
- `packages/fix/__tests__/default-fix.test.ts` — Migrated test cases from delimiter contract to tool-use contract (2 tests)
- `packages/fix/package.json` — SDK bump + `@appifex/analysis` dep added
- `packages/codegen/package.json` — SDK bump
- `packages/baas/package.json` — SDK bump
- `cli/package.json` — SDK bump (lockfile alignment)
- `pnpm-lock.yaml` — single resolution to `@anthropic-ai/sdk@0.90.0`

## Decisions Made

- **Option A for fixture compat:** Did NOT modify `packages/core/src/llm-fixture.ts`. Text-only fixture content naturally falls through to D-13 empty-fix path, producing `{ filesChanged: [], tokensUsed: 0 }` — matches GATE-02's existing contract. Widening `FixtureResponse` would have been unnecessary complexity.
- **Permissive `FixResponseContent` type:** Preferred a structurally-permissive content-block shape (`{ type: string; text?: string; id?: string; name?: string; input?: unknown }`) over a strict discriminated union because `cli/src/pipeline.ts` provides a legacy text-only `createMessage` fn that needs to keep compiling without edits. Runtime narrowing via `c.type === 'tool_use' && c.name === 'submit_fixes'` handles the parser safely.
- **Preferred option (b) for `finalPrompt`:** Introduced a separate `const finalPrompt = rankerHint + prompt` rather than mutating `prompt` to a `let`. Cleaner bisection if the hint misbehaves.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bumped `cli/package.json` to `^0.90.0` for pnpm-lock single resolution**
- **Found during:** Task 1 (SDK bump) — first `pnpm install` showed `pnpm-lock.yaml` still resolving `@anthropic-ai/sdk@0.52.0` (for `cli`) alongside `0.90.0` (for fix/codegen/baas)
- **Issue:** The plan listed three consuming packages (fix, codegen, baas) but `cli/package.json` also depends on `@anthropic-ai/sdk` (line 48). Leaving it at `^0.52.0` resulted in a dual-resolution lockfile, which violates the plan's truth "pnpm-lock.yaml single-resolution."
- **Fix:** Bumped `cli/package.json` `@anthropic-ai/sdk` from `^0.52.0` to `^0.90.0` in the same commit as the other three. Re-ran `pnpm install` — lockfile now resolves to a single `0.90.0` entry.
- **Files modified:** `cli/package.json`, `pnpm-lock.yaml`
- **Verification:** `grep "'@anthropic-ai/sdk@" pnpm-lock.yaml | sort -u` → only `0.90.0` entries; `pnpm --filter @appifex/cli run build` passes
- **Committed in:** `d688e09` (Task 1 commit)

**2. [Rule 3 - Blocking] Added `@appifex/analysis` to `@appifex/fix` dependencies**
- **Found during:** Task 2 (default-fix rewrite) — first `pnpm --filter @appifex/fix run build` after editing `default-fix.ts` failed with `TS2307: Cannot find module '@appifex/analysis'`
- **Issue:** The plan's Task 2 requires importing `rankFixContext`, `scanProject`, `buildNavGraph` from `@appifex/analysis` but `packages/fix/package.json` did not declare the dep. Without it, TypeScript cannot resolve the imports.
- **Fix:** Added `"@appifex/analysis": "workspace:*"` to `packages/fix/package.json` dependencies. Ran `pnpm install` to update the workspace graph. Verified no cyclic dependency (`@appifex/analysis` does not depend on `@appifex/fix`).
- **Files modified:** `packages/fix/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @appifex/fix run build` passes; full `pnpm build` passes
- **Committed in:** `7a03b4e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking issues for dependency correctness)
**Impact on plan:** Both deviations are correctness prerequisites — the plan's explicit goals (single-resolution lockfile + ranker import) could not be met without them. No scope creep; no new functionality added beyond the plan's explicit truths.

## Issues Encountered

- **Type incompatibility between pipeline.ts's `createMessage` and the new strict union:** First pass of `default-fix.ts` used a strict discriminated union `{ type: 'text'; text: string } | { type: 'tool_use'; ... }` for `FixResponseContent`. This broke `cli/src/pipeline.ts`'s build because `buildCreateMessageFn` returns `{ type: string; text: string }[]` (legacy shape). **Resolved** by using a permissive shape (`{ type: string; text?: string; id?: string; name?: string; input?: unknown }`) — preserves non-breaking API contract while still letting the parser narrow at runtime via `c.type === 'tool_use' && c.name === 'submit_fixes'`.
- **`default-fix.test.ts` asserted on the old delimiter parsing contract:** The plan anticipated this ("NOTE: if some existing tests assert on the delimiter path, update them IN THIS TASK"). Migrated both tests to the tool-use shape in the same commit as the production code rewrite.

## User Setup Required

None — no external service configuration required. The SDK bump is transparent to API key consumers; `~/.dtc/config.json` remains unchanged.

## Next Phase Readiness

- **Plan 06-06 (e2e-gate integration):** Sibling parallel agent. No dependency on Plan 05's outputs beyond the SDK bump.
- **Plan 06-07 (validation wiring):** Depends on Plan 05 for the tool-use parser being in place when the e2e-gate pipeline wires in validation. The D-13 empty-fix envelope is the contract Plan 07's circuit-breaker logic will rely on.
- **Future pipeline.ts enhancement:** The three new OPTIONAL fields (`modifiedScreens`, `tokenBudget`, `platform`) are in place but not yet wired by the four `cli/src/pipeline.ts` call sites. A follow-up Phase 6 or Phase 7 plan can populate them — currently they default to sane values (swiftui / empty / Infinity) inside `createDefaultFixFn`.

## Threat Flags

None — no new security surface introduced beyond what the plan's `<threat_model>` anticipated. All threats (T-6-05-a through T-6-05-f) remain as assessed; mitigations (path guard, single-resolution lockfile) are applied per plan.

## Self-Check: PASSED

Verification performed:
- File `packages/fix/src/default-fix.ts` exists and contains `rankFixContext`, `SUBMIT_FIXES_TOOL`, `tool_choice`, `ALLOWED_PREFIXES`, `isFixtureMode()` short-circuit — all confirmed via grep
- File `packages/fix/src/claude-cli-fix.ts` exists and contains `rankFixContext`, `finalPrompt`, `child.stdin.write(finalPrompt)`, `Buffer.byteLength(finalPrompt` — all confirmed via grep
- Commit `d688e09` (Task 1) exists: `git log --oneline 408f8f2..HEAD` → `d688e09 chore(06-05): bump @anthropic-ai/sdk to ^0.90.0 (D-14)`
- Commit `7a03b4e` (Task 2) exists: `git log --oneline 408f8f2..HEAD` → `7a03b4e feat(06-05): rewrite default-fix.ts with tool-use + ranker + path guard (VAL-02, VAL-03)`
- Commit `664c6a2` (Task 3) exists: `git log --oneline 408f8f2..HEAD` → `664c6a2 feat(06-05): prepend ranker hint to Claude CLI prompt (VAL-02 D-10)`

---
*Phase: 06-validation-gate-hardening*
*Completed: 2026-04-18*
