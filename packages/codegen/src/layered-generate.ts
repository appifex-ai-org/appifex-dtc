import type { CodegenInput, CodegenResult, GeneratedFile } from './types.js'
import type { CreateMessageFn } from './default-generate.js'
import { buildLayeredPrompt } from './layered-prompt.js'

function parseDelimitedFiles(text: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const regex = /===FILE:\s*(.+?)\s*===([\s\S]*?)===END_FILE===/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const path = match[1].trim()
    const content = match[2].trim()
    if (path && content) files.push({ path, content })
  }
  return files
}

function parseMarkdownFiles(text: string, platform: string): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const blockRegex = /(?:(?:\*\*|`|#{1,4}\s*)([^\n*`#]+\.(?:swift|tsx?|ts|js))\s*(?:\*\*|`)?[^\n]*\n)?```(?:swift|typescript|tsx?|javascript)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(text)) !== null) {
    let path = match[1]?.trim()
    const content = match[2].trim()
    if (!content) continue
    if (!path) {
      const firstLine = content.split('\n')[0]
      const commentPath = firstLine.match(/^\/\/\s*(.+\.(?:swift|tsx?|ts|js))\s*$/)
      if (commentPath) path = commentPath[1]
    }
    if (!path) {
      const structMatch = content.match(/struct\s+(\w+)|class\s+(\w+)|function\s+(\w+)|export\s+(?:default\s+)?(?:function|class)\s+(\w+)/)
      const name = structMatch?.[1] ?? structMatch?.[2] ?? structMatch?.[3] ?? structMatch?.[4] ?? `File${files.length + 1}`
      path = platform === 'swiftui' ? `Sources/${name}.swift` : `src/${name}.tsx`
    }
    if (platform === 'swiftui' && !path.startsWith('Sources/') && path.endsWith('.swift')) {
      path = `Sources/${path}`
    }
    files.push({ path, content })
  }
  return files
}

function parseFiles(text: string, platform: string): GeneratedFile[] {
  let files = parseDelimitedFiles(text)
  if (files.length === 0) files = parseMarkdownFiles(text, platform)
  return files
}

// ── Layered generate function ──

export interface LayeredGenerateOpts {
  apiKey: string
  model?: string
  createMessage?: CreateMessageFn
}

export interface LayeredCodegenResult extends CodegenResult {
  presentationFiles: GeneratedFile[]
  domainFiles: GeneratedFile[]
  integrationFiles: GeneratedFile[]
  presentationTokens: number
  domainTokens: number
  integrationTokens: number
}

export function createLayeredGenerateFn(opts: LayeredGenerateOpts): (input: CodegenInput) => Promise<LayeredCodegenResult> {
  const model = opts.model ?? 'claude-sonnet-4-20250514'

  const createMessage: CreateMessageFn = opts.createMessage ?? (async (params) => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: opts.apiKey })
    const stream = client.messages.stream(params as Parameters<typeof client.messages.stream>[0])
    const finalMessage = await stream.finalMessage()
    return {
      content: finalMessage.content.map(c => ({ type: c.type, text: c.type === 'text' ? c.text : '' })),
      usage: finalMessage.usage,
    }
  })

  return async (input: CodegenInput): Promise<LayeredCodegenResult> => {
    try {
      // Load design image
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

      // Single LLM call with layered prompt
      const prompt = buildLayeredPrompt(input)

      // Log the full prompt for debugging
      try {
        const { writeFileSync } = await import('node:fs')
        writeFileSync(input.outputDir + '/codegen-prompt.md', prompt, 'utf-8')
      } catch { /* ignore */ }

      let response
      if (imageBase64 && imageMimeType) {
        try {
          response = await createMessage({
            model,
            max_tokens: 32768,
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
                { type: 'text', text: prompt },
              ],
            }],
          })
        } catch {
          response = await createMessage({
            model, max_tokens: 32768,
            messages: [{ role: 'user', content: prompt }],
          })
        }
      } else {
        response = await createMessage({
          model, max_tokens: 32768,
          messages: [{ role: 'user', content: prompt }],
        })
      }

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
      const text = response.content.find(c => c.type === 'text')?.text ?? ''

      // Save raw response for debugging
      try {
        const { writeFileSync } = await import('node:fs')
        writeFileSync(input.outputDir + '/codegen-response.txt', text, 'utf-8')
      } catch { /* ignore */ }

      const allFiles = parseFiles(text, input.spec.platform)

      if (allFiles.length === 0) {
        return {
          success: false, files: [], tokensUsed,
          error: 'Could not parse files from LLM response. Raw response saved to codegen-response.txt',
          presentationFiles: [], domainFiles: [], integrationFiles: [],
          presentationTokens: tokensUsed, domainTokens: 0, integrationTokens: 0,
        }
      }

      // Categorize files by layer for reporting
      const presentationFiles = allFiles.filter(f =>
        f.path.includes('/Views/') || f.path.endsWith('ContentView.swift') ||
        f.path.includes('/screens/') || f.path.includes('/components/'))
      const domainFiles = allFiles.filter(f =>
        f.path.includes('/Models/') || f.path.includes('/Services/') ||
        f.path.includes('/models/') || f.path.includes('/services/'))
      const integrationFiles = allFiles.filter(f =>
        f.path.includes('/ViewModels/') || f.path.includes('/viewmodels/') ||
        f.path.includes('/hooks/'))

      return {
        success: true,
        files: allFiles,
        tokensUsed,
        presentationFiles,
        domainFiles,
        integrationFiles,
        presentationTokens: tokensUsed, // single call — all tokens attributed together
        domainTokens: 0,
        integrationTokens: 0,
      }
    } catch (err) {
      return {
        success: false, files: [], tokensUsed: 0,
        error: String(err instanceof Error ? err.message : err),
        presentationFiles: [], domainFiles: [], integrationFiles: [],
        presentationTokens: 0, domainTokens: 0, integrationTokens: 0,
      }
    }
  }
}
