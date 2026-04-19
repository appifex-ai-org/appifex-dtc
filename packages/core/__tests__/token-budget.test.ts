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

describe('CHARS_PER_TOKEN (DX-04 single source of truth)', () => {
  it('is exported from @appifex/core barrel', async () => {
    const mod = await import('../src/index.js')
    expect(mod.CHARS_PER_TOKEN).toBe(4)
  })
})
