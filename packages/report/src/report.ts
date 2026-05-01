import type { Platform, FixResult, PhaseId } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

export interface AgentReportInfo {
  agentName: string
  model?: string
  sessionId?: string
  stopReason: string
  costUsd?: number
  /** True when a local CLI did not expose token/cost usage. */
  costUnknown?: boolean
  filesGenerated: string[]
  /** Summary output from the agent */
  output?: string
}

export interface BuildReportInput {
  projectName: string
  platforms: Platform[]
  designIterations: number
  validation: Partial<Record<string, ValidationResult>>
  fix: Partial<Record<string, FixResult>>
  tokenUsage: Partial<Record<string, number>>
  totalDuration: number
  /** Agent-specific info (only for agent-based runs) */
  agent?: AgentReportInfo
  /** Phase 7 (OBS-01 D-14 D-15): per-phase input/output token split. */
  tokenUsageBreakdown?: Partial<Record<PhaseId, { input: number; output: number }>>
  /** Phase 7 (OBS-01 D-15): per-phase USD cost, null when model not in pricing table. */
  costUsdPerPhase?: Partial<Record<PhaseId, number | null>>
  /** Phase 7 (OBS-01 D-15): run-total USD, null if any phase would be null. */
  costUsdTotal?: number | null
  /** Phase 7 (OBS-01 D-15): model identifier used for cost attribution. */
  model?: string
  /** Phase 7 (OBS-01 D-15): pricing table as-of date (honesty contract). */
  pricingAsOf?: string
  /** Human-readable note when cost cannot be estimated honestly. */
  costNote?: string
}

export interface ReportSummary {
  totalTests: number
  totalPassed: number
  totalFailed: number
  allGreen: boolean
  fixAttempts: number
  totalTokens: number
  totalDuration: number
  designIterations: number
}

export interface PlatformReport {
  platform: string
  uiTests: { passed: number; total: number }
  unitTests: { passed: number; total: number }
  securityTests?: { passed: number; total: number }
  fixResult?: FixResult
}

export interface PipelineReport {
  projectName: string
  platforms: Platform[]
  summary: ReportSummary
  platformReports: PlatformReport[]
  tokenUsage: Partial<Record<string, number>>
  agent?: AgentReportInfo
  /** Phase 7 (OBS-01 D-15): per-phase input/output token split. */
  tokenUsageBreakdown?: Partial<Record<PhaseId, { input: number; output: number }>>
  /** Phase 7 (OBS-01 D-15): per-phase USD cost, null when model not in pricing table. */
  costUsdPerPhase?: Partial<Record<PhaseId, number | null>>
  /** Phase 7 (OBS-01 D-15): run-total USD, null if any phase would be null. */
  costUsdTotal?: number | null
  /** Phase 7 (OBS-01 D-15): model identifier used for cost attribution. */
  model?: string
  /** Phase 7 (OBS-01 D-15): pricing table as-of date (honesty contract). */
  pricingAsOf?: string
  /** Human-readable note when cost cannot be estimated honestly. */
  costNote?: string
}

export function buildReport(input: BuildReportInput): PipelineReport {
  const platformReports: PlatformReport[] = []
  let totalTests = 0
  let totalPassed = 0
  let fixAttempts = 0

  for (const platform of input.platforms) {
    const validation = input.validation[platform]
    const fix = input.fix[platform]

    const uiTotal = validation?.ui.total ?? 0
    const uiPassed = validation?.ui.passed ?? 0
    const unitTotal = validation?.unit.total ?? 0
    const unitPassed = validation?.unit.passed ?? 0
    const sec = validation?.security

    totalTests += uiTotal + unitTotal + (sec?.total ?? 0)
    totalPassed += uiPassed + unitPassed + (sec?.passed ?? 0)
    fixAttempts += fix?.attempts.length ?? 0

    platformReports.push({
      platform,
      uiTests: { passed: uiPassed, total: uiTotal },
      unitTests: { passed: unitPassed, total: unitTotal },
      securityTests: sec ? { passed: sec.passed, total: sec.total } : undefined,
      fixResult: fix,
    })
  }

  const totalTokens = Object.values(input.tokenUsage).reduce<number>((sum, v) => sum + (v ?? 0), 0)

  return {
    projectName: input.projectName,
    platforms: input.platforms,
    summary: {
      totalTests,
      totalPassed,
      totalFailed: totalTests - totalPassed,
      allGreen: totalTests > 0 && totalPassed === totalTests,
      fixAttempts,
      totalTokens: totalTokens as number,
      totalDuration: input.totalDuration,
      designIterations: input.designIterations,
    },
    platformReports,
    tokenUsage: input.tokenUsage,
    agent: input.agent,
    tokenUsageBreakdown: input.tokenUsageBreakdown,
    costUsdPerPhase: input.costUsdPerPhase,
    costUsdTotal: input.costUsdTotal,
    model: input.model,
    pricingAsOf: input.pricingAsOf,
    costNote: input.costNote,
  }
}
