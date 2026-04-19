---
phase: 07-design-parity-mcp-surface-observability
plan: 2
subsystem: observability
tags: [wave-1, pricing, token-budget, tdd, green, OBS-01]
dependency_graph:
  requires:
    - 07-00 (RED stubs: pricing.test.ts, token-budget.test.ts Phase 7 block)
  provides:
    - PRICING_USD_PER_MTOK const table (12 models, verified 2026-04-18)
    - PRICING_AS_OF stamp
    - tokensToUsd(model, inputTokens, outputTokens) helper
    - KnownModel type
    - TokenBreakdown interface
    - TokenBudget.consumeBreakdown(phase, breakdown)
    - TokenBudget.phaseBreakdown(phase)
    - TokenBudget.phaseCostUsd(phase, model)
    - TokenBudget.totalCostUsd(model)
  affects:
    - packages/core/src/pricing.ts (NEW)
    - packages/core/src/token-budget.ts (extended)
    - packages/core/src/index.ts (barrel updated)
    - packages/core/__tests__/token-budget.test.ts (extended)
tech_stack:
  added: []
  patterns:
    - Hardcoded pricing table with PRICING_AS_OF honesty stamp
    - Non-breaking TokenBudget extension (parallel usageBreakdown map alongside existing usage)
    - tokensToUsd returns null for unknown models (never $0, UI renders —)
    - totalCostUsd refuses to aggregate if any phase returns null (fail-safe)
key_files:
  created:
    - packages/core/src/pricing.ts
  modified:
    - packages/core/src/token-budget.ts
    - packages/core/__tests__/token-budget.test.ts
    - packages/core/src/index.ts
decisions:
  - "Verified rates (RESEARCH A1): Opus 4.5-4.7 = $5/$25 per MTok (NOT $15/$75 shown in CONTEXT D-13 draft)"
  - "TokenBreakdown added as parallel map (usageBreakdown) — existing usage map and all callers of consume/phaseUsed/totalUsed untouched"
  - "totalCostUsd returns null if *any* phase breakdown has unknown model — no silent partial aggregation"
  - "PRICING_AS_OF = '2026-04-18' as honesty contract for stale-pricing visibility"
metrics:
  duration: ~15m
  completed_date: "2026-04-18"
  tasks_completed: 2
  files_created: 1
  files_modified: 3
---

# Phase 7 Plan 2: Pricing Table + TokenBudget Extension Summary

**One-liner:** Hardcoded `PRICING_USD_PER_MTOK` table (12 models, verified 2026-04-18) + non-breaking `TokenBudget` extension with `consumeBreakdown`, `phaseCostUsd`, and `totalCostUsd` — flips Wave 0 RED stubs GREEN.

## What Was Built

### Task 1: `packages/core/src/pricing.ts` (NEW)

```typescript
export const PRICING_USD_PER_MTOK = {
  'claude-opus-4-7':   { input: 5.00,  output: 25.00 },
  'claude-opus-4-6':   { input: 5.00,  output: 25.00 },
  'claude-opus-4-5':   { input: 5.00,  output: 25.00 },
  'claude-opus-4-1':   { input: 15.00, output: 75.00 }, // older model, still at old pricing
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 1.00,  output: 5.00 },
  'claude-haiku-3-5':  { input: 0.80,  output: 4.00 },
  'gpt-5':             { input: 0.625, output: 5.00 },
  'gpt-5-mini':        { input: 0.250, output: 2.00 },
  'gemini-2-5-pro':    { input: 1.25,  output: 10.00 },
  'gemini-2-5-flash':  { input: 0.30,  output: 2.50 },
} as const
export const PRICING_AS_OF = '2026-04-18'
export type KnownModel = keyof typeof PRICING_USD_PER_MTOK
export function tokensToUsd(model, inputTokens, outputTokens): number | null
```

**CONTEXT D-13 correction (Assumption A1):** The earlier context draft showed Opus 4.6/4.7 at `$15/$75`. Research (`07-RESEARCH.md §Assumptions Log A1`) confirmed live rates are `$5/$25` per MTok (3× lower). This module uses the verified values.

### Task 2: `packages/core/src/token-budget.ts` (EXTENDED)

New interface and four methods added. Existing `consume()`, `phaseUsed()`, `totalUsed`, `canConsume*()`, `canEnterFixLoop()`, and `summary()` are untouched.

```typescript
export interface TokenBreakdown { input: number; output: number }

// Inside TokenBudget class:
consumeBreakdown(phase: PhaseId, breakdown: TokenBreakdown): void
phaseBreakdown(phase: PhaseId): TokenBreakdown         // zeros for unused phases
phaseCostUsd(phase: PhaseId, model: string): number | null
totalCostUsd(model: string): number | null
```

Key invariants:
- `consumeBreakdown` calls `consume(phase, input + output)` internally — the existing `phaseUsed()` total stays correct
- `totalCostUsd` returns `null` if *any* phase has an unknown model — no silent partial aggregation

### Barrel (`packages/core/src/index.ts`)

Added exports:
- `PRICING_USD_PER_MTOK`, `PRICING_AS_OF`, `tokensToUsd` (values)
- `KnownModel`, `TokenBreakdown` (types)

## Test Coverage Delta

| File | Before | After | New tests |
|------|--------|-------|-----------|
| `packages/core/__tests__/pricing.test.ts` | 13 RED | 13 GREEN | 0 (Wave 0 stubs) |
| `packages/core/__tests__/token-budget.test.ts` | 10 GREEN | 18 GREEN | +8 Phase 7 cases |

Total: 31/31 tests pass.

## Deviations from Plan

None — plan executed exactly as written. The Wave 0 test stubs (from 07-00) were already the correct RED anchors; this plan flipped them GREEN with exact implementations matching the plan's `<action>` blocks.

## Known Stubs

None — all implemented functionality is fully wired. `tokensToUsd` returns live values from the table; `TokenBudget` cost methods delegate correctly. No placeholder data flows to any consumer.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface introduced. Pricing table is hardcoded (no network fetch). Cost data stays local to in-memory `TokenBudget` instance.

T-07-02-01 mitigation: `PRICING_AS_OF = '2026-04-18'` stamp is present and visible in every cost readout, making pricing staleness observable.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `packages/core/src/pricing.ts` exists | FOUND |
| `grep 'claude-opus-4-7'` in pricing.ts | FOUND |
| `grep "input: 5.00,  output: 25.00"` in pricing.ts | FOUND |
| `grep "input: 3.00,  output: 15.00"` in pricing.ts | FOUND |
| `grep "input: 1.00,  output: 5.00"` in pricing.ts | FOUND |
| `grep "PRICING_AS_OF = '2026-04-18'"` in pricing.ts | FOUND |
| `grep "tokensToUsd"` in index.ts | FOUND |
| `grep "consumeBreakdown"` in token-budget.ts | FOUND |
| `grep "TokenBreakdown"` in token-budget.ts | FOUND |
| Commit `abd4834` (Task 1) | FOUND |
| Commit `392550a` (Task 2) | FOUND |
| 31/31 tests GREEN | VERIFIED |
