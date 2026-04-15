import { describe, it, expect, vi } from 'vitest'
import { fixLoop, type FixLoopOpts } from '../src/index.js'
import { TokenBudget, BudgetExhaustedError } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

// Phase 02 Plan 02 (FOUND-02): guard at top of fixLoop must reject with
// BudgetExhaustedError BEFORE any LLM/fix call when budget < 30% of total.

function makeValidationResult(): ValidationResult {
  return {
    ui: {
      total: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          flowName: 'flow-0',
          passed: false,
          duration: 100,
          error: 'flow-0 failed',
          assertions: [],
        },
      ],
    },
    unit: {
      total: 0,
      passed: 0,
      failed: 0,
      failures: [],
    },
    allPassed: false,
  }
}

describe('fixLoop — budget guard (FOUND-02)', () => {
  it('throws BudgetExhaustedError and never calls fixFn when remaining budget is below 30% of total', async () => {
    // Prime a TokenBudget so canEnterFixLoop() returns false.
    // total=1000, used=701 → remaining=299 → 29.9% < 30%.
    const budget = new TokenBudget({ total: 1000 })
    budget.consume('codegen', 701)

    const fixFnMock = vi.fn().mockResolvedValue({ filesChanged: [], tokensUsed: 0 })
    const buildFnMock = vi.fn().mockResolvedValue({ success: true, duration: 100 })
    const validateFnMock = vi.fn().mockResolvedValue(makeValidationResult())

    const opts: FixLoopOpts = {
      fixFn: fixFnMock,
      buildFn: buildFnMock,
      validateFn: validateFnMock,
      maxAttempts: 5,
      tokenBudget: 50_000,
      budgetInstance: budget,
    }

    await expect(fixLoop(makeValidationResult(), opts)).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    )

    expect(fixFnMock).not.toHaveBeenCalled()
    expect(buildFnMock).not.toHaveBeenCalled()
    expect(validateFnMock).not.toHaveBeenCalled()
  })

  it('carries total / remaining / requiredRatio on the BudgetExhaustedError', async () => {
    const budget = new TokenBudget({ total: 1000 })
    budget.consume('codegen', 800) // remaining 200 → 20% < 30%

    const opts: FixLoopOpts = {
      fixFn: vi.fn(),
      buildFn: vi.fn(),
      validateFn: vi.fn(),
      maxAttempts: 5,
      tokenBudget: 50_000,
      budgetInstance: budget,
    }

    let caught: unknown
    try {
      await fixLoop(makeValidationResult(), opts)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(BudgetExhaustedError)
    const err = caught as BudgetExhaustedError
    expect(err.totalBudget).toBe(1000)
    expect(err.remaining).toBe(200)
    expect(err.requiredRatio).toBeCloseTo(0.3, 5)
  })

  it('enters the loop normally when budgetInstance is omitted (back-compat)', async () => {
    // No budgetInstance supplied — guard must be a no-op; fixFn MUST be called.
    const fixFnMock = vi.fn().mockResolvedValue({ filesChanged: ['x.swift'], tokensUsed: 10 })
    const buildFnMock = vi.fn().mockResolvedValue({ success: true, duration: 10 })
    // Return all_green on first validation so the loop exits quickly.
    const validateFnMock = vi.fn().mockResolvedValue({
      ui: { total: 1, passed: 1, failed: 0, results: [] },
      unit: { total: 0, passed: 0, failed: 0, failures: [] },
      allPassed: true,
    })

    const opts: FixLoopOpts = {
      fixFn: fixFnMock,
      buildFn: buildFnMock,
      validateFn: validateFnMock,
      maxAttempts: 3,
      tokenBudget: 50_000,
      // no budgetInstance
    }

    const result = await fixLoop(makeValidationResult(), opts)
    expect(result.status).toBe('all_green')
    expect(fixFnMock).toHaveBeenCalledTimes(1)
  })
})
