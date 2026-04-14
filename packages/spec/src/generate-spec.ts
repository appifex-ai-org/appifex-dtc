import type { DesignSpec, Platform } from '@appifex/core'

const SPEC_PROMPT = `You are a mobile app design architect. Generate a detailed design spec as JSON for the following app.

## App Description
{prompt}

## Platform
{platform}

## Output Format
Respond with ONLY a valid JSON object matching this schema (no markdown, no explanation):
{
  "version": "1.0",
  "screens": [
    {
      "id": "screen-<name>",
      "name": "Human Readable Name",
      "description": "What this screen does",
      "components": [
        {
          "id": "comp-<name>",
          "type": "view|text|image|button|input|list|card|icon|tab-bar|navigation-bar|scroll-view|modal|custom",
          "name": "ComponentName",
          "props": {},
          "children": [],
          "style": { "fontSize": 16, "padding": { "top": 8 } }
        }
      ],
      "layout": { "type": "stack", "direction": "vertical", "spacing": 16 }
    }
  ],
  "designTokens": {
    "colors": { "primary": "#hex", "background": "#hex", "text": "#hex" },
    "typography": { "heading": { "fontFamily": "System", "fontSize": 24, "fontWeight": "bold" } },
    "spacing": { "sm": 8, "md": 16, "lg": 24 },
    "borderRadius": { "sm": 8, "md": 12, "lg": 16 }
  },
  "navigation": { "type": "tab|stack", "routes": [{ "screenId": "screen-<name>", "path": "/<path>" }] }
}

Generate a complete, realistic design spec with multiple screens, proper component hierarchy, and design tokens. Every interactive element must have a unique id.`

const IMAGE_SPEC_PROMPT = `You are a mobile app design architect. You are given a design mockup image. Your job is to extract a PRECISE spec from what you SEE in the image.

## App Description
{prompt}

## Platform
{platform}

## CRITICAL INSTRUCTIONS FOR READING THE DESIGN IMAGE

Study the attached design image carefully and extract EXACTLY what you see:

1. **Count every screen** — if the image shows 5 screens, create 5 screen entries. Do NOT simplify to fewer.
2. **Extract the EXACT color scheme** — use an eyedropper approach. What is the primary/accent color? Is it blue (#007AFF), green (#2D5A3D), sage (#6B8E6B), orange, purple? Look carefully — do NOT default to blue.
3. **Identify the navigation pattern** — does it show a tab bar at the bottom? How many tabs? What are the tab labels and icons? Is it a NavigationStack with back buttons?
4. **List every component** in each screen — buttons, text fields, lists, cards, toggles, images, icons, badges, progress indicators, segmented controls, etc.
5. **Note visual details** — rounded corners, shadows, card styles, spacing, background colors for sections, icon styles (SF Symbols vs custom), badge colors, separator styles
6. **Identify modals/sheets** — if a screen shows a modal overlay or bottom sheet, create a separate screen entry for it

## Output Format
Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "version": "1.0",
  "screens": [
    {
      "id": "screen-<name>",
      "name": "Human Readable Name",
      "description": "Detailed description of what this screen shows and does",
      "components": [
        {
          "id": "comp-<unique-name>",
          "type": "view|text|image|button|input|list|card|icon|tab-bar|navigation-bar|scroll-view|modal|custom",
          "name": "ComponentName",
          "props": { "label": "Button Label", "placeholder": "Input placeholder" },
          "children": [],
          "style": { "fontSize": 16, "backgroundColor": "#hex", "color": "#hex" }
        }
      ],
      "layout": { "type": "stack", "direction": "vertical", "spacing": 16 }
    }
  ],
  "designTokens": {
    "colors": {
      "primary": "#exact-hex-from-design",
      "background": "#exact-hex-from-design",
      "surface": "#exact-hex-from-design",
      "text": "#exact-hex-from-design",
      "textSecondary": "#hex",
      "accent": "#hex"
    },
    "typography": {
      "largeTitle": { "fontFamily": "System", "fontSize": 34, "fontWeight": "bold" },
      "heading": { "fontFamily": "System", "fontSize": 22, "fontWeight": "700" },
      "body": { "fontFamily": "System", "fontSize": 16, "fontWeight": "400" }
    },
    "spacing": { "sm": 8, "md": 16, "lg": 24 },
    "borderRadius": { "sm": 8, "md": 12, "lg": 16 }
  },
  "navigation": {
    "type": "tab|stack|drawer",
    "routes": [{ "screenId": "screen-<name>", "path": "/<path>" }]
  }
}

IMPORTANT: The designTokens.colors MUST reflect the actual colors in the design image, NOT generic iOS defaults. If the design uses green as primary, write green. If it uses purple, write purple.`

