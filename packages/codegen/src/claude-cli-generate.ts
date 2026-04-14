import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import type { CodegenInput, CodegenResult, GeneratedFile } from './types.js'

export interface ClaudeCliGenerateOpts {
  /** Model to use (default: claude-sonnet-4-6) */
  model?: string
  /** Timeout in ms (default: 15 min) */
  timeoutMs?: number
}

/**
 * Creates a generate function that shells out to the local `claude` CLI.
 * Requires `claude` to be installed and authenticated.
 */
export function createClaudeCliGenerateFn(opts: ClaudeCliGenerateOpts = {}): (input: CodegenInput) => Promise<CodegenResult> {
  const model = opts.model ?? 'claude-sonnet-4-6'
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000

  return async (input: CodegenInput): Promise<CodegenResult> => {
    try {
      // Ensure output dir exists
      mkdirSync(input.outputDir, { recursive: true })

      const specJson = JSON.stringify(input.spec, null, 2)

      const platformInstructions = input.spec.platform === 'swiftui' ? `
## SwiftUI Project Structure
- All .swift files MUST go in Sources/ directory
- Include a ContentView.swift as the main view
- Do NOT include an @main App entry point (it will be auto-generated)
- Do NOT generate .xcodeproj or project.yml (xcodegen handles it)
- Use .accessibilityIdentifier("X") for EVERY testID in the spec's testIds map
- CRITICAL SwiftUI + Maestro rules for .accessibilityIdentifier():
  1. ONLY put .accessibilityIdentifier() on LEAF/INTERACTIVE views (Button, TextField, Toggle, Text, Image) — NEVER on container views (VStack, HStack, ZStack, NavigationStack)
  2. Container identifiers OVERWRITE child identifiers in the iOS accessibility tree — Maestro can't find children
  3. NEVER use .accessibilityElement() in any form — it breaks Maestro discovery
  4. Every interactive component in the spec's testIds map MUST have .accessibilityIdentifier()
- Include Info.plist in Sources/
` : `
## Kotlin Compose
- Include Modifier.testTag() on all interactive composables
`

      const uiTestsContext = input.uiTestContent?.length
        ? `### UI Tests (Maestro flows)\n${input.uiTestContent.map(t => `**${t.path}:**\n\`\`\`yaml\n${t.content}\n\`\`\``).join('\n\n')}`
        : `UI tests: ${input.uiTestPaths.join(', ')}`

      const unitTestsContext = input.unitTestContent?.length
        ? `### Unit Tests\n${input.unitTestContent.map(t => `**${t.path}:**\n\`\`\`\n${t.content}\n\`\`\``).join('\n\n')}`
        : `Unit tests: ${input.unitTestPaths.join(', ')}`

      const prompt = `You are a senior ${input.spec.platform} developer. Write ALL source files for a complete app.

## 1. Design Image
${input.designImagePath ? `Read the design image at: ${input.designImagePath}
Study EVERY screen. Reproduce the EXACT layout, navigation, components, colors, and typography.
DO NOT simplify — implement every screen and every visual element shown.` : 'No design image — follow the spec below.'}

## 2. Tests (must pass)
${uiTestsContext}
${unitTestsContext}

For each \`assertVisible: id: "X"\` → use \`.accessibilityIdentifier("X")\`
For each \`tapOn: id: "X"\` → element must be interactive (Button, etc.)

## 3. Design Spec
${specJson}

## 4. Architecture (layered)
Generate in this order:
- Layer A: Models in Sources/Models/, Services in Sources/Services/
- Layer B: Views in Sources/Views/, ContentView.swift at Sources/ root
- Layer C: ViewModels in Sources/ViewModels/ connecting views to models
${platformInstructions}

${input.skillPrompt ? `## 5. Code Quality\n${input.skillPrompt}\n` : ''}

Write all files now using the Write tool. Do not ask questions.`

      // Log prompt for debugging
      try {
        writeFileSync(join(input.outputDir, 'codegen-prompt.md'), prompt, 'utf-8')
      } catch { /* ignore */ }

      const result = await runClaude(prompt, input.outputDir, model, timeoutMs)

      if (!result.success) {
        return { success: false, files: [], tokensUsed: 0, error: result.error }
      }

      return { success: true, files: result.files, tokensUsed: 0 }
    } catch (err) {
      return { success: false, files: [], tokensUsed: 0, error: String(err instanceof Error ? err.message : err) }
    }
  }
}

export interface ClaudeCliResult {
  success: boolean
  files: GeneratedFile[]
  output: string
  error?: string
}

/** Recursively collect source files written by Claude CLI */
function collectWrittenFiles(dir: string, baseDir: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const SOURCE_EXTS = /\.(tsx?|jsx?|swift|json|css|yaml|yml)$/
  const SKIP_DIRS = new Set(['node_modules', '.maestro', '__tests__', 'build', '.expo', 'ios', 'android', '.dtc-report'])

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          files.push(...collectWrittenFiles(fullPath, baseDir))
        }
      } else if (SOURCE_EXTS.test(entry.name)) {
        files.push({ path: relative(baseDir, fullPath), content: readFileSync(fullPath, 'utf-8') })
      }
    }
  } catch { /* dir may not exist */ }
  return files
}

export async function runClaude(prompt: string, cwd: string, model: string, timeoutMs: number): Promise<ClaudeCliResult> {
  return new Promise((resolve) => {
    const args = [
      '--model', model,
      '--max-budget-usd', '5',
      '--allowedTools', 'Edit,Write,Read,Bash(safe_mode=true),Glob,Grep',
      '--dangerously-skip-permissions',
    ]

    const child = spawn('claude', args, {
      cwd,
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
      resolve({ success: false, files: [], output: stdout, error: `Claude CLI timed out after ${timeoutMs / 1000}s` })
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const errMsg = [stderr, stdout].filter(Boolean).join('\n').slice(-2000) || `Claude CLI exited with code ${code}`
        resolve({ success: false, files: [], output: stdout, error: errMsg })
      } else {
        // Claude CLI runs in agentic mode — files are written directly to cwd via Write/Edit tools
        const files = collectWrittenFiles(cwd, cwd)
        resolve({ success: true, files, output: stdout })
      }
    })
  })
}
