import type { PhaseId, TokenBudgetConfig } from './types.js'
import { tokensToUsd } from './pricing.js'

/** Phase 7 (OBS-01 D-14): input/output token split for cost attribution. */
export interface TokenBreakdown {
  input: number
  output: number
}

/** Phase 02 Plan 02 (FOUND-02): fix loop must not start with less than this ratio of total budget remaining. */
export const FIX_LOOP_MIN_RESERVE_RATIO = 0.3

export interface BudgetSummary {
  total: number
  used: number
  remaining: number
  phases: Record<string, { used: number; limit: number | undefined }>
}

export class TokenBudget {
  // Phase 02 Plan 02 (FOUND-02): renamed from `private total` to `#total` so a
  // public `get total()` getter can expose the constructor-supplied budget
  // without colliding with the private storage field.
  #total: number
  private phaseLimits: Partial<Record<PhaseId, number>>
  private usage: Map<PhaseId, number> = new Map()
  /** Phase 7 (OBS-01 D-14): per-phase input/output split alongside the existing `usage` total. */
  private usageBreakdown: Map<PhaseId, TokenBreakdown> = new Map()

  constructor(config: TokenBudgetConfig) {
    this.#total = config.total
    this.phaseLimits = config.perPhase ?? {}
  }

  consume(phase: PhaseId, tokens: number): void {
    this.usage.set(phase, (this.usage.get(phase) ?? 0) + tokens)
  }

  /**
   * Phase 02 Plan 02 (FOUND-02): expose the constructor-supplied budget total
   * so callers (fix-loop guard, BudgetExhaustedError constructor) don't reach
   * into private state.
   */
  get total(): number {
    return this.#total
  }

  get totalUsed(): number {
    let sum = 0
    for (const v of this.usage.values()) sum += v
    return sum
  }

  get totalRemaining(): number {
    return this.#total - this.totalUsed
  }

  phaseUsed(phase: PhaseId): number {
    return this.usage.get(phase) ?? 0
  }

  canConsume(tokens: number): boolean {
    return this.totalUsed + tokens <= this.#total
  }

  canConsumePhase(phase: PhaseId, tokens: number): boolean {
    const limit = this.phaseLimits[phase]
    if (limit !== undefined && this.phaseUsed(phase) + tokens > limit) {
      return false
    }
    return this.canConsume(tokens)
  }

  /** Phase 02 Plan 02 (FOUND-02): fix-loop precondition — enough budget left to converge. */
  canEnterFixLoop(): boolean {
    return this.totalRemaining >= FIX_LOOP_MIN_RESERVE_RATIO * this.#total
  }

  summary(): BudgetSummary {
    const phases: BudgetSummary['phases'] = {}
    for (const [phase, used] of this.usage) {
      phases[phase] = { used, limit: this.phaseLimits[phase] }
    }
    return {
      total: this.#total,
      used: this.totalUsed,
      remaining: this.totalRemaining,
      phases,
    }
  }

  /**
   * Phase 7 (OBS-01 D-14): record an input/output token split. Also updates the
   * single-number `usage` total (via `consume`) for backward compat with existing
   * callers that read `phaseUsed()` / `totalUsed`.
   */
  consumeBreakdown(phase: PhaseId, breakdown: TokenBreakdown): void {
    const prev = this.usageBreakdown.get(phase) ?? { input: 0, output: 0 }
    this.usageBreakdown.set(phase, {
      input: prev.input + breakdown.input,
      output: prev.output + breakdown.output,
    })
    this.consume(phase, breakdown.input + breakdown.output)
  }

  phaseBreakdown(phase: PhaseId): TokenBreakdown {
    return this.usageBreakdown.get(phase) ?? { input: 0, output: 0 }
  }

  /**
   * Phase 7 (OBS-01 D-14): per-phase USD for the given model, or `null` if the
   * model is not in `PRICING_USD_PER_MTOK`.
   */
  phaseCostUsd(phase: PhaseId, model: string): number | null {
    const bd = this.phaseBreakdown(phase)
    return tokensToUsd(model, bd.input, bd.output)
  }

  /**
   * Phase 7 (OBS-01 D-14): total USD across all tracked phases for the given model.
   * Returns `null` if the model is unknown (refuses to silently aggregate with zeros).
   * Per Pitfall 8: aggregate per-phase costs rather than applying one model to totals.
   */
  totalCostUsd(model: string): number | null {
    let total = 0
    for (const bd of this.usageBreakdown.values()) {
      const c = tokensToUsd(model, bd.input, bd.output)
      if (c === null) return null
      total += c
    }
    return total
  }
}
