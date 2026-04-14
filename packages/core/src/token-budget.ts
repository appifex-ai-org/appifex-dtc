import type { PhaseId, TokenBudgetConfig } from './types.js'

export interface BudgetSummary {
  total: number
  used: number
  remaining: number
  phases: Record<string, { used: number; limit: number | undefined }>
}

export class TokenBudget {
  private total: number
  private phaseLimits: Partial<Record<PhaseId, number>>
  private usage: Map<PhaseId, number> = new Map()

  constructor(config: TokenBudgetConfig) {
    this.total = config.total
    this.phaseLimits = config.perPhase ?? {}
  }

  consume(phase: PhaseId, tokens: number): void {
    this.usage.set(phase, (this.usage.get(phase) ?? 0) + tokens)
  }

  get totalUsed(): number {
    let sum = 0
    for (const v of this.usage.values()) sum += v
    return sum
  }

  get totalRemaining(): number {
    return this.total - this.totalUsed
  }

  phaseUsed(phase: PhaseId): number {
    return this.usage.get(phase) ?? 0
  }

  canConsume(tokens: number): boolean {
    return this.totalUsed + tokens <= this.total
  }

  canConsumePhase(phase: PhaseId, tokens: number): boolean {
    const limit = this.phaseLimits[phase]
    if (limit !== undefined && this.phaseUsed(phase) + tokens > limit) {
      return false
    }
    return this.canConsume(tokens)
  }

  summary(): BudgetSummary {
    const phases: BudgetSummary['phases'] = {}
    for (const [phase, used] of this.usage) {
      phases[phase] = { used, limit: this.phaseLimits[phase] }
    }
    return {
      total: this.total,
      used: this.totalUsed,
      remaining: this.totalRemaining,
      phases,
    }
  }
}
