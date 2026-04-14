import type { Runner } from '@appifex/core'

function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  if (start === -1) throw new Error('No JSON object found')
  let depth = 0
  let end = -1
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('Unclosed JSON object')
  return cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1')
}
import type { ValidationResult } from '@appifex/validate'
import type { FixFnResult } from './fix-loop.js'

interface MessageCreateParams {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: string }>
}

interface MessageResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

type CreateMessageFn = (params: MessageCreateParams) => Promise<MessageResponse>

export interface DefaultFixOpts {
  apiKey: string
  runner: Runner
  projectDir: string
  model?: string
  createMessage?: CreateMessageFn
  /** Additional prompt content from skills (injected by the pipeline) */
  skillPrompt?: string
  /** Enable debug logging of prompts/responses */
  verbose?: boolean
}

function buildFixPrompt(failures: ValidationResult, failingFilesCode: string, skillPrompt?: string): string {
  const uiFailures = failures.ui.results
    .filter(r => !r.passed)
    .map(r => `- UI: ${r.flowName}: ${r.error}`)
    .join('\n')

  const unitFailures = failures.unit.failures
    .map(f => `- ${f.suiteName}: ${f.testName}: ${f.error}`)
    .join('\n')

  const securityFindings = failures.security?.findings
    ?.map(f => `- SECURITY [${f.severity}] ${f.ruleId}: ${f.file}:${f.line} — ${f.message}`)
    ?.join('\n') ?? ''

  const hierarchy = failures.ui.hierarchy
    ? `\n## Actual iOS Accessibility Hierarchy (what Maestro sees at runtime)\n\`\`\`\n${failures.ui.hierarchy}\n\`\`\`\nUse resource-id values to understand which identifiers Maestro can discover. If an expected id is missing, the .accessibilityIdentifier() is not working — likely hidden by a container identifier or .accessibilityElement().\n`
    : ''

  return `Fix the following errors. Only output files that need changes.

## Errors
${uiFailures}
${unitFailures}
${securityFindings ? `\n## Security Findings (MUST FIX)\n${securityFindings}` : ''}
${hierarchy}

## Files with errors (only these need fixing)
${failingFilesCode}

## Rules
- Fix ONLY what's needed to resolve the errors above
- Output the COMPLETE fixed file content (not just the changed lines)
- Preserve all existing accessibilityIdentifier/testID values
- For Swift: keep paths starting with Sources/

## UI Test Failures (Maestro)
When a UI test fails with "id: X is visible" or "Assertion is false: id: X is visible":
- The Maestro flow expects an accessibility identifier "X" to exist in the view
- SwiftUI: add .accessibilityIdentifier("X") to the corresponding view/component
- Kotlin Compose: add Modifier.testTag("X") to the corresponding composable
- Match the identifier EXACTLY as shown in the error (case-sensitive)
- Every view mentioned in the Maestro flow MUST have its accessibility identifier set
- NEVER use .accessibilityElement() anywhere — no .ignore, .combine, or any variant. It breaks Maestro. Just use .accessibilityIdentifier() alone.

${skillPrompt ? skillPrompt : `## Common Swift fixes (apply if relevant)
- Codable with UUID default: add explicit CodingKeys enum or use custom init(from:)
- 'does not conform to Decodable/Encodable': add CodingKeys or remove Codable
- 'does not conform to Hashable': add Hashable conformance or use id for comparison
- Type shadowing Swift.Task: rename to TodoTask, AppTask, etc.
- Missing import: add 'import SwiftUI' or 'import Foundation'
- @Published in struct: use @Observable class or @State in view`}

## Output Format
===FIX: Sources/path/to/File.swift===
complete fixed file content
===END_FIX===

Only include files that need changes. Use the exact file paths from the Current Code section above.`
}

// Keep old JSON format parser as fallback
function buildFixPromptJson(failures: ValidationResult, existingCode: string): string {
  const uiFailures = failures.ui.results
    .filter(r => !r.passed)
    .map(r => `- UI: ${r.flowName}: ${r.error}`)
    .join('\n')

  const unitFailures = failures.unit.failures
    .map(f => `- Unit: ${f.testName}: ${f.error}`)
    .join('\n')

  return `Fix these errors in the code:
${uiFailures}
${unitFailures}

Code:
${existingCode}

Respond with ONLY JSON:
{
  "fixes": [
    { "path": "/full/path/to/file.tsx", "content": "full fixed file content" }
  ]
}

Generate the fixes now.`
}

export function createDefaultFixFn(opts: DefaultFixOpts): (failures: ValidationResult) => Promise<FixFnResult> {
  const model = opts.model ?? 'claude-sonnet-4-20250514'

  const createMessage: CreateMessageFn = opts.createMessage ?? (async (params) => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: opts.apiKey })
    // Use streaming to avoid timeout on long-running requests
    const stream = client.messages.stream(params as Parameters<typeof client.messages.stream>[0])
    const finalMessage = await stream.finalMessage()
    return {
      content: finalMessage.content.map(c => ({ type: c.type, text: c.type === 'text' ? c.text : '' })),
      usage: finalMessage.usage,
    }
  })

  return async (failures: ValidationResult): Promise<FixFnResult> => {
    try {
      // Extract file paths mentioned in errors
      const errorFiles = new Set<string>()
      for (const f of failures.unit.failures) {
        if (f.file) errorFiles.add(f.file)
        const pathMatch = f.error.match(/(Sources\/[^\s:]+|src\/[^\s:]+)/g)
        if (pathMatch) pathMatch.forEach(p => errorFiles.add(p))
      }

      // Add files flagged by Semgrep
      const secFindings = failures.security?.findings ?? []
      for (const f of secFindings) {
        if (f.file) errorFiles.add(f.file)
      }

      // Also find files that reference the failing type (e.g. if Task.swift fails, include files using Task)
      const errorTypeNames = new Set<string>()
      for (const f of failures.unit.failures) {
        const typeMatch = f.error.match(/type '(\w+)'/g)
        if (typeMatch) typeMatch.forEach(m => errorTypeNames.add(m.replace(/type '|'/g, '')))
      }

      if (errorTypeNames.size > 0) {
        const allSwift = await opts.runner.glob(`${opts.projectDir}/Sources/**/*.swift`)
        const allSrc = await opts.runner.glob(`${opts.projectDir}/src/**/*.{ts,tsx}`)
        for (const file of [...allSwift, ...allSrc]) {
          try {
            const content = await opts.runner.readFile(file)
            for (const typeName of errorTypeNames) {
              if (content.includes(typeName)) { errorFiles.add(file); break }
            }
          } catch { /* skip */ }
        }
      }

      // Fallback: read all source if no specific files found
      if (errorFiles.size === 0) {
        const srcFiles = await opts.runner.glob(`${opts.projectDir}/src/**/*.{ts,tsx}`)
        const sourcesFiles = await opts.runner.glob(`${opts.projectDir}/Sources/**/*.swift`)
        for (const f of [...srcFiles, ...sourcesFiles].slice(0, 10)) errorFiles.add(f)
      }

      // Read only the failing files
      const codeChunks: string[] = []
      for (const file of errorFiles) {
        const fullPath = file.startsWith('/') ? file : `${opts.projectDir}/${file}`
        try {
          const content = await opts.runner.readFile(fullPath)
          codeChunks.push(`// ${file}\n${content}`)
        } catch { /* file may not exist */ }
      }
      const failingFilesCode = codeChunks.join('\n\n')
      const fixPromptText = buildFixPrompt(failures, failingFilesCode, opts.skillPrompt)

      // Log fix prompt for debugging
      if (opts.verbose) {
        try {
          const { writeFileSync, appendFileSync, existsSync } = await import('node:fs')
          const logPath = `${opts.projectDir}/fix-prompts.log`
          const header = `\n${'='.repeat(80)}\n## Fix Attempt at ${new Date().toISOString()}\n${'='.repeat(80)}\n`
          if (!existsSync(logPath)) writeFileSync(logPath, '')
          appendFileSync(logPath, header + fixPromptText + '\n')
        } catch { /* ignore */ }
      }

      const response = await createMessage({
        model,
        max_tokens: 16384,
        messages: [{ role: 'user', content: fixPromptText }],
      })

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
      const text = response.content.find(c => c.type === 'text')?.text ?? ''

      // Log fix response for debugging
      if (opts.verbose) {
        try {
          const { appendFileSync } = await import('node:fs')
          appendFileSync(`${opts.projectDir}/fix-prompts.log`, `\n--- RESPONSE ---\n${text}\n`)
        } catch { /* ignore */ }
      }

      // Try 1: Delimiter format ===FIX: path=== ... ===END_FIX===
      const fixes: Array<{ path: string; content: string }> = []
      const fixRegex = /===FIX:\s*(.+?)\s*===([\s\S]*?)===END_FIX===/g
      let fixMatch: RegExpExecArray | null
      while ((fixMatch = fixRegex.exec(text)) !== null) {
        const path = fixMatch[1].trim()
        const content = fixMatch[2].trim()
        if (path && content) fixes.push({ path, content })
      }

      // Try 2: JSON fallback
      if (fixes.length === 0) {
        try {
          const json = extractJson(text)
          const parsed = JSON.parse(json) as { fixes: Array<{ path: string; content: string }> }
          if (Array.isArray(parsed.fixes)) fixes.push(...parsed.fixes)
        } catch { /* ignore */ }
      }

      if (fixes.length === 0) {
        return { filesChanged: [], tokensUsed }
      }

      const filesChanged: string[] = []
      for (const fix of fixes) {
        // Resolve relative paths against project dir
        const fullPath = fix.path.startsWith('/') ? fix.path : `${opts.projectDir}/${fix.path}`
        await opts.runner.writeFile(fullPath, fix.content)
        filesChanged.push(fullPath)
      }

      return { filesChanged, tokensUsed }
    } catch {
      return { filesChanged: [], tokensUsed: 0 }
    }
  }
}
