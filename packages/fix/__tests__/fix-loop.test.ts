import { describe, it, expect, vi } from 'vitest'
import { fixLoop, type FixLoopOpts } from '../src/index.js'
import type { FixResult, FixAttempt } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

function makeValidationResult(
  uiPassed: number,
  uiTotal: number,
  unitPassed: number,
  unitTotal: number,
): ValidationResult {
  return {
    ui: {
      total: uiTotal,
      passed: uiPassed,
      failed: uiTotal - uiPassed,
      results: Array.from({ length: uiTotal }, (_, i) => ({
        flowName: `flow-${i}`,
        passed: i < uiPassed,
        duration: 100,
        error: i >= uiPassed ? `flow-${i} failed` : undefined,
        assertions: [],
      })),
    },
    unit: {
      total: unitTotal,
      passed: unitPassed,
      failed: unitTotal - unitPassed,
      failures: Array.from({ length: unitTotal - unitPassed }, (_, i) => ({
        testName: `test-${i}`,
        suiteName: 'suite',
        error: `test-${i} failed`,
      })),
    },
    allPassed: uiPassed === uiTotal && unitPassed === unitTotal,
  }
}

function makeOpts(overrides: Partial<FixLoopOpts> = {}): FixLoopOpts {
  return {
    fixFn: vi.fn().mockResolvedValue({ filesChanged: ['fix.ts'], tokensUsed: 1000 }),
    buildFn: vi.fn().mockResolvedValue({ success: true, duration: 1000 }),
    validateFn: vi.fn().mockResolvedValue(makeValidationResult(5, 5, 12, 12)),
    maxAttempts: 5,
    tokenBudget: 50_000,
    ...overrides,
  }
}

describe('fixLoop', () => {
  it('returns all_green when validation passes on first attempt', async () => {
    const opts = makeOpts({
      validateFn: vi.fn().mockResolvedValue(makeValidationResult(5, 5, 12, 12)),
    })

    const result = await fixLoop(makeValidationResult(4, 5, 11, 12), opts)

    expect(result.status).toBe('all_green')
    expect(result.attempts).toHaveLength(1)
    expect(result.totalTokensUsed).toBeGreaterThan(0)
  })

  it('retries until all tests pass', async () => {
    const validateFn = vi
      .fn()
      .mockResolvedValueOnce(makeValidationResult(4, 5, 11, 12)) // attempt 1: still failing
      .mockResolvedValueOnce(makeValidationResult(5, 5, 12, 12)) // attempt 2: all green

    const result = await fixLoop(makeValidationResult(3, 5, 10, 12), makeOpts({ validateFn }))

    expect(result.status).toBe('all_green')
    expect(result.attempts).toHaveLength(2)
  })

  it('stops after maxAttempts', async () => {
    // Each attempt makes a tiny bit of progress but never reaches all_green
    const validateFn = vi
      .fn()
      .mockResolvedValueOnce(makeValidationResult(4, 5, 10, 12)) // +1 ui pass
      .mockResolvedValueOnce(makeValidationResult(4, 5, 11, 12)) // +1 unit pass
      .mockResolvedValueOnce(makeValidationResult(5, 5, 11, 12)) // +1 ui pass, still 1 unit fail
    const opts = makeOpts({ maxAttempts: 3, validateFn })

    const result = await fixLoop(makeValidationResult(3, 5, 10, 12), opts)

    expect(result.status).toBe('stuck')
    expect(result.attempts).toHaveLength(3)
    expect(result.circuitBreakReason).toBe('max_attempts')
    expect(result.recommendation).toBeDefined()
  })

  it('stops when same error repeats 3 times', async () => {
    const stableFailure = makeValidationResult(4, 5, 12, 12)
    const opts = makeOpts({
      maxAttempts: 10,
      validateFn: vi.fn().mockResolvedValue(stableFailure),
    })

    const result = await fixLoop(stableFailure, opts)

    expect(result.status).toBe('stuck')
    expect(result.circuitBreakReason).toBe('same_error_repeated')
    expect(result.attempts.length).toBeLessThanOrEqual(3)
  })

  it('stops when no progress after 2 attempts', async () => {
    const noProgress = makeValidationResult(3, 5, 10, 12)
    const opts = makeOpts({
      maxAttempts: 10,
      // Each validation returns EXACTLY the same pass counts — no improvement
      validateFn: vi.fn().mockResolvedValue(noProgress),
    })

    // Initial failure has different error signatures to avoid same_error_repeated
    const initial = makeValidationResult(3, 5, 10, 12)
    // Override errors to be unique per attempt
    let callCount = 0
    opts.validateFn = vi.fn().mockImplementation(() => {
      callCount++
      const r = makeValidationResult(3, 5, 10, 12)
      // Make error messages unique so same_error_repeated doesn't trigger first
      r.ui.results = r.ui.results.map((f, i) => ({
        ...f,
        error: f.error ? `${f.error}-v${callCount}` : undefined,
      }))
      r.unit.failures = r.unit.failures.map((f, i) => ({ ...f, error: `${f.error}-v${callCount}` }))
      return r
    })

    const result = await fixLoop(initial, opts)

    expect(result.status).toBe('stuck')
    expect(result.circuitBreakReason).toBe('no_progress')
  })

  it('rolls back and stops when fix makes things worse', async () => {
    const validateFn = vi.fn().mockResolvedValueOnce(makeValidationResult(2, 5, 8, 12)) // worse than initial

    const initial = makeValidationResult(3, 5, 10, 12)
    const result = await fixLoop(initial, makeOpts({ validateFn }))

    expect(result.status).toBe('stuck')
    expect(result.circuitBreakReason).toBe('regression')
    expect(result.rollbackApplied).toBe(true)
  })

  it('stops when token budget is exceeded', async () => {
    const opts = makeOpts({
      tokenBudget: 500, // very small
      fixFn: vi.fn().mockResolvedValue({ filesChanged: ['f.ts'], tokensUsed: 1000 }),
      validateFn: vi.fn().mockResolvedValue(makeValidationResult(4, 5, 11, 12)),
    })

    const result = await fixLoop(makeValidationResult(3, 5, 10, 12), opts)

    expect(result.status).toBe('budget_exceeded')
    expect(result.circuitBreakReason).toBe('budget_exceeded')
  })

  it('provides recommendation on circuit break', async () => {
    const opts = makeOpts({
      maxAttempts: 1,
      validateFn: vi.fn().mockResolvedValue(makeValidationResult(4, 5, 11, 12)),
    })

    const result = await fixLoop(makeValidationResult(3, 5, 10, 12), opts)

    expect(result.recommendation).toBeDefined()
    expect([
      'manual_fix',
      'simplify_design',
      'relax_tests',
      'split_and_retry',
      'add_budget',
    ]).toContain(result.recommendation)
  })
})
