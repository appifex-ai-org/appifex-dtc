// Phase 6 (VAL-02 D-07 D-08 D-09 D-10): ranker-driven context selection replaces the
// indiscriminate first-10-glob + type-grep fallback.
// Phase 6 (VAL-03 D-11 D-12 D-13 D-14): Anthropic tool-use (structured outputs) replaces
// the legacy delimiter regex + JSON extractor. Tool-use is GA (no beta header).
// Phase 1 Plan 01-10 (GATE-02): `isFixtureMode() → loadFixture('fix')` short-circuit preserved
// verbatim at `createMessage` — text-only fixtures cleanly fall through to the D-13 empty-fix path.
import { isFixtureMode, loadFixture } from '@appifex/core'
import type { ModifiedScreens, Platform, Runner, TokenBudget } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'
import { buildNavGraph, rankFixContext, scanProject } from '@appifex/analysis'
import type { FixFnResult } from './fix-loop.js'

// Phase 6 (VAL-03): the PUBLIC CreateMessageFn accepts a structurally-permissive content
// block shape so pipeline.ts's existing `buildCreateMessageFn` (which returns the legacy
// `{ type: string; text: string }` shape) keeps compiling without any edits. The parser below
// narrows each block at runtime via `c.type === 'tool_use' && c.name === 'submit_fixes'`.
// MODULE-LOCAL — no exports across the package boundary.
interface FixResponseContent {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}

interface FixResponse {
  content: FixResponseContent[]
  usage: { input_tokens: number; output_tokens: number }
}

interface MessageCreateParams {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: string }>
  tools?: unknown
  tool_choice?: unknown
}

type CreateMessageFn = (params: MessageCreateParams) => Promise<FixResponse>

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
  // Phase 6 (VAL-02 D-07 D-10): ranker inputs — ALL OPTIONAL, sane fallbacks.
  // Existing cli/src/pipeline.ts call sites (2982, 3340, 3398, 3477) continue to compile
  // without modification. Non-breaking extension — matches `model?: string` pattern.
  modifiedScreens?: ModifiedScreens
  tokenBudget?: TokenBudget
  platform?: Platform
}

// Phase 6 (VAL-03 D-11, D-14): structured outputs via tool-use. input_schema is JSON Schema.
// `tool_choice: { type: 'tool', name: 'submit_fixes' }` at call site FORCES the model to emit
// exactly one tool_use block with this schema. See 06-RESEARCH.md §"Anthropic SDK Tool-Use".
const SUBMIT_FIXES_TOOL = {
  name: 'submit_fixes',
  description:
    'Submit a list of files to overwrite with fixed content. Each entry must include the ' +
    'full relative path (Sources/... or src/...) and the COMPLETE fixed file content. Only ' +
    'include files that actually need changes. Do not include reasoning or commentary.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fixes: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string' as const,
              description:
                'Full relative file path from project root, e.g. Sources/Views/LoginView.swift',
            },
            content: {
              type: 'string' as const,
              description: 'Complete fixed file content — not a diff, not a snippet',
            },
          },
          required: ['path', 'content'],
        },
      },
    },
    required: ['fixes'],
  },
} as const

function buildFixPrompt(
  failures: ValidationResult,
  failingFilesCode: string,
  skillPrompt?: string,
): string {
  const uiFailures = failures.ui.results
    .filter((r) => !r.passed)
    .map((r) => `- UI: ${r.flowName}: ${r.error}`)
    .join('\n')

  const unitFailures = failures.unit.failures
    .map((f) => `- ${f.suiteName}: ${f.testName}: ${f.error}`)
    .join('\n')

  const securityFindings =
    failures.security?.findings
      ?.map((f) => `- SECURITY [${f.severity}] ${f.ruleId}: ${f.file}:${f.line} — ${f.message}`)
      ?.join('\n') ?? ''

  const hierarchy = failures.ui.hierarchy
    ? `\n## Actual iOS Accessibility Hierarchy (what Maestro sees at runtime)\n\`\`\`\n${failures.ui.hierarchy}\n\`\`\`\nUse resource-id values to understand which identifiers Maestro can discover. If an expected id is missing, the .accessibilityIdentifier() is not working — likely hidden by a container identifier or .accessibilityElement().\n`
    : ''

  return `Fix the following errors. Call the submit_fixes tool with every file that must change.

## Errors
${uiFailures}
${unitFailures}
${securityFindings ? `\n## Security Findings (MUST FIX)\n${securityFindings}` : ''}
${hierarchy}

## Files with errors (only these need fixing)
${failingFilesCode}

## Rules
- Fix ONLY what's needed to resolve the errors above
- Return COMPLETE fixed file content (not just the changed lines) via the submit_fixes tool
- Preserve all existing accessibilityIdentifier/testID values
- For Swift: keep paths starting with Sources/
- For web: keep paths starting with src/

## UI Test Failures (Maestro)
When a UI test fails with "id: X is visible" or "Assertion is false: id: X is visible":
- The Maestro flow expects an accessibility identifier "X" to exist in the view
- SwiftUI: add .accessibilityIdentifier("X") to the corresponding view/component
- Kotlin Compose: add Modifier.testTag("X") to the corresponding composable
- Match the identifier EXACTLY as shown in the error (case-sensitive)
- Every view mentioned in the Maestro flow MUST have its accessibility identifier set
- NEVER use .accessibilityElement() anywhere — no .ignore, .combine, or any variant. It breaks Maestro. Just use .accessibilityIdentifier() alone.

${
  skillPrompt
    ? skillPrompt
    : `## Common Swift fixes (apply if relevant)
- Codable with UUID default: add explicit CodingKeys enum or use custom init(from:)
- 'does not conform to Decodable/Encodable': add CodingKeys or remove Codable
- 'does not conform to Hashable': add Hashable conformance or use id for comparison
- Type shadowing Swift.Task: rename to TodoTask, AppTask, etc.
- Missing import: add 'import SwiftUI' or 'import Foundation'
- @Published in struct: use @Observable class or @State in view`
}

## Output
Call the submit_fixes tool with a \`fixes\` array. Only include files that need changes. Use the exact file paths from the Current Code section above.`
}

