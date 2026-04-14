import chalk from 'chalk'
import type { PhaseId, FixRecommendation, FixStatus } from '@appifex/core'

export type PhaseDisplayStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface PhaseState {
  id: PhaseId | string
  status: PhaseDisplayStatus
  message?: string
  detail?: string
}

const STATUS_ICONS: Record<PhaseDisplayStatus, string> = {
  pending: chalk.dim('○'),
  running: chalk.cyan('◐'),
  completed: chalk.green('✓'),
  failed: chalk.red('✗'),
  skipped: chalk.dim('–'),
}

const PHASE_LABELS: Record<string, string> = {
  design: 'Design',
  spec: 'Spec',
  design_delta: 'Design delta',
  baas_recommend: 'BaaS',
  baas_schema: 'Schema',
  baas_auth: 'Auth',
  mock_service: 'Mock services',
  test_gen: 'Tests',
  codegen: 'Codegen',
  build: 'Build',
  validate: 'Validate',
  security: 'Security',
  fix: 'Fix',
  deliver: 'Deliver',
  report: 'Report',
}

export function formatPhaseStatus(phase: PhaseState): string {
  const icon = STATUS_ICONS[phase.status]
  const label = PHASE_LABELS[phase.id] ?? phase.id.charAt(0).toUpperCase() + phase.id.slice(1)
  const paddedLabel = label.padEnd(12)

  let line = `  ${icon} ${paddedLabel}`
  if (phase.message) {
    line += chalk.dim(` ${phase.message}`)
  }

  return line
}

export function formatTokenBar(used: number, total: number, width = 24): string {
  if (total === 0) return `  ${chalk.dim('Tokens:')} 0 / 0`

  const ratio = Math.min(used / total, 1)
  const filled = Math.round(ratio * width)
  const empty = width - filled

  const bar = chalk.cyan('━'.repeat(filled)) + chalk.dim('░'.repeat(empty))
  return `  ${chalk.dim('Tokens:')} ${used.toLocaleString()} / ${total.toLocaleString()}  ${bar}`
}

export interface ValidationSummaryInput {
  platform: string
  ui: { passed: number; total: number }
  unit: { passed: number; total: number }
  security?: { passed: number; total: number }
}

export function formatValidationSummary(input: ValidationSummaryInput): string {
  const uiOk = input.ui.passed === input.ui.total
  const unitOk = input.unit.passed === input.unit.total
  const secOk = !input.security || input.security.passed === input.security.total

  const uiStr = `UI ${input.ui.passed}/${input.ui.total}`
  const unitStr = `Unit ${input.unit.passed}/${input.unit.total}`

  const uiFmt = uiOk ? chalk.green(uiStr) : chalk.red(uiStr)
  const unitFmt = unitOk ? chalk.green(unitStr) : chalk.red(unitStr)

  let secFmt = ''
  if (input.security) {
    const secStr = `Sec ${input.security.passed}/${input.security.total}`
    secFmt = '  ' + (secOk ? chalk.green(secStr) : chalk.red(secStr))
  }

  const allOk = uiOk && unitOk && secOk
  const icon = allOk ? chalk.green('✓') : chalk.red('✗')

  return `  ${icon} ${chalk.bold(input.platform)}  ${uiFmt}  ${unitFmt}${secFmt}`
}

export interface FixStatusInput {
  status: FixStatus
  attempts: number
  tokensUsed: number
  recommendation?: FixRecommendation
}

export function formatFixStatus(input: FixStatusInput): string {
  const lines: string[] = []

  const attemptStr = `${input.attempts} attempt${input.attempts !== 1 ? 's' : ''}`
  const tokenStr = `${input.tokensUsed.toLocaleString()} tokens`

  if (input.status === 'all_green') {
    lines.push(`  ${chalk.green('✅ ALL GREEN')} — ${attemptStr}, ${tokenStr}`)
  } else {
    const statusLabel = input.status.toUpperCase()
    lines.push(`  ${chalk.red(`⛔ ${statusLabel}`)} — ${attemptStr}, ${tokenStr}`)
    if (input.recommendation) {
      lines.push(`  ${chalk.yellow('→')} Recommendation: ${chalk.yellow(input.recommendation)}`)
    }
  }

  return lines.join('\n')
}

