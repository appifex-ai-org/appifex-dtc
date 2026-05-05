import { spawn } from 'node:child_process'
import type { ModifiedScreens, Platform, Runner, TokenBudget } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'
import type { FixFnResult } from './fix-loop.js'

export interface CodexCliFixOpts {
  runner: Runner
  projectDir: string
  /** Model to use (default: gpt-5.1-codex) */
  model?: string
  /** Timeout in ms (default: 20 min) */
  timeoutMs?: number
  modifiedScreens?: ModifiedScreens
  tokenBudget?: TokenBudget
  platform?: Platform
}

/**
 * Creates a fix function that shells out to the local `codex` CLI.
 * Codex reads project files directly and writes fixes in place.
 */
export function createCodexCliFixFn(
  opts: CodexCliFixOpts,
): (failures: ValidationResult) => Promise<FixFnResult> {
  const model = opts.model ?? 'gpt-5.1-codex'
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000

  return async (failures: ValidationResult): Promise<FixFnResult> => {
    const errorLines = buildErrorLines(failures)
    const flowFiles = await readMaestroFlows(opts.runner, opts.projectDir)
    const prompt = buildCodexFixPrompt({
      failures: errorLines,
      flowFiles,
      platform: opts.platform,
      modifiedScreens: opts.modifiedScreens,
      tokenBudget: opts.tokenBudget,
    })

    const result = await runCodexFixCli({
      prompt,
      model,
      projectDir: opts.projectDir,
      timeoutMs,
    })

    if (!result.success) {
      throw new Error(result.error ?? 'Codex CLI fix failed')
    }

    const diffResult = await opts.runner.exec('git', ['diff', '--name-only'], {
      cwd: opts.projectDir,
    })
    const untrackedResult = await opts.runner.exec(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd: opts.projectDir },
    )
    const filesChanged = [
      ...diffResult.stdout.trim().split('\n').filter(Boolean),
      ...untrackedResult.stdout.trim().split('\n').filter(Boolean),
    ]

    return { filesChanged, tokensUsed: 0 }
  }
}

function buildErrorLines(failures: ValidationResult): string[] {
  const errorLines: string[] = []

  if (failures.unit.failures.length > 0) {
    errorLines.push('## Build/Unit Test Errors')
    for (const failure of failures.unit.failures) {
      errorLines.push(`- ${failure.suiteName}/${failure.testName}: ${failure.error}`)
    }
  }

  const uiFailures = failures.ui.results.filter((result) => !result.passed)
  if (uiFailures.length > 0) {
    errorLines.push('\n## UI Test (Maestro) Failures')
    for (const failure of uiFailures) {
      errorLines.push(`- ${failure.flowName}: ${failure.error ?? 'FAILED'}`)
    }
  }

  if (failures.security?.findings && failures.security.findings.length > 0) {
    errorLines.push('\n## Security Findings (MUST FIX)')
    for (const finding of failures.security.findings) {
      errorLines.push(
        `- [${finding.severity}] ${finding.ruleId}: ${finding.file}:${finding.line} - ${finding.message}`,
      )
    }
  }

  return errorLines.length > 0 ? errorLines : ['- Validation failed with no structured errors.']
}

async function readMaestroFlows(runner: Runner, projectDir: string): Promise<string[]> {
  try {
    const flows = await runner.glob(`${projectDir}/.maestro/**/*.yaml`)
    const flowFiles: string[] = []
    for (const flow of flows.slice(0, 10)) {
      const content = await runner.readFile(flow)
      flowFiles.push(`## ${flow}\n${content}`)
    }
    return flowFiles
  } catch {
    return []
  }
}

function buildCodexFixPrompt(opts: {
  failures: string[]
  flowFiles: string[]
  platform?: Platform
  modifiedScreens?: ModifiedScreens
  tokenBudget?: TokenBudget
}): string {
  const modifiedScreens =
    opts.modifiedScreens &&
    (opts.modifiedScreens.added.length > 0 || opts.modifiedScreens.modified.length > 0)
      ? `\n## Modified screens\nAdded: ${opts.modifiedScreens.added.join(', ') || 'none'}\nModified: ${opts.modifiedScreens.modified.join(', ') || 'none'}\n`
      : ''
  const budgetHint =
    opts.tokenBudget !== undefined
      ? `\nToken budget remaining before fix: ${opts.tokenBudget.totalRemaining}.\n`
      : ''
  const platformHint = opts.platform ? ` for this ${opts.platform} project` : ''
  const flowBlock =
    opts.flowFiles.length > 0
      ? `\n## Maestro Test Flows\nThese define expected test IDs and user flows.\n${opts.flowFiles.join('\n\n')}\n`
      : ''

  return `Fix the following validation, build, and security failures${platformHint}. Read relevant source files, write fixes in place, and keep the changes focused.

${opts.failures.join('\n')}
${modifiedScreens}${budgetHint}${flowBlock}
## Instructions
- Inspect the source files implicated by the errors before editing.
- Fix the failures described above.
- If Maestro tests expect accessibilityIdentifier values, make sure they exist in the app code.
- Do not rewrite unrelated code.
- Do not ask questions. Apply the fixes directly.`
}

function runCodexFixCli(opts: {
  prompt: string
  model: string
  projectDir: string
  timeoutMs: number
}): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      'exec',
      '--model',
      opts.model,
      '--sandbox',
      'workspace-write',
      '--ask-for-approval',
      'never',
      '--skip-git-repo-check',
      '--color',
      'never',
      '-',
    ]

    const child = spawn('codex', args, {
      cwd: opts.projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const payloadBytes = Buffer.byteLength(opts.prompt, 'utf8')
    let settled = false
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true
        fn()
      }
    }

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      settle(() =>
        resolve({
          success: false,
          output: stdout,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      settle(() =>
        resolve({
          success: false,
          output: stdout,
          error: `Codex CLI timed out after ${opts.timeoutMs / 1000}s`,
        }),
      )
    }, opts.timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        settle(() =>
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Codex CLI exited with code ${code}`,
          }),
        )
        return
      }
      settle(() => resolve({ success: true, output: stdout }))
    })

    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (err.code === 'EPIPE') {
        settle(() =>
          resolve({
            success: false,
            output: '',
            error: `EpipeError: LLM CLI closed stdin before prompt fully written (site=packages/fix/codex-cli-fix.ts, ${payloadBytes} bytes)`,
          }),
        )
        return
      }
      child.kill('SIGTERM')
      settle(() =>
        resolve({
          success: false,
          output: '',
          error: `stdin error: ${err.message}`,
        }),
      )
    })

    child.stdin.write(opts.prompt)
    child.stdin.end()
  })
}
