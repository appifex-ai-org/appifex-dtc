import * as p from '@clack/prompts'
import chalk from 'chalk'
import { checkPrerequisites, ConfigError, loadConfig, type Platform } from '@appifex/core'
import { homedir } from 'node:os'
import { join } from 'node:path'

export async function runDoctor(platform: Platform): Promise<void> {
  p.intro(chalk.bold(`dtc doctor — ${platform}`))

  let config
  try {
    config = await loadConfig(join(homedir(), '.dtc'))
    // Treat empty API key as unconfigured (except for providers that don't need one)
    if (
      !config.llm.apiKey &&
      config.llm.provider !== 'claude-cli' &&
      config.llm.provider !== 'copilot'
    ) {
      config = undefined
    }
  } catch {
    config = undefined
  }

  if (!config) {
    p.log.info(chalk.dim('No configuration found. Run `dtc setup` first for full checks.'))
  }

  const report = checkPrerequisites(platform, config)

  for (const check of report.checks) {
    const icon =
      check.status === 'pass'
        ? chalk.green('✓')
        : check.status === 'fail' && check.severity === 'critical'
          ? chalk.red('✗')
          : check.status === 'fail'
            ? chalk.yellow('!')
            : chalk.dim('–')

    const label = check.name.padEnd(20)
    p.log.message(`  ${icon} ${chalk.bold(label)} ${check.message}`)

    if (check.status === 'fail' && check.installHint) {
      p.log.message(`    ${chalk.dim('→')} ${chalk.cyan(check.installHint)}`)
    }
  }

  const criticalCount = report.checks.filter(
    (c) => c.status === 'fail' && c.severity === 'critical',
  ).length
  const warnCount = report.checks.filter(
    (c) => c.status === 'fail' && c.severity === 'warning',
  ).length

  if (criticalCount > 0) {
    const msg = `${criticalCount} critical issue(s) must be fixed before \`dtc run --platform ${platform}\` will work.`
    p.outro(chalk.red(msg))
    // Phase 02 Plan 01 (FOUND-04): throw a CliError subclass (ConfigError) so
    // MCP tool wrappers catch it via `instanceof CliError` — a generic Error
    // would fall through and crash the MCP host. entry.ts translates to exit code.
    throw new ConfigError(msg)
  } else if (warnCount > 0) {
    p.outro(
      chalk.yellow(
        `All critical checks passed. ${warnCount} optional tool(s) missing — some features will be skipped.`,
      ),
    )
  } else {
    p.outro(chalk.green(`All checks passed! Ready for \`dtc run --platform ${platform}\`.`))
  }
}