export function formatPreBuildSummary(summary: import('../pipeline.js').PreBuildSummary): string {
  const lines: string[] = []
  lines.push(chalk.bold('Pre-build plan'))
  lines.push('')
  if (summary.newScreens.length > 0) {
    lines.push(chalk.dim('New screens:'))
    for (const s of summary.newScreens) lines.push(`  + ${s}`)
    lines.push('')
  }
  if (summary.modifiedFiles.length > 0) {
    lines.push(chalk.dim('Files to modify:'))
    for (const f of summary.modifiedFiles) lines.push(`  ~ ${f}`)
    lines.push('')
  }

  // Design drift section (D-09, D-11): only when changed or removed entries exist
  const delta = summary.designDelta
  if (delta && (delta.changed.length > 0 || delta.removed.length > 0)) {
    // Cap at 20 lines including the header line
    const MAX_DRIFT_LINES = 20
    const driftLines: string[] = []
    driftLines.push(chalk.bold('Design drift'))

    // Category order: colors, typography, spacing, borderRadius
    const CATEGORY_ORDER = ['colors', 'typography', 'spacing', 'borderRadius'] as const

    let remaining = delta.changed.length + delta.removed.length
    let capped = false

    for (const cat of CATEGORY_ORDER) {
      if (capped) break
      // Changed entries first
      for (const entry of delta.changed) {
        if (entry.category !== cat) continue
        if (driftLines.length >= MAX_DRIFT_LINES) {
          remaining = delta.changed.length + delta.removed.length - (driftLines.length - 1)
          driftLines.push(`  ... (${remaining} more)`)
          capped = true
          break
        }
        if (cat === 'typography') {
          driftLines.push(`  ~ ${cat}.${entry.name}: changed (multiple fields)`)
        } else {
          driftLines.push(`  ~ ${cat}.${entry.name}: ${entry.oldValue} → ${entry.newValue}`)
        }
      }
      if (capped) break
      // Removed entries second
      for (const entry of delta.removed) {
        if (entry.category !== cat) continue
        if (driftLines.length >= MAX_DRIFT_LINES) {
          remaining = delta.changed.length + delta.removed.length - (driftLines.length - 1)
          driftLines.push(`  ... (${remaining} more)`)
          capped = true
          break
        }
        driftLines.push(`  - ${cat}.${entry.name}: ${entry.value}`)
      }
    }

    for (const l of driftLines) lines.push(l)
    lines.push('')
  }

  // BaaS schema entities (SDK-01: surfaced after recommendation)
  if (summary.baasSchema) {
    const entityNames = summary.baasSchema.entities.map((e: any) => e.name).join(', ')
    lines.push(chalk.dim('Inferred entities:') + ` ${entityNames}`)
    lines.push('')
  }

  // BaaS recommendation (D-08: surfaced as a line in pre-build summary)
  if (summary.baasRecommendation) {
    const tier = summary.baasRecommendation.tier
    const tierColor =
      tier === 'appropriate' ? chalk.green : tier === 'caveats' ? chalk.yellow : chalk.red
    lines.push(tierColor(`BaaS: ${summary.baasRecommendation.reason}`))
    lines.push('')
  }

  lines.push(
    chalk.dim('Design:') +
      ` ${summary.designStrategy === 'new' ? 'create new .pen file' : 'extend existing .pen file'}`,
  )
  if (summary.tokenCount > 0) {
    lines.push(chalk.dim('Design tokens loaded:') + ` ${summary.tokenCount}`)
  }
  if (summary.testFilesToGenerate.length > 0) {
    lines.push(chalk.dim('Tests to generate:') + ` ${summary.testFilesToGenerate.length} file(s)`)
  }
  return lines.join('\n')
}

export function formatAssumptionBlock(
  assumptions: Array<{ category: string; description: string }>,
  missingDimensions?: string[],
): string {
  const lines: string[] = []

  if (missingDimensions && missingDimensions.length > 0) {
    lines.push(chalk.bold('Prompt is underspecified for add-feature mode'))
    for (const dim of missingDimensions) {
      lines.push(chalk.dim(`  ${dim}`))
    }
    lines.push('')
  }

  lines.push(chalk.bold("I'll assume:"))
  for (const a of assumptions) {
    lines.push(`  - ${a.description}`)
  }

  return lines.join('\n')
}
