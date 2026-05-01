import type { ModifiedScreens, Platform, Runner, TokenBudget } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'
import type { FixFnResult } from './fix-loop.js'
import {
  buildCliFixPrompt,
  detectChangedFiles,
  runCliProcess,
  snapshotFixableFiles,
} from './cli-fix-utils.js'

export interface ClaudeCliFixOpts {
  runner: Runner
  projectDir: string
  /** Model to use (default: claude-sonnet-4-6) */
  model?: string
  /** Timeout in ms (default: 10 min) */
  timeoutMs?: number
  // Phase 6 (VAL-02 D-10): advisory ranker inputs — ALL OPTIONAL, sane fallbacks.
  // Zero blast radius: existing call sites in cli/src/pipeline.ts keep compiling.
  modifiedScreens?: ModifiedScreens
  tokenBudget?: TokenBudget
  platform?: Platform
}

/**
 * Creates a fix function that shells out to the local `claude` CLI.
 * Claude reads the project files directly and writes fixes in place.
 */
export function createClaudeCliFixFn(
  opts: ClaudeCliFixOpts,
): (failures: ValidationResult) => Promise<FixFnResult> {
  const model = opts.model ?? 'claude-sonnet-4-6'
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000

  return async (failures: ValidationResult): Promise<FixFnResult> => {
    try {
      const before = await snapshotFixableFiles(opts.runner, opts.projectDir)
      const prompt = await buildCliFixPrompt({
        runner: opts.runner,
        projectDir: opts.projectDir,
        failures,
        modifiedScreens: opts.modifiedScreens,
        tokenBudget: opts.tokenBudget,
        platform: opts.platform,
      })

      const result = await runCliProcess({
        binary: 'claude',
        args: [
          '--model',
          model,
          '--max-budget-usd',
          '3',
          '--allowedTools',
          'Edit,Write,Read,Bash(safe_mode=true),Glob,Grep',
          '--dangerously-skip-permissions',
        ],
        cwd: opts.projectDir,
        input: prompt,
        timeoutMs,
        site: 'packages/fix/claude-cli-fix.ts',
        label: 'Claude CLI',
      })

      if (!result.success) {
        throw new Error(result.error ?? 'Claude CLI fix failed')
      }

      return {
        filesChanged: await detectChangedFiles(opts.runner, opts.projectDir, before),
        tokensUsed: 0,
      }
    } catch (err) {
      // Re-throw so fix loop sees the failure
      throw err
    }
  }
}
