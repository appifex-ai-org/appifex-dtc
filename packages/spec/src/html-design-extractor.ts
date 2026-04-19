import type { DesignSpec, DesignTokens, Platform, TypographyToken } from '@appifex/core'
// Phase 7 (DESIGN-03): sanitizeLayerName imported for use at raw-name → id boundaries.
// This extractor generates screen IDs via LLM (generateSpecFromPrompt) so direct name→id
// conversion is delegated; sanitization is enforced upstream in StitchAdapter.spec
// and would apply here if deterministic name→id sites are added in future.
import { sanitizeLayerName as _sanitizeLayerName } from '@appifex/design'
import { generateSpecFromPrompt, type CreateMessageFn } from './generate-spec.js'

/**
 * Parse a design-export DESIGN.md file into DesignTokens.
 *
 * Works for any design tool that emits a markdown token sheet — e.g. Google
 * Stitch, Figma Make, Claude Design. Extracts colors (hex values), typography
 * (font families, sizes, weights), spacing (numeric values), and border radius
 * from markdown sections.
 */
export function parseDesignMd(markdown: string): DesignTokens {
  const colors: Record<string, string> = {}
  const typography: Record<string, TypographyToken> = {}
  const spacing: Record<string, number> = {}
  const borderRadius: Record<string, number> = {}

  if (!markdown.trim()) {
    return { colors, typography, spacing, borderRadius }
  }

  // Split into sections by ## headers
  const sections = splitSections(markdown)

  for (const [header, body] of sections) {
    const lower = header.toLowerCase()
    if (lower.includes('color')) {
      parseColors(body, colors)
    } else if (lower.includes('typography') || lower.includes('font')) {
      parseTypography(body, typography)
    } else if (lower.includes('spacing')) {
      parseNumericEntries(body, spacing)
    } else if (
      lower.includes('component') ||
      lower.includes('border') ||
      lower.includes('radius')
    ) {
      parseNumericEntries(body, borderRadius)
    }
  }

  return { colors, typography, spacing, borderRadius }
}

/** Split markdown into [header, body] pairs by ## headers */
function splitSections(md: string): Array<[string, string]> {
  const result: Array<[string, string]> = []
  const lines = md.split('\n')
  let currentHeader = ''
  let currentBody: string[] = []

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/)
    if (headerMatch) {
      if (currentHeader) {
        result.push([currentHeader, currentBody.join('\n')])
      }
      currentHeader = headerMatch[1].trim()
      currentBody = []
    } else if (currentHeader) {
      currentBody.push(line)
    }
  }
  if (currentHeader) {
    result.push([currentHeader, currentBody.join('\n')])
  }
  return result
}

/** Extract color entries: various formats → key: #hex */
function parseColors(body: string, out: Record<string, string>): void {
  // Match patterns like:
  //   - **key**: #hex
  //   - key: #hex
  //   key: #hex
  const regex = /[-*\s]*\**([a-zA-Z][\w-]*)\**\s*[:]\s*(#[0-9A-Fa-f]{3,8})/g
  let match
  while ((match = regex.exec(body)) !== null) {
    out[match[1].trim()] = match[2]
  }
}

/** Extract typography entries: **key**: family, sizepx, weight */
function parseTypography(body: string, out: Record<string, TypographyToken>): void {
  // Match: - **key**: FontFamily, 16px, bold/400
  const regex = /[-*\s]*\**([a-zA-Z][\w-]*)\**\s*[:]\s*([^,]+),\s*(\d+)(?:px)?\s*,\s*(\S+)/g
  let match
  while ((match = regex.exec(body)) !== null) {
    out[match[1].trim()] = {
      fontFamily: match[2].trim(),
      fontSize: parseInt(match[3], 10),
      fontWeight: match[4].trim(),
    }
  }
}

/** Extract numeric entries: key: number */
function parseNumericEntries(body: string, out: Record<string, number>): void {
  const regex = /[-*\s]*\**([a-zA-Z][\w-]*)\**\s*[:]\s*(\d+(?:\.\d+)?)/g
  let match
  while ((match = regex.exec(body)) !== null) {
    out[match[1].trim()] = parseFloat(match[2])
  }
}

// ── HTML Design Spec Extraction ──

export interface ExtractSpecFromHtmlDesignOpts {
  designMdContent?: string
  htmlContents: Array<{ name: string; html: string }>
  screenshotPaths: string[]
  prompt: string
  platform: Platform
  createMessage: CreateMessageFn
  model?: string
  skillPrompt?: string
  outputDir?: string
  /** Whether the LLM provider supports image inputs. Default: true */
  canSendImages?: boolean
}

/**
 * Build a DesignSpec from HTML-based design-export artifacts.
 *
 * Works for any design tool that exports HTML + screenshots (+ optional
 * DESIGN.md) — e.g. Google Stitch, Figma Make "Export HTML", Claude Design
 * "Standalone HTML files".
 *
 * 1. Parse DESIGN.md → DesignTokens (deterministic)
 * 2. Feed PNG + HTML + tokens to LLM → ScreenSpec[] (vision)
 * 3. Merge: use deterministic tokens over LLM-generated tokens
 */
export async function extractSpecFromHtmlDesign(
  opts: ExtractSpecFromHtmlDesignOpts,
): Promise<{ spec: DesignSpec; tokensUsed: number }> {
  // 1. Parse deterministic tokens from DESIGN.md (if available)
  const mdTokens = opts.designMdContent ? parseDesignMd(opts.designMdContent) : undefined

  // 2. Build an enhanced prompt with HTML context
  let enhancedPrompt = opts.prompt
  if (opts.htmlContents.length > 0) {
    const htmlSection = opts.htmlContents
      .map((h) => `### ${h.name}\n\`\`\`html\n${h.html}\n\`\`\``)
      .join('\n\n')
    enhancedPrompt = `${opts.prompt}\n\n## HTML Source from Design Export\n${htmlSection}`
  }
  if (mdTokens) {
    const tokenSummary = Object.entries(mdTokens.colors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    if (tokenSummary) {
      enhancedPrompt += `\n\n## Design Tokens\nColors: ${tokenSummary}`
    }
  }

  // 3. Generate spec via LLM vision using the first screenshot
  const canSendImages = opts.canSendImages !== false
  const designImagePath = canSendImages ? opts.screenshotPaths[0] : undefined
  const result = await generateSpecFromPrompt({
    prompt: enhancedPrompt,
    platform: opts.platform,
    createMessage: opts.createMessage,
    model: opts.model,
    skillPrompt: opts.skillPrompt,
    designImagePath,
    outputDir: opts.outputDir,
  })

  // 4. Merge: deterministic DESIGN.md tokens override LLM tokens
  if (mdTokens) {
    const merged = { ...result.spec.designTokens }
    if (Object.keys(mdTokens.colors).length > 0) {
      merged.colors = { ...merged.colors, ...mdTokens.colors }
    }
    if (Object.keys(mdTokens.typography).length > 0) {
      merged.typography = { ...merged.typography, ...mdTokens.typography }
    }
    if (Object.keys(mdTokens.spacing).length > 0) {
      merged.spacing = { ...merged.spacing, ...mdTokens.spacing }
    }
    if (Object.keys(mdTokens.borderRadius).length > 0) {
      merged.borderRadius = { ...merged.borderRadius, ...mdTokens.borderRadius }
    }
    result.spec.designTokens = merged
  }

  return result
}
