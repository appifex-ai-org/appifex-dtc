import type { CodegenInput, CodegenResult, GeneratedFile } from './types.js'

function parseMarkdownFiles(text: string, platform: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const ext = platform === 'swiftui' ? 'swift' : 'tsx?'

  // Pattern 1: **path/File.swift** followed by code block
  // Pattern 2: `path/File.swift` followed by code block
  // Pattern 3: ### path/File.swift followed by code block
  // Pattern 4: code block with filename comment on first line
  const blockRegex = /(?:(?:\*\*|`|#{1,4}\s*)([^\n*`#]+\.(?:swift|tsx?|ts|js))\s*(?:\*\*|`)?[^\n]*\n)?```(?:swift|typescript|tsx?|javascript)?\n([\s\S]*?)```/g

  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(text)) !== null) {
    let path = match[1]?.trim()
    const content = match[2].trim()

    if (!content) continue

    // If no path found in header, try first line comment: // Sources/File.swift
    if (!path) {
      const firstLine = content.split('\n')[0]
      const commentPath = firstLine.match(/^\/\/\s*(.+\.(?:swift|tsx?|ts|js))\s*$/)
      if (commentPath) {
        path = commentPath[1]
      }
    }

    // Still no path? Generate one from content
    if (!path) {
      const structMatch = content.match(/struct\s+(\w+)|class\s+(\w+)|function\s+(\w+)|export\s+(?:default\s+)?(?:function|class)\s+(\w+)/)
      const name = structMatch?.[1] ?? structMatch?.[2] ?? structMatch?.[3] ?? structMatch?.[4] ?? `File${files.length + 1}`
      path = platform === 'swiftui' ? `Sources/${name}.swift` : `src/${name}.tsx`
    }

    // Ensure Swift files go in Sources/
    if (platform === 'swiftui' && !path.startsWith('Sources/') && path.endsWith('.swift')) {
      path = `Sources/${path}`
    }

    files.push({ path, content })
  }

  return files
}

function parseDelimitedFiles(text: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const regex = /===FILE:\s*(.+?)\s*===([\s\S]*?)===END_FILE===/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim()
    const content = match[2].trim()
    if (path && content) {
      files.push({ path, content })
    }
  }
  return files
}

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

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>

interface MessageCreateParams {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: MessageContent }>
}

interface MessageResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

export type CreateMessageFn = (params: MessageCreateParams) => Promise<MessageResponse>

export interface DefaultGenerateOpts {
  apiKey: string
  model?: string
  createMessage?: CreateMessageFn
}

function buildPromptText(input: CodegenInput): string {
  const specJson = JSON.stringify(input.spec, null, 2)

  // Tests section — the primary contract
  const uiTestsSection = input.uiTestContent?.length
    ? `### UI Tests (Maestro flows)
These Maestro flows WILL be executed against your app. Every \`assertVisible\` checks for an \`accessibilityIdentifier\`. Every \`tapOn\` checks for a tappable element with that identifier.

Your code MUST satisfy every assertion below:

${input.uiTestContent.map(t => `**${t.path}:**\n\`\`\`yaml\n${t.content}\n\`\`\``).join('\n\n')}`
    : ''

  const unitTestsSection = input.unitTestContent?.length
    ? `### Unit Tests
These tests WILL be compiled into the Xcode project and executed. They must compile and pass.

${input.unitTestContent.map(t => `**${t.path}:**\n\`\`\`\n${t.content}\n\`\`\``).join('\n\n')}`
    : ''

  return `You are a test-driven code generation expert. Your PRIMARY goal is to generate code that PASSES ALL TESTS below. The design image is a visual reference — tests are the contract.

## 1. TESTS — The Contract (MUST PASS)

Read every test assertion carefully. Your generated code must satisfy ALL of them.

${uiTestsSection}

${unitTestsSection}

**Test-driven rules:**
- For each \`assertVisible: id: "X"\` in the Maestro flows, your code MUST have a view with \`.accessibilityIdentifier("X")\`
- For each \`tapOn: id: "X"\`, that element MUST be interactive (Button, NavigationLink, etc.)
- For each unit test that calls \`SomeView()\`, that view MUST exist and compile with a no-arg initializer
- If a test references a type or function, it MUST exist in your generated code

## 2. Design Reference

${input.designImagePath ? 'The attached image shows the visual design. Use it as a guide for layout, colors, and styling — but tests take priority over pixel-perfect design matching.\n' : ''}
### Structured Spec
${specJson}

## 3. Platform Rules
- Platform: ${input.spec.platform}
${input.spec.platform === 'swiftui' ? `- All .swift files MUST go in Sources/ directory
- Include a ContentView.swift as the main view
- Do NOT include an @main App entry point (it will be auto-generated)
- Do NOT generate project.yml, Info.plist, or .xcodeproj files (managed by build pipeline)
- Use .accessibilityIdentifier("X") for EVERY testID in the spec's testIds map
- CRITICAL SwiftUI + Maestro rules for .accessibilityIdentifier():
  1. ONLY put .accessibilityIdentifier() on LEAF/INTERACTIVE views (Button, TextField, Toggle, Text, Image) — NEVER on container views (VStack, HStack, ZStack, NavigationStack)
  2. Container identifiers OVERWRITE child identifiers in the iOS accessibility tree — Maestro can't find children
  3. NEVER use .accessibilityElement() in any form — it breaks Maestro discovery
  4. Example: HStack { Button("−"){}.accessibilityIdentifier("Dec") Button("+"){}.accessibilityIdentifier("Inc") } — NO identifier on HStack
  5. Every interactive component in the spec's testIds map MUST have .accessibilityIdentifier()
  6. For display-only components (Text showing a count), wrap in a VStack with NO identifier on the VStack, identifier on the Text
