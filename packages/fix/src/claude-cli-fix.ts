import { spawn } from 'node:child_process'
import type { ModifiedScreens, Platform, Runner, TokenBudget } from '@appifex/core'
import { buildNavGraph, rankFixContext, scanProject } from '@appifex/analysis'
import type { ValidationResult } from '@appifex/validate'
import type { FixFnResult } from './fix-loop.js'

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
      // Build error summary
      const errorLines: string[] = []

      if (failures.unit.failures.length > 0) {
        errorLines.push('## Build/Unit Test Errors:')
        for (const f of failures.unit.failures) {
          errorLines.push(`- ${f.suiteName}/${f.testName}: ${f.error}`)
        }
      }

      if (failures.ui.results) {
        const uiFails = failures.ui.results.filter((r) => !r.passed)
        if (uiFails.length > 0) {
          errorLines.push('\n## UI Test (Maestro) Failures:')
          for (const f of uiFails) {
            errorLines.push(`- ${f.flowName}: ${f.error ?? 'FAILED'}`)
          }
        }
      }

      if (failures.security?.findings && failures.security.findings.length > 0) {
        errorLines.push('\n## Security Findings (MUST FIX):')
        for (const f of failures.security.findings) {
          errorLines.push(`- [${f.severity}] ${f.ruleId}: ${f.file}:${f.line} — ${f.message}`)
        }
      }

      // Read Maestro flow files for context
      const flowFiles: string[] = []
      try {
        const flows = await opts.runner.glob(`${opts.projectDir}/.maestro/**/*.yaml`)
        for (const flow of flows.slice(0, 10)) {
          const content = await opts.runner.readFile(flow)
          flowFiles.push(`## ${flow}\n${content}`)
        }
      } catch {
        /* no flows */
      }

      // Phase 6 (VAL-02 D-10): advisory ranker hint. Claude CLI has its own file-search tools,
      // but prepending the ranker's top-N guess saves round-trips by starting from likely targets.
      // MUST be computed BEFORE the `prompt` const below so it can be prepended at write time.
      let rankerHint = ''
      try {
        const platform: Platform = opts.platform ?? 'swiftui'
        const modifiedScreens: ModifiedScreens = opts.modifiedScreens ?? { added: [], modified: [] }
        const remainingTokens = opts.tokenBudget?.totalRemaining ?? Infinity
        const inventory = await scanProject(opts.projectDir, platform, opts.runner)
        const navGraph = await buildNavGraph(opts.projectDir, platform, opts.runner)
        let flowYaml: string | undefined
        try {
          flowYaml = await opts.runner.readFile(`${opts.projectDir}/.maestro/e2e/e2e-gate.yaml`)
        } catch {
          flowYaml = undefined
        }
        const ranked = await rankFixContext({
          failures,
          modifiedScreens,
          navGraph,
          inventory,
          flowYaml,
          projectDir: opts.projectDir,
          runner: opts.runner,
          platform,
          remainingTokens,
        })
        if (ranked.files.length > 0) {
          rankerHint = `\n## Files likely relevant to this fix\n${ranked.files.map((f) => `- ${f}`).join('\n')}\n\n`
        }
      } catch {
        // Advisory only — failure to compute the hint MUST NOT break the shell-out path.
        rankerHint = ''
      }

      const prompt = `Fix the following errors in this project. Read the failing source files, fix them, and write the fixes.

${errorLines.join('\n')}

${flowFiles.length > 0 ? `## Maestro Test Flows (these define what accessibilityIdentifier values are expected):\n${flowFiles.join('\n\n')}` : ''}

## Instructions
- Read the relevant source files in this project
- Fix the errors described above
- Write the fixed files back
- If Maestro tests expect accessibilityIdentifier values, make sure they exist in the code
- Do not ask questions. Just fix the code.`

      // Phase 6 (VAL-02 D-10): prepend the advisory hint to the final prompt fed to the Claude CLI.
      // `prompt` stays immutable for clearer bisection if the hint misbehaves.
      const finalPrompt = rankerHint + prompt

      const result = await new Promise<{ success: boolean; output: string; error?: string }>(
        (resolve) => {
          const args = [
            '--model',
            model,
            '--max-budget-usd',
            '3',
            '--allowedTools',
            'Edit,Write,Read,Bash(safe_mode=true),Glob,Grep',
            '--dangerously-skip-permissions',
          ]

          const child = spawn('claude', args, {
            cwd: opts.projectDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
          })

          // Phase 02 Plan 03 (FOUND-03): surface EPIPE in the failure envelope instead of silent swallow.
          // Phase 6 (VAL-02 D-10): byte count reflects the prompt actually sent (final prompt incl. ranker hint).
          const payloadBytes = Buffer.byteLength(finalPrompt, 'utf8')
          let settled = false
          const settle = (fn: () => void) => {
            if (!settled) {
              settled = true
              fn()
            }
          }
          // Phase 02 Plan 04 (WR-05): order matters: register 'error' BEFORE write()
          child.stdin.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EPIPE') {
              settle(() =>
                resolve({
                  success: false,
                  output: '',
                  error: `EpipeError: LLM CLI closed stdin before prompt fully written (site=packages/fix/claude-cli-fix.ts, ${payloadBytes} bytes)`,
                }),
              )
              return
            }
            // Phase 02 Plan 04 (WR-03): non-EPIPE stdin errors — kill child promptly to avoid runaway LLM cost
            child.kill('SIGTERM')
            settle(() =>
              resolve({
                success: false,
                output: '',
                error: `stdin error: ${err.message}`,
              }),
            )
          })

          // Pipe prompt via stdin to avoid OS arg length limits
          // Phase 6 (VAL-02 D-10): write finalPrompt (includes ranker hint prepended to original prompt)
          child.stdin.write(finalPrompt)
          child.stdin.end()

          let stdout = ''
          let stderr = ''
          child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString()
          })
          child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })

          const timer = setTimeout(() => {
            child.kill('SIGTERM')
            settle(() =>
              resolve({
                success: false,
                output: stdout,
                error: `Claude CLI timed out after ${timeoutMs / 1000}s`,
              }),
            )
          }, timeoutMs)

          child.on('close', (code) => {
            clearTimeout(timer)
            if (code !== 0) {
              settle(() =>
                resolve({
                  success: false,
                  output: stdout,
                  error: stderr || `Claude CLI exited with code ${code}`,
                }),
              )
            } else {
              settle(() => resolve({ success: true, output: stdout }))
            }
          })
        },
      )

      if (!result.success) {
        throw new Error(result.error ?? 'Claude CLI fix failed')
      }

      // Detect which files Claude actually changed
      const diffResult = await opts.runner.exec('git', ['diff', '--name-only'], {
        cwd: opts.projectDir,
      })
      const untrackedResult = await opts.runner.exec(
        'git',
        ['ls-files', '--others', '--exclude-standard'],
        { cwd: opts.projectDir },
      )
      const changedFiles = [
        ...diffResult.stdout.trim().split('\n').filter(Boolean),
        ...untrackedResult.stdout.trim().split('\n').filter(Boolean),
      ]

      return { filesChanged: changedFiles, tokensUsed: 0 }
    } catch (err) {
      // Re-throw so fix loop sees the failure
      throw err
    }
  }
}
