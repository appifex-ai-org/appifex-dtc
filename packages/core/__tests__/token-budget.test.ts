import { describe, it, expect } from 'vitest'
import { TokenBudget } from '../src/token-budget.js'

describe('TokenBudget', () => {
  it('tracks total usage across phases', () => {
    const budget = new TokenBudget({ total: 100_000 })

    budget.consume('design', 5_000)
    budget.consume('codegen', 10_000)

    expect(budget.totalUsed).toBe(15_000)
    expect(budget.totalRemaining).toBe(85_000)
  })

  it('tracks per-phase usage', () => {
    const budget = new TokenBudget({ total: 100_000 })

    budget.consume('design', 3_000)
    budget.consume('design', 2_000)
    budget.consume('codegen', 10_000)

    expect(budget.phaseUsed('design')).toBe(5_000)
    expect(budget.phaseUsed('codegen')).toBe(10_000)
    expect(budget.phaseUsed('build')).toBe(0)
  })

  it('enforces total budget limit', () => {
    const budget = new TokenBudget({ total: 10_000 })

    budget.consume('codegen', 9_000)

    expect(budget.canConsume(1_000)).toBe(true)
    expect(budget.canConsume(1_001)).toBe(false)
  })

  it('enforces per-phase limits when configured', () => {
    const budget = new TokenBudget({
      total: 100_000,
      perPhase: { design: 10_000, codegen: 35_000 },
    })

    budget.consume('design', 9_000)

    expect(budget.canConsumePhase('design', 1_000)).toBe(true)
    expect(budget.canConsumePhase('design', 1_001)).toBe(false)
    // Phase without limit: only total budget matters
    expect(budget.canConsumePhase('build', 50_000)).toBe(true)
  })

  // Phase 02 Plan 02 (FOUND-02): public get total() getter
  it('exposes the constructor-supplied budget total via public get total()', () => {
    const budget = new TokenBudget({ total: 1000 })
    expect(budget.total).toBe(1000)
  })

  // Phase 02 Plan 02 (FOUND-02): canEnterFixLoop — 30% reserve threshold
  describe('canEnterFixLoop', () => {
    it('returns true with full budget remaining (ratio 1.0)', () => {
      const budget = new TokenBudget({ total: 1000 })
      expect(budget.canEnterFixLoop()).toBe(true)
    })

    it('returns true exactly at the 30% threshold (remaining 300 of 1000)', () => {
      const budget = new TokenBudget({ total: 1000 })
      budget.consume('codegen', 700)
      expect(budget.totalRemaining).toBe(300)
      expect(budget.canEnterFixLoop()).toBe(true)
    })

    it('returns false just below the 30% threshold (remaining 299 of 1000)', () => {
      const budget = new TokenBudget({ total: 1000 })
      budget.consume('codegen', 701)
      expect(budget.totalRemaining).toBe(299)
      expect(budget.canEnterFixLoop()).toBe(false)
    })

    it('returns false when the budget is fully consumed', () => {
      const budget = new TokenBudget({ total: 1000 })
      budget.consume('codegen', 1000)
      expect(budget.totalRemaining).toBe(0)
      expect(budget.canEnterFixLoop()).toBe(false)
    })
  })

  it('returns a usage summary', () => {
    const budget = new TokenBudget({ total: 100_000, perPhase: { design: 30_000 } })

    budget.consume('design', 10_000)
    budget.consume('codegen', 20_000)

    const summary = budget.summary()
    expect(summary.total).toBe(100_000)
    expect(summary.used).toBe(30_000)
    expect(summary.remaining).toBe(70_000)
    expect(summary.phases.design).toEqual({ used: 10_000, limit: 30_000 })
    expect(summary.phases.codegen).toEqual({ used: 20_000, limit: undefined })
  })
})
