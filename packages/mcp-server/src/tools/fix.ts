import {
  fixLoop,
  createDefaultFixFn,
  createClaudeCliFixFn,
  createCodexCliFixFn,
} from '@appifex/fix'
import { validateAll } from '@appifex/validate'
import { buildSwift, buildKotlin } from '@appifex/build'
import type { Runner, Platform, DtcConfig } from '@appifex/core'
import { join } from 'node:path'

export async function handleFix(
  args: {
    platform: string
    projectDir: string
    maxAttempts?: number
    tokenBudget?: number
    flowDir?: string
    testDir?: string
  },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  const platform = args.platform as Platform
  const projectDir = args.projectDir
  const flowDir = args.flowDir ?? join(projectDir, '.maestro')
  const testDir = args.testDir ?? join(projectDir, '__tests__')
  const reportDir = join(projectDir, '.dtc-report')

  const buildFn = async () =>
    platform === 'swiftui'
      ? buildSwift(runner, { projectDir, scheme: 'App' })
      : buildKotlin(runner, { projectDir })

  const validateFn = async () =>
    validateAll(runner, {
      platform,
      projectDir,
      flowDir,
      testDir,
      reportDir,
    })

  // Get initial validation
  const initialValidation = await validateFn()
  if (initialValidation.allPassed) {
    return {
      text: JSON.stringify(
        { status: 'all_green', message: 'All tests already passing', attempts: [] },
        null,
        2,
      ),
      isError: false,
    }
  }

  // Create fix function
  const fixFn =
    config.llm.provider === 'claude-cli'
      ? createClaudeCliFixFn({ runner, projectDir, model: config.llm.model })
      : config.llm.provider === 'codex-cli'
        ? createCodexCliFixFn({ runner, projectDir, model: config.llm.model })
        : createDefaultFixFn({
            apiKey: config.llm.apiKey ?? '',
            runner,
            projectDir,
            model: config.llm.model,
          })

  const result = await fixLoop(initialValidation, {
    fixFn,
    buildFn,
    validateFn,
    maxAttempts: args.maxAttempts ?? 5,
    tokenBudget: args.tokenBudget ?? 200_000,
  })

  return {
    text: JSON.stringify(result, null, 2),
    isError: result.status !== 'all_green',
  }
}
