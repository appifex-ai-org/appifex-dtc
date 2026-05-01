import type { ModifiedScreens, Platform, Runner, TokenBudget } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'
import type { FixFnResult } from './fix-loop.js'
import {
  buildCliFixPrompt,
  detectChangedFiles,
  runCliProcess,
  snapshotFixableFiles,
} from './cli-fix-utils.js'

export interface CodexCliFixOpts {
  runner: Runner
  projectDir: string
  /** Model to use. "default" uses the local Codex config default. */
  model?: string
  /** Timeout in ms (default: 20 min) */
  timeoutMs?: number
  modifiedScreens?: ModifiedScreens
  tokenBudget?: TokenBudget
  platform?: Platform
}

export function createCodexCliFixFn(
  opts: CodexCliFixOpts,
): (failures: ValidationResult) => Promise<FixFnResult> {
  const model = opts.model ?? 'default'
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000

  return async (failures: ValidationResult): Promise<FixFnResult> => {
    const before = await snapshotFixableFiles(opts.runner, opts.projectDir)
    const prompt = await buildCliFixPrompt({
      runner: opts.runner,
      projectDir: opts.projectDir,
      failures,
      modifiedScreens: opts.modifiedScreens,
      tokenBudget: opts.tokenBudget,
      platform: opts.platform,
    })
    const args = ['exec', '--full-auto', '--sandbox', 'workspace-write', '--skip-git-repo-check']
    if (model !== 'default') args.push('--model', model)
    args.push('-')

    const result = await runCliProcess({
      binary: 'codex',
      args,
      cwd: opts.projectDir,
      input: prompt,
      timeoutMs,
      site: 'packages/fix/codex-cli-fix.ts',
      label: 'Codex CLI',
    })

    if (!result.success) {
      throw new Error(result.error ?? 'Codex CLI fix failed')
    }

    return {
      filesChanged: await detectChangedFiles(opts.runner, opts.projectDir, before),
      tokensUsed: 0,
    }
  }
}
