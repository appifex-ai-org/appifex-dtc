import { spawn } from 'node:child_process'
import type { Runner } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'
import type { FixFnResult } from './fix-loop.js'

export interface ClaudeCliFixOpts {
  runner: Runner
  projectDir: string
  /** Model to use (default: claude-sonnet-4-6) */
  model?: string
  /** Timeout in ms (default: 10 min) */
  timeoutMs?: number
}

/**
 * Creates a fix function that shells out to the local `claude` CLI.
 * Claude reads the project files directly and writes fixes in place.
 */
export function createClaudeCliFixFn(opts: ClaudeCliFixOpts): (failures: ValidationResult) => Promise<FixFnResult> {
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
        const uiFails = failures.ui.results.filter(r => !r.passed)
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
      } catch { /* no flows */ }

      const prompt = `Fix the following errors in this project. Read the failing source files, fix them, and write the fixes.

${errorLines.join('\n')}

${flowFiles.length > 0 ? `## Maestro Test Flows (these define what accessibilityIdentifier values are expected):\n${flowFiles.join('\n\n')}` : ''}

## Instructions
- Read the relevant source files in this project
- Fix the errors described above
- Write the fixed files back
- If Maestro tests expect accessibilityIdentifier values, make sure they exist in the code
- Do not ask questions. Just fix the code.`

      const result = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
        const args = [
          '--model', model,
          '--max-budget-usd', '3',
          '--allowedTools', 'Edit,Write,Read,Bash(safe_mode=true),Glob,Grep',
          '--dangerously-skip-permissions',
        ]

        const child = spawn('claude', args, {
          cwd: opts.projectDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        })

        // Pipe prompt via stdin to avoid OS arg length limits
        child.stdin.write(prompt)
        child.stdin.end()

        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
        child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

        const timer = setTimeout(() => {
          child.kill('SIGTERM')
          resolve({ success: false, output: stdout, error: `Claude CLI timed out after ${timeoutMs / 1000}s` })
        }, timeoutMs)

        child.on('close', (code) => {
          clearTimeout(timer)
          if (code !== 0) {
            resolve({ success: false, output: stdout, error: stderr || `Claude CLI exited with code ${code}` })
          } else {
            resolve({ success: true, output: stdout })
          }
        })
      })

      if (!result.success) {
        throw new Error(result.error ?? 'Claude CLI fix failed')
      }

      // Detect which files Claude actually changed
      const diffResult = await opts.runner.exec('git', ['diff', '--name-only'], { cwd: opts.projectDir })
      const untrackedResult = await opts.runner.exec('git', ['ls-files', '--others', '--exclude-standard'], { cwd: opts.projectDir })
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