export function createDefaultFixFn(
  opts: DefaultFixOpts,
): (failures: ValidationResult) => Promise<FixFnResult> {
  const model = opts.model ?? 'claude-sonnet-4-20250514'

  const createMessage: CreateMessageFn =
    opts.createMessage ??
    (async (params) => {
      // Phase 1 Plan 01-10 (GATE-02): fixture-replay short-circuit PRESERVED VERBATIM.
      // Fixture shape is `{ content: Array<{ type: string; text: string }>, usage: {...} }`.
      // Under the new tool-use parser the text-only content produces no tool_use block, so the
      // D-13 empty-fix fallback returns `{ filesChanged: [], tokensUsed: 0 }` — GATE-02's contract.
      if (isFixtureMode()) return loadFixture('fix') as unknown as FixResponse
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: opts.apiKey })
      // Use streaming to avoid timeout on long-running requests
      const stream = client.messages.stream(params as Parameters<typeof client.messages.stream>[0])
      const finalMessage = await stream.finalMessage()
      // Phase 6 (VAL-03): preserve tool_use blocks in the returned content so the downstream parser
      // can find them. Text + tool_use are the only content-block kinds we care about here.
      const mapped: FixResponseContent[] = []
      for (const c of finalMessage.content) {
        if (c.type === 'text') mapped.push({ type: 'text', text: c.text })
        else if (c.type === 'tool_use')
          mapped.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input })
      }
      return { content: mapped, usage: finalMessage.usage }
    })

  return async (failures: ValidationResult): Promise<FixFnResult> => {
    try {
      // Phase 6 (VAL-02 D-07 D-10): resolve optional ranker inputs against defaults.
      // Matches the existing `opts.model ?? '...'` convention above.
      const platform: Platform = opts.platform ?? 'swiftui'
      const modifiedScreens: ModifiedScreens =
        opts.modifiedScreens ?? { added: [], modified: [] }
      const remainingTokens = opts.tokenBudget?.totalRemaining ?? Infinity

      // Phase 6 (VAL-02 D-07 D-10): ranker-driven context selection.
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

      // Phase 6 (VAL-02, Pitfall 4): N=0 short-circuit — don't waste an LLM call with no context.
      if (ranked.files.length === 0 && ranked.maxFiles === 0) {
        return { filesChanged: [], tokensUsed: 0 }
      }

      const errorFiles = new Set<string>(ranked.files)

      // Read only the ranker-selected files
      const codeChunks: string[] = []
      for (const file of errorFiles) {
        const fullPath = file.startsWith('/') ? file : `${opts.projectDir}/${file}`
        try {
          const content = await opts.runner.readFile(fullPath)
          codeChunks.push(`// ${file}\n${content}`)
        } catch {
          /* file may not exist */
        }
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
        } catch {
          /* ignore */
        }
      }

      const response = await createMessage({
        model,
        max_tokens: 16384,
        messages: [{ role: 'user', content: fixPromptText }],
        tools: [SUBMIT_FIXES_TOOL],
        tool_choice: { type: 'tool', name: 'submit_fixes' },
      })

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

      // Log fix response for debugging
      if (opts.verbose) {
        try {
          const { appendFileSync } = await import('node:fs')
          const debugText = JSON.stringify(response.content, null, 2)
          appendFileSync(`${opts.projectDir}/fix-prompts.log`, `\n--- RESPONSE ---\n${debugText}\n`)
        } catch {
          /* ignore */
        }
      }

      // Phase 6 (VAL-03 D-11 D-13): parse tool_use block. No delimiter, no JSON fallback.
      // Runtime narrow — `FixResponseContent` is a permissive shape at the type level so
      // pipeline.ts's legacy `createMessage` keeps compiling; the `&& c.name === 'submit_fixes'`
      // guards against non-tool_use blocks and foreign tool calls.
      const toolUse = response.content.find(
        (c) => c.type === 'tool_use' && c.name === 'submit_fixes',
      )
      if (!toolUse) {
        return { filesChanged: [], tokensUsed }
      }
      const toolInput = toolUse.input as { fixes?: Array<{ path: string; content: string }> }
      const fixes = Array.isArray(toolInput.fixes) ? toolInput.fixes : []
      if (fixes.length === 0) {
        return { filesChanged: [], tokensUsed }
      }

      // Phase 6 (VAL-03, Pitfall 1): path-traversal guard on tool-use input.
      // Reject: absolute paths, `..` segments, and paths outside the four allowed prefixes.
      // Rejected entries are silently skipped (no write, no throw) — see 06-threat register T-6-05-a.
      const ALLOWED_PREFIXES = ['Sources/', 'src/', '__tests__/', '.maestro/'] as const
      const filesChanged: string[] = []
      for (const fix of fixes) {
        if (typeof fix.path !== 'string' || typeof fix.content !== 'string') continue
        if (fix.path.includes('..') || fix.path.startsWith('/')) continue
        if (!ALLOWED_PREFIXES.some((p) => fix.path.startsWith(p))) continue
        const fullPath = `${opts.projectDir}/${fix.path}`
        await opts.runner.writeFile(fullPath, fix.content)
        filesChanged.push(fullPath)
      }

      return { filesChanged, tokensUsed }
    } catch {
      return { filesChanged: [], tokensUsed: 0 }
    }
  }
}
