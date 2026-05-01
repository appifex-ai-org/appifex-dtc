import { spawn } from 'node:child_process'
import { relative } from 'node:path'
import type { ModifiedScreens, Platform, Runner, TokenBudget } from '@appifex/core'
import { buildNavGraph, rankFixContext, scanProject } from '@appifex/analysis'
import type { ValidationResult } from '@appifex/validate'

export interface CliFixContextOpts {
  runner: Runner
  projectDir: string
  failures: ValidationResult
  modifiedScreens?: ModifiedScreens
  tokenBudget?: TokenBudget
  platform?: Platform
  extraInstructions?: string[]
}

export interface CliProcessResult {
  success: boolean
  output: string
  error?: string
}

export interface RunCliProcessOpts {
  binary: string
  args: string[]
  cwd: string
  input: string
  timeoutMs: number
  site: string
  label: string
}

export async function snapshotFixableFiles(
  runner: Runner,
  projectDir: string,
): Promise<Map<string, string>> {
  const patterns = [
    `${projectDir}/Sources/**/*.swift`,
    `${projectDir}/src/**/*`,
    `${projectDir}/app/src/main/**/*.kt`,
    `${projectDir}/__tests__/**/*`,
    `${projectDir}/.maestro/**/*.yaml`,
  ]
  const files = new Set<string>()
  for (const pattern of patterns) {
    const matches = await runner.glob(pattern).catch(() => [] as string[])
    for (const match of matches) files.add(match)
  }

  const snapshot = new Map<string, string>()
  for (const file of files) {
    try {
      snapshot.set(toProjectRelative(projectDir, file), await runner.readFile(file))
    } catch {
      /* file may disappear while snapshotting */
    }
  }
  return snapshot
}

export async function detectChangedFiles(
  runner: Runner,
  projectDir: string,
  before: Map<string, string>,
): Promise<string[]> {
  const after = await snapshotFixableFiles(runner, projectDir)
  const changed = new Set<string>()

  for (const [file, content] of after) {
    if (before.get(file) !== content) changed.add(file)
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changed.add(file)
  }

  return Array.from(changed).sort()
}

export async function buildCliFixPrompt(opts: CliFixContextOpts): Promise<string> {
  const errorLines = buildErrorLines(opts.failures)
  const flowFiles = await readMaestroFlows(opts.runner, opts.projectDir)
  const rankerHint = await buildRankerHint(opts)
  const hierarchy = opts.failures.ui.hierarchy
    ? `\n## Actual iOS Accessibility Hierarchy (what Maestro sees at runtime)\n\`\`\`\n${opts.failures.ui.hierarchy}\n\`\`\`\nUse this hierarchy as the source of truth. If an expected id is missing here, Maestro cannot discover it even if the Swift source contains a matching string.\n`
    : ''

  const extra = opts.extraInstructions?.length
    ? `\n${opts.extraInstructions.map((line) => `- ${line}`).join('\n')}`
    : ''

  return `${rankerHint}Fix the following errors in this project. Read the failing source files, fix them, and write the fixes.

${errorLines.join('\n')}

${hierarchy}

${flowFiles.length > 0 ? `## Maestro Test Flows (these define what accessibilityIdentifier values are expected):\n${flowFiles.join('\n\n')}` : ''}

## Instructions
- Read the relevant source files in this project.
- Fix the errors described above.
- Write the fixed files back.
- If Maestro tests expect accessibilityIdentifier values, make sure they exist in the code.
- For SwiftUI, if the source already contains .accessibilityIdentifier("ExpectedId") but Maestro still reports "id: ExpectedId is visible", do not add the same modifier again. Move the identifier to the visible Text/Label/Image inside the Button or control, or rebuild the Button with an explicit label view carrying the identifier.
- Avoid .accessibilityElement(.combine), .accessibilityElement(children: .ignore), or parent identifiers that hide child controls from Maestro.
- If the control is below the fold when the flow checks it, update the .maestro flow to scroll to the element before assertVisible/tapOn.
- If a Maestro flow is invalid or impossible for the current navigation, fix the generated .maestro flow instead of changing correct app code.${extra}
- Do not ask questions. Just fix the code or tests.`
}

export function runCliProcess(opts: RunCliProcessOpts): Promise<CliProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(opts.binary, opts.args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const payloadBytes = Buffer.byteLength(opts.input, 'utf8')
    let settled = false
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true
        fn()
      }
    }

    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        settle(() =>
          resolve({
            success: false,
            output: '',
            error: `EpipeError: LLM CLI closed stdin before prompt fully written (site=${opts.site}, ${payloadBytes} bytes)`,
          }),
        )
        return
      }
      child.kill('SIGTERM')
      settle(() => resolve({ success: false, output: '', error: `stdin error: ${err.message}` }))
    })

    child.stdin.write(opts.input)
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
          error: `${opts.label} timed out after ${opts.timeoutMs / 1000}s`,
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
            error: stderr || `${opts.label} exited with code ${code}`,
          }),
        )
      } else {
        settle(() => resolve({ success: true, output: stdout }))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      settle(() => resolve({ success: false, output: stdout, error: err.message }))
    })
  })
}

function buildErrorLines(failures: ValidationResult): string[] {
  const errorLines: string[] = []

  if (failures.unit.failures.length > 0) {
    errorLines.push('## Build/Unit Test Errors:')
    for (const f of failures.unit.failures) {
      errorLines.push(`- ${f.suiteName}/${f.testName}: ${f.error}`)
    }
  }

  const uiFails = failures.ui.results.filter((r) => !r.passed)
  if (uiFails.length > 0) {
    errorLines.push('\n## UI Test (Maestro) Failures:')
    for (const f of uiFails) {
      errorLines.push(`- ${f.flowName}: ${f.error ?? 'FAILED'}`)
    }
  }

  if (failures.security?.findings && failures.security.findings.length > 0) {
    errorLines.push('\n## Security Findings (MUST FIX):')
    for (const f of failures.security.findings) {
      errorLines.push(`- [${f.severity}] ${f.ruleId}: ${f.file}:${f.line} — ${f.message}`)
    }
  }

  return errorLines
}

async function readMaestroFlows(runner: Runner, projectDir: string): Promise<string[]> {
  const flowFiles: string[] = []
  try {
    const flows = await runner.glob(`${projectDir}/.maestro/**/*.yaml`)
    for (const flow of flows.slice(0, 10)) {
      const content = await runner.readFile(flow)
      flowFiles.push(`## ${flow}\n${content}`)
    }
  } catch {
    /* no flows */
  }
  return flowFiles
}

async function buildRankerHint(opts: CliFixContextOpts): Promise<string> {
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
      failures: opts.failures,
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
      return `\n## Files likely relevant to this fix\n${ranked.files.map((f) => `- ${f}`).join('\n')}\n\n`
    }
  } catch {
    /* advisory only */
  }
  return ''
}

function toProjectRelative(projectDir: string, file: string): string {
  if (!file.startsWith(`${projectDir}/`)) return file
  const rel = relative(projectDir, file)
  return rel.startsWith('..') ? file : rel
}