` : `
## Kotlin Compose
- Include Modifier.testTag() on all interactive composables
`}
${input.baasAuthScreens ? `
## Auth Screens (DO NOT MODIFY WIRING)
Auth screens already exist at Sources/Auth/ (LoginView.swift, SignupView.swift, ResetPasswordView.swift, NewPasswordView.swift).
These screens have correct auth SDK wiring that MUST NOT be changed.

Your job for auth screens:
- Match their visual styling (colors, fonts, spacing, border radius) to the rest of the app's design
- You may adjust layout, padding, font sizes, and colors
- Do NOT change: any AuthManager method calls, auth state observation, NavigationLink targets, error handling logic, or deep link handling
- Do NOT add new auth-related imports or remove existing ones
` : ''}
${input.baasContext?.schema ? `
## BaaS Repository Layer

A repository layer has been pre-generated for this app. The following rules MUST be followed:
- Import ONLY from repository protocol types (e.g., \`TodoRepository\`) — NEVER import FirebaseFirestore, Supabase, or any BaaS SDK directly
- Use \`@StateObject\` or \`@EnvironmentObject\` for ViewModel injection
- ViewModels receive repository protocols via constructor injection (not singletons)
- Do NOT generate \`AppEntry.swift\` — it is pre-generated by the BaaS layer
- Do NOT generate \`Sources/Repositories/\` files — they are pre-generated
- Inferred entities: ${input.baasContext.schema.entities.map(e => e.name).join(', ')}
` : ''}
${input.skillPrompt ? `${input.skillPrompt}\n` : ''}## Output Format
Output each file using this exact delimiter format (NOT JSON — use delimiters):

===FILE: Sources/ContentView.swift===
import SwiftUI
// ... full file content ...
===END_FILE===

===FILE: Sources/Models/Task.swift===
import Foundation
// ... full file content ...
===END_FILE===

Generate ALL files needed for a complete, compilable app. Use the delimiter format exactly as shown.`
}

export function createDefaultGenerateFn(opts: DefaultGenerateOpts): (input: CodegenInput) => Promise<CodegenResult> {
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

  return async (input: CodegenInput): Promise<CodegenResult> => {
    try {
      // Build multimodal content if design image is available
      let imageBase64: string | undefined
      let imageMimeType: string | undefined

      if (input.designImagePath) {
        try {
          const { readFileSync } = await import('node:fs')
          const imageBuffer = readFileSync(input.designImagePath)
          imageBase64 = imageBuffer.toString('base64')
          imageMimeType = input.designImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
        } catch { /* image not available */ }
      }

      const textPrompt = buildPromptText(input)

      // Try multimodal first, fall back to text-only
      let response: MessageResponse
      if (imageBase64 && imageMimeType) {
        try {
          // Use OpenAI vision format (works with Gemini OpenAI-compat and OpenAI)
          response = await createMessage({
            model,
            max_tokens: 16384,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
                { type: 'text', text: textPrompt },
              ],
            }],
          })
        } catch {
          // Multimodal not supported — fall back to text with image description
          response = await createMessage({
            model,
            max_tokens: 16384,
            messages: [{ role: 'user', content: textPrompt }],
          })
        }
      } else {
        response = await createMessage({
          model,
          max_tokens: 16384,
          messages: [{ role: 'user', content: textPrompt }],
        })
      }

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
      const text = response.content.find(c => c.type === 'text')?.text ?? ''

      // Save raw response for debugging
      try {
        const { writeFileSync } = await import('node:fs')
        writeFileSync(input.outputDir + '/codegen-response.txt', text, 'utf-8')
      } catch { /* ignore if dir doesn't exist */ }

      // Try 1: Delimiter format ===FILE: path=== ... ===END_FILE===
      let files = parseDelimitedFiles(text)

      // Try 2: Markdown code blocks with filename comments
      // ```swift\n// Sources/File.swift\n...\n```
      if (files.length === 0) {
        files = parseMarkdownFiles(text, input.spec.platform)
      }

      // Try 3: JSON { "files": [...] }
      if (files.length === 0) {
        try {
          const json = extractJson(text)
          const parsed = JSON.parse(json) as { files: GeneratedFile[] }
          if (Array.isArray(parsed.files) && parsed.files.length > 0) {
            files = parsed.files
          }
        } catch { /* ignore */ }
      }

      if (files.length === 0) {
        return { success: false, files: [], tokensUsed, error: 'Could not parse LLM response into files. Raw response saved to codegen-response.txt' }
      }

      return { success: true, files, tokensUsed }
    } catch (err) {
      return { success: false, files: [], tokensUsed: 0, error: String(err instanceof Error ? err.message : err) }
    }
  }
}
