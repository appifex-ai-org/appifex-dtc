import chalk from 'chalk'
import { checkCriticalPrerequisites, type Platform, type DtcConfig } from '@appifex/core'

export function runPreflight(platform: Platform, config?: DtcConfig): void {
  // Skip local tool checks for non-local runners — they manage their own environment
  if (config?.runner.type && config.runner.type !== 'local') return

  const report = checkCriticalPrerequisites(platform, config)

  if (!report.hasCriticalFailures) return

  console.error()
  console.error(chalk.red.bold('  Cannot start pipeline — missing prerequisites:'))
  console.error()

  for (const check of report.checks) {
    if (check.status !== 'fail' || check.severity !== 'critical') continue
    console.error(chalk.red(`  ✗ ${check.name}: ${check.message}`))
    if (check.installHint) {
      console.error(chalk.dim(`    → ${check.installHint}`))
    }
  }

  console.error()
  console.error(chalk.dim(`  Run \`dtc doctor --platform ${platform}\` for a full diagnostic.`))
  console.error()
  process.exit(1)
}
