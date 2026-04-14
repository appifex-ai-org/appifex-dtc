import { validateAll, runSemgrep } from '@appifex/validate'
import type { Runner, Platform } from '@appifex/core'
import { join } from 'node:path'

export async function handleValidate(
  args: { platform: string; projectDir: string; flowDir?: string; testDir?: string; runSecurity?: boolean },
  runner: Runner,
): Promise<{ text: string; isError: boolean }> {
  const result = await validateAll(runner, {
    platform: args.platform as Platform,
    projectDir: args.projectDir,
    flowDir: args.flowDir ?? join(args.projectDir, '.maestro'),
    testDir: args.testDir ?? join(args.projectDir, '__tests__'),
    reportDir: join(args.projectDir, '.dtc-report'),
    runSecurity: args.runSecurity ?? true,
  })
  return {
    text: JSON.stringify({
      allPassed: result.allPassed,
      ui: { total: result.ui.total, passed: result.ui.passed, failed: result.ui.failed },
      unit: { total: result.unit.total, passed: result.unit.passed, failed: result.unit.failed },
      security: result.security ? { total: result.security.total, passed: result.security.passed, failed: result.security.failed, findings: result.security.findings } : undefined,
    }, null, 2),
    isError: !result.allPassed,
  }
}

export async function handleSecurity(
  args: { projectDir: string; platform?: string; config?: string },
  runner: Runner,
): Promise<{ text: string; isError: boolean }> {
  const result = await runSemgrep(runner, {
    projectDir: args.projectDir,
    platform: args.platform as Platform | undefined,
    configArg: args.config,
  })
  return {
    text: JSON.stringify(result, null, 2),
    isError: result.findings.length > 0,
  }
}
