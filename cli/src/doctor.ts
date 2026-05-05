// Phase 03 Plan 05 (SETUP-03, D-11/D-12): shallow by default; --deep reuses runCredentialChecks
// to stay in sync with preflight (Pitfall 4).
import chalk from 'chalk'
import {
  checkPrerequisites,
  checkFirebaseTools,
  checkServiceAccountJson,
  checkAscP8,
  runCredentialChecks,
  loadConfig,
  isFixtureMode,
  CliError,
  type PrereqCheck,
} from '@appifex/core'
import type { CredentialCheck } from '@appifex/core'
import { homedir } from 'node:os'
import { join } from 'node:path'

function defaultConfigDir(): string {
  return join(homedir(), '.dtc')
}

/** Format a prerequisite check as a single status line. */
function formatPrereqLine(check: PrereqCheck): string {
  const icon =
    check.status === 'pass'
      ? chalk.green('✓')
      : check.status === 'fail' && check.severity === 'critical'
        ? chalk.red('✗')
        : check.status === 'fail'
          ? chalk.yellow('!')
          : chalk.dim('○')

  const label = check.name.padEnd(24)
  let line = `  ${icon} ${chalk.bold(label)} ${check.message}\n`
  if (check.status === 'fail' && check.installHint) {
    line += `    ${chalk.dim('→')} ${chalk.cyan(check.installHint)}\n`
  }
  return line
}

/** Format a credential check as a single status line (matches preflight format). */
function formatCredentialLine(check: CredentialCheck): string {
  const statusTag =
    check.status === 'OK'
      ? chalk.green('[OK]')
      : check.status === 'MISSING'
        ? chalk.red('[MISSING]')
        : check.status === 'INVALID'
          ? chalk.red('[INVALID]')
          : chalk.yellow('[EXPIRED]')

  const transientNote = check.transientError ? chalk.dim(' (transient)') : ''
  let line = `  ${statusTag} ${check.name}: ${check.message}${transientNote}\n`
  if (check.remedy && check.status !== 'OK') {
    line += `    ${chalk.dim('→')} ${check.remedy}\n`
  }
  return line
}

export interface DoctorOpts {
  deep?: boolean
  configDir?: string
  /** Output stream for status lines (default: process.stdout) */
  output?: NodeJS.WritableStream
}

/**
 * Run doctor checks.
 * Shallow (default): prerequisites + checkFirebaseTools + checkServiceAccountJson + checkAscP8.
 * Deep (--deep): same shallow checks + runCredentialChecks (shared with preflight — Pitfall 4).
 * Never calls process.exit — throws CliError on critical failures so MCP host survives.
 */
export async function runDoctor(opts: DoctorOpts = {}): Promise<void> {
  const out = opts.output ?? process.stdout
  const configDir = opts.configDir ?? defaultConfigDir()

  // Load config (soft-fail to undefined — doctor must work even without config)
  let config: Awaited<ReturnType<typeof loadConfig>> | undefined
  try {
    config = await loadConfig(configDir)
    const localAuthProviders = new Set<string>(['claude-cli', 'codex-cli', 'copilot'])
    if (!config.llm.apiKey && !localAuthProviders.has(config.llm.provider)) {
      config = undefined
    }
  } catch {
    config = undefined
  }

  if (!config) {
    out.write(chalk.dim('  No configuration found. Run `dtc setup` first for full checks.\n'))
  }

  out.write(chalk.bold('\ndtc doctor — prerequisites\n\n'))

  // ── Shallow tier ──────────────────────────────────────────────────────────
  // Platform is unknown at doctor level (doctor is now platform-agnostic shallow check).
  // Use 'swiftui' as default for checkPrerequisites to include macOS/Xcode checks.
  const prereqReport = checkPrerequisites('swiftui', config)
  const checks = [...prereqReport.checks]

  // SETUP-03: add firebase-tools, service-account JSON, ASC .p8 shallow checks
  const firebaseSeverity =
    config?.baas?.provider === 'firebase' ? ('critical' as const) : ('info' as const)
  checks.push(checkFirebaseTools(firebaseSeverity))
  checks.push(await checkServiceAccountJson(config?.firebase?.serviceAccountKeyPath))
  checks.push(await checkAscP8(config?.apple?.ascKeyPath))

  for (const check of checks) {
    out.write(formatPrereqLine(check))
  }

  // ── Deep tier ─────────────────────────────────────────────────────────────
  if (opts.deep) {
    // Fixture mode short-circuits deep probes (Pitfall 7)
    if (isFixtureMode()) {
      out.write(chalk.dim('\n  --deep skipped: fixture mode active (all credentials OK)\n'))
    } else {
      out.write(chalk.bold('\ndtc doctor — credentials (deep)\n\n'))
      const credReport = await runCredentialChecks(config, { deep: true })
      for (const check of credReport.checks) {
        out.write(formatCredentialLine(check))
      }
      if (credReport.hasBlockingFailures) {
        const blockingNames = credReport.checks
          .filter((c) => c.severity === 'critical' && c.status !== 'OK' && !c.transientError)
          .map((c) => c.name)
        throw new CliError(
          `doctor found credential failures: ${blockingNames.join(', ')}. Run \`dtc setup\` to fix.`,
          4,
        )
      }
    }
  }

  // Critical prereq failures always throw (MCP-safe — no process.exit)
  const criticalFailures = checks.filter((c) => c.status === 'fail' && c.severity === 'critical')
  if (criticalFailures.length > 0) {
    const names = criticalFailures.map((c) => c.name).join(', ')
    throw new CliError(`doctor found critical failures: ${names}`, 4)
  }

  const warnCount = checks.filter((c) => c.status === 'fail' && c.severity === 'warning').length
  if (warnCount > 0) {
    out.write(
      chalk.yellow(
        `\nAll critical checks passed. ${warnCount} optional tool(s) missing — some features will be skipped.\n`,
      ),
    )
  } else {
    out.write(chalk.green('\nAll checks passed!\n'))
  }
}