interface MessageCreateParams {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: string }>
}

interface MessageResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

export type CreateMessageFn = (params: MessageCreateParams) => Promise<MessageResponse>

export interface GenerateSpecOpts {
  prompt: string
  platform: Platform
  createMessage: CreateMessageFn
  model?: string
  /** Additional prompt content from skills */
  skillPrompt?: string
  /** Design image path — if provided, spec is generated from the image */
  designImagePath?: string
  /** Output directory for debug logging */
  outputDir?: string
}

/** Extract the outermost JSON object from LLM text that may include markdown fences */
function extractJson(text: string): string {
  // Strip markdown code fences
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')

  // Find the first { and match braces to find the complete object
  const start = cleaned.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in response')

  let depth = 0
  let end = -1
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) throw new Error('Unclosed JSON object in response')

  let json = cleaned.slice(start, end + 1)

  // Fix trailing commas before } or ] (common LLM mistake)
  json = json.replace(/,\s*([}\]])/g, '$1')

  return json
}

export async function generateSpecFromPrompt(opts: GenerateSpecOpts): Promise<{ spec: DesignSpec; tokensUsed: number }> {
  // Use the image-specific prompt when a design image is provided
  const template = opts.designImagePath ? IMAGE_SPEC_PROMPT : SPEC_PROMPT

  let filledPrompt = template
    .replace('{prompt}', opts.prompt)
    .replace('{platform}', opts.platform)

  if (opts.skillPrompt) {
    filledPrompt = `${opts.skillPrompt}\n\n${filledPrompt}`
  }

  // Build message content — include image when a design image path is provided
  let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = filledPrompt
  if (opts.designImagePath) {
    const { readFileSync, statSync } = await import('node:fs')
    const stat = statSync(opts.designImagePath)
    if (stat.size === 0) {
      throw new Error(`Design image is empty: ${opts.designImagePath}`)
    }
    const imageBuffer = readFileSync(opts.designImagePath)
    const base64 = imageBuffer.toString('base64')
    const mimeType = opts.designImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
    messageContent = [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      { type: 'text', text: filledPrompt },
    ]
  }

  // Log prompt and message shape for debugging
  if (opts.outputDir) {
    try {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(`${opts.outputDir}/spec-prompt.md`, filledPrompt, 'utf-8')
      // Log whether image was included in message content
      const contentShape = Array.isArray(messageContent)
        ? messageContent.map(p => ({ type: p.type, hasImage: !!p.image_url, textLen: p.text?.length ?? 0 }))
        : 'string'
      writeFileSync(`${opts.outputDir}/spec-message-shape.json`, JSON.stringify(contentShape, null, 2), 'utf-8')
    } catch { /* ignore */ }
  }

  const maxAttempts = 2
  let lastError: Error | undefined
  let totalTokens = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await opts.createMessage({
      model: opts.model ?? 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      messages: [{ role: 'user', content: messageContent as any }],
    })

    totalTokens += response.usage.input_tokens + response.usage.output_tokens
    const text = response.content.find(c => c.type === 'text')?.text ?? ''

    // Always log response for debugging (spec failures are hard to diagnose without it)
    if (opts.outputDir) {
      try {
        const { writeFileSync } = await import('node:fs')
        const suffix = attempt > 0 ? `.attempt${attempt + 1}` : ''
        writeFileSync(`${opts.outputDir}/spec-response${suffix}.txt`, text || '[empty response]', 'utf-8')
      } catch { /* ignore */ }
    }

    try {
      const json = extractJson(text)
      const spec = JSON.parse(json) as DesignSpec
      if (!Array.isArray(spec.screens) || spec.screens.length === 0) {
        throw new Error('Generated spec has no screens')
      }
      return { spec, tokensUsed: totalTokens }
    } catch (e) {
      const preview = text ? text.slice(0, 200) : '[empty response]'
      lastError = new Error(
        `Failed to parse design spec JSON (attempt ${attempt + 1}/${maxAttempts}): ${e instanceof Error ? e.message : e}\nResponse preview: ${preview}`
      )
      // Retry once — LLMs occasionally produce preamble or empty responses
    }
  }

  throw lastError!
}
