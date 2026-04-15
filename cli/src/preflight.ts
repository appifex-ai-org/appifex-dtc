// Phase 03 Plan 02 (SETUP-02, D-03/D-04/D-05): runCredentialChecks gates pipeline start —
// throws PreflightError before any LLM spend. Fixture mode short-circuits per RESEARCH Pitfall 7.
import chalk from 'chalk'
import {
  checkCriticalPrerequisites,
  runCredentialChecks,
  isFixtureMode,
  PreflightError,
  type Platform,
  type DtcConfig,
} from '@appifex/core'
import type { CredentialCheck } from '@appifex/core'

export interface PreflightOpts {
  deep?: boolean
  /** Output stream for status lines (default: process.stderr) */
  output?: NodeJS.WritableStream
}

/**
 * Format a single credential check as a chalked status line.
 * T-03-02-01: message field must never contain credential material — enforced upstream in probes.
 */
function formatCheckLine(check: CredentialCheck): string {
  const statusTag =
    check.status === 'OK'
      ? chalk.green('[OK]')
      : check.status === 'MISSING'
        ? chalk.red('[MISSING]')
        : check.status === 'INVALID'
          ? chalk.red('[INVALID]')
          : chalk.yellow('[EXPIRED]')

  const transientNote = check.transientError ? chalk.dim(' (transient)') : ''
  return `${statusTag} ${check.name}: ${check.message}${transientNote}\n`
}

export async function runPreflight(
  platform: Platform,
  config?: DtcConfig,
  opts?: PreflightOpts,
): Promise<void> {
  const out = opts?.output ?? process.stderr

  // Skip local tool checks for non-local runners — they manage their own environment
  if (config?.runner.type && config.runner.type !== 'local') {
    // Still run credential checks even for non-local runners
  } else {
    const prereqReport = checkCriticalPrerequisites(platform, config)

    if (prereqReport.hasCriticalFailures) {
      // Phase 02 Plan 01 (FOUND-04): throw typed error instead of process.exit so
      // MCP host survives. entry.ts's top-level catch renders the message; the
      // MCP tool wrapper translates it to an isError envelope.
      const failed = prereqReport.checks.filter(
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
  }

  // Fixture mode short-circuits credential checks (RESEARCH Pitfall 7)
  if (isFixtureMode()) {
    return
  }

  // ── Credential gate — runs before any LLM spend ──
  const report = await runCredentialChecks(config, { deep: opts?.deep ?? false })

  // Print per-credential status lines
  for (const check of report.checks) {
    out.write(formatCheckLine(check))
    // Print remedy hint on next line when present
    if (check.remedy && check.status !== 'OK') {
      out.write(chalk.dim(`    → ${check.remedy}\n`))
    }
  }

  if (report.hasBlockingFailures) {
    const blockingNames = report.checks
      .filter((c) => c.severity === 'critical' && c.status !== 'OK' && !c.transientError)
      .map((c) => c.name)
    throw new PreflightError(
      `Preflight blocked: ${blockingNames.join(', ')}. Run \`dtc setup\` to fix.`,
    )
  }
}
