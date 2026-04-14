import type { Runner, Platform, SemgrepFinding, SemgrepResult } from '@appifex/core'

export interface SemgrepOpts {
  projectDir: string
  platform?: Platform
  configArg?: string
}

function defaultConfigsForPlatform(platform?: Platform): string[] {
  switch (platform) {
    case 'swiftui':
      return ['p/swift', 'p/owasp-top-ten']
    case 'kotlin-compose':
      return ['p/kotlin', 'p/owasp-top-ten']
    default:
      return ['auto']
  }
}

/** Rules that produce false positives for generated apps */
const EXCLUDED_RULES: Record<Platform, string[]> = {
  'kotlin-compose': [
    // Launcher activity must be exported — always a false positive
    'java.android.security.exported_activity.exported_activity',
  ],
  swiftui: [],
  react: [],
}

async function ensureSemgrep(runner: Runner): Promise<boolean> {
  if (runner.capabilities.hasSemgrep) return true

  // Prefer pipx (isolated virtualenv, no dependency conflicts)
  const pipx = await runner.exec('pipx', ['install', 'semgrep'], { timeout: 120_000 })
  if (pipx.exitCode === 0) return true

  const install = await runner.exec('pip', ['install', 'semgrep'], { timeout: 120_000 })
  if (install.exitCode === 0) return true

  const install3 = await runner.exec('pip3', ['install', 'semgrep'], { timeout: 120_000 })
  return install3.exitCode === 0
}

export async function runSemgrep(runner: Runner, opts: SemgrepOpts): Promise<SemgrepResult> {
  const installed = await ensureSemgrep(runner)
  if (!installed) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      findings: [],
      error: 'semgrep install failed — skipped',
    }
  }

  const configs = opts.configArg ? [opts.configArg] : defaultConfigsForPlatform(opts.platform)
  const configFlags = configs.flatMap((c) => ['--config', c])
  const excludeFlags = (opts.platform ? EXCLUDED_RULES[opts.platform] : []).flatMap((r) => [
    '--exclude-rule',
    r,
  ])

  const result = await runner.exec(
    'semgrep',
    ['scan', ...configFlags, ...excludeFlags, '--json', '--quiet', opts.projectDir],
    { cwd: opts.projectDir },
  )

  try {
    const output = JSON.parse(result.stdout) as {
      results?: Array<{
        check_id: string
        extra: { severity: string; message: string }
        path: string
        start: { line: number; col: number }
        end: { line: number }
      }>
    }

    const findings: SemgrepFinding[] = (output.results ?? []).map((r) => ({
      ruleId: r.check_id,
      severity: r.extra.severity.toUpperCase() as SemgrepFinding['severity'],
      message: r.extra.message,
      file: r.path,
      line: r.start.line,
      endLine: r.end.line,
      column: r.start.col,
    }))

    return {
      total: findings.length,
      passed: findings.length === 0 ? 1 : 0,
      failed: findings.length,
      findings,
    }
  } catch {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      findings: [],
      error: result.stderr || 'Failed to parse semgrep output',
    }
  }
}
