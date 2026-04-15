import {
  checkCriticalPrerequisites,
  PreflightError,
  type Platform,
  type DtcConfig,
} from '@appifex/core'

export function runPreflight(platform: Platform, config?: DtcConfig): void {
  // Skip local tool checks for non-local runners — they manage their own environment
  if (config?.runner.type && config.runner.type !== 'local') return

  const report = checkCriticalPrerequisites(platform, config)

  if (!report.hasCriticalFailures) return

  // Phase 02 Plan 01 (FOUND-04): throw typed error instead of process.exit so
  // MCP host survives. entry.ts's top-level catch renders the message; the
  // MCP tool wrapper translates it to an isError envelope.
  const failed = report.checks.filter(
    (check) => check.status === 'fail' && check.severity === 'critical',
  )
  const firstCheck = failed[0]
  const lines = [
    'Cannot start pipeline — missing prerequisites:',
    ...failed.map((check) =>
      check.installHint
        ? `  ✗ ${check.name}: ${check.message}\n    → ${check.installHint}`
        : `  ✗ ${check.name}: ${check.message}`,
    ),
    `Run \`dtc doctor --platform ${platform}\` for a full diagnostic.`,
  ]
  throw new PreflightError(lines.join('\n'), firstCheck?.name)
}
