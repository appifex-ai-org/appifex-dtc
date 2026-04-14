import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseDesignMd, extractSpecFromStitch } from '../src/stitch-extractor.js'
import type { CreateMessageFn } from '../src/generate-spec.js'

/** Minimal 1x1 transparent PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Build a mock createMessage that returns a canned spec JSON */
function mockCreateMessage(specJson: Record<string, unknown>): CreateMessageFn {
  return vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(specJson) }],
    usage: { input_tokens: 100, output_tokens: 200 },
  })
}

describe('parseDesignMd', () => {
  it('extracts hex colors from Colors section', () => {
    const md = `# Design System
## Colors
- **primary**: #FF5733
- **background**: #FFFFFF
- **accent**: #00D632
`
    const tokens = parseDesignMd(md)
    expect(tokens.colors).toEqual({
      primary: '#FF5733',
      background: '#FFFFFF',
      accent: '#00D632',
    })
  })

  it('extracts typography tokens', () => {
    const md = `# Design System
## Typography
- **heading**: Inter, 24px, bold
- **body**: Inter, 16px, 400
- **caption**: SF Pro, 12px, 300
`
    const tokens = parseDesignMd(md)
    expect(tokens.typography.heading).toEqual({
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 'bold',
    })
    expect(tokens.typography.body).toEqual({
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '400',
    })
    expect(tokens.typography.caption).toEqual({
      fontFamily: 'SF Pro',
      fontSize: 12,
      fontWeight: '300',
    })
  })

  it('extracts spacing and border radius values', () => {
    const md = `# Design System
## Spacing
- **sm**: 8
- **md**: 16
- **lg**: 24
## Components
- **border-radius-sm**: 4
- **border-radius-md**: 8
- **border-radius-lg**: 16
`
    const tokens = parseDesignMd(md)
    expect(tokens.spacing).toEqual({ sm: 8, md: 16, lg: 24 })
    expect(tokens.borderRadius).toEqual({
      'border-radius-sm': 4,
      'border-radius-md': 8,
      'border-radius-lg': 16,
    })
  })

  it('returns empty tokens for missing sections', () => {
    const md = `## Colors
- **primary**: #000000
`
    const tokens = parseDesignMd(md)
    expect(tokens.colors).toEqual({ primary: '#000000' })
    expect(tokens.typography).toEqual({})
    expect(tokens.spacing).toEqual({})
    expect(tokens.borderRadius).toEqual({})
  })

  it('handles empty string gracefully', () => {
    const tokens = parseDesignMd('')
    expect(tokens.colors).toEqual({})
    expect(tokens.typography).toEqual({})
    expect(tokens.spacing).toEqual({})
    expect(tokens.borderRadius).toEqual({})
  })

  it('handles varied markdown formatting', () => {
    const md = `## Colors
primary: #111111
secondary: #222222
- accent: #333333
- **surface**: #444444

## Spacing
sm: 4
- **md**: 12
lg: 32
`
    const tokens = parseDesignMd(md)
    expect(tokens.colors.primary).toBe('#111111')
    expect(tokens.colors.secondary).toBe('#222222')
    expect(tokens.colors.accent).toBe('#333333')
    expect(tokens.colors.surface).toBe('#444444')
    expect(tokens.spacing).toEqual({ sm: 4, md: 12, lg: 32 })
  })
})

describe('extractSpecFromStitch', () => {
  let workDir: string

  const cannedSpec = {
    version: '1.0',
    screens: [
      {
        id: 'screen-home',
        name: 'Home',
        description: 'Main screen',
        components: [{ id: 'comp-title', type: 'text', name: 'Title', props: {}, style: {} }],
        layout: { type: 'stack', direction: 'vertical' },
      },
    ],
    designTokens: {
      colors: { primary: '#0000FF' },
      typography: {},
      spacing: {},
      borderRadius: {},
    },
  }

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dtc-stitch-spec-'))
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('returns a DesignSpec with screens from screenshot + prompt', async () => {
    const pngPath = join(workDir, 'screen.png')
    writeFileSync(pngPath, TINY_PNG)

    const createMessage = mockCreateMessage(cannedSpec)
    const result = await extractSpecFromStitch({
      screenshotPaths: [pngPath],
      htmlContents: [],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
      outputDir: workDir,
    })

    expect(result.spec.version).toBe('1.0')
    expect(result.spec.screens).toHaveLength(1)
    expect(result.spec.screens[0].name).toBe('Home')
    expect(result.tokensUsed).toBeGreaterThan(0)
  })

  it('uses deterministic tokens from DESIGN.md over LLM tokens', async () => {
    const pngPath = join(workDir, 'screen.png')
    writeFileSync(pngPath, TINY_PNG)

    const designMd = `## Colors
- **primary**: #FF0000
- **accent**: #00FF00
`
    const createMessage = mockCreateMessage(cannedSpec)
    const result = await extractSpecFromStitch({
      designMdContent: designMd,
      screenshotPaths: [pngPath],
      htmlContents: [],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
      outputDir: workDir,
    })

    // DESIGN.md tokens should override the LLM's #0000FF
    expect(result.spec.designTokens.colors.primary).toBe('#FF0000')
    expect(result.spec.designTokens.colors.accent).toBe('#00FF00')
  })

  it('passes HTML content to LLM prompt', async () => {
    const pngPath = join(workDir, 'screen.png')
    writeFileSync(pngPath, TINY_PNG)

    const createMessage = mockCreateMessage(cannedSpec)
    await extractSpecFromStitch({
      screenshotPaths: [pngPath],
      htmlContents: [{ name: 'login.html', html: '<div class="bg-blue-500">Login</div>' }],
      prompt: 'A login app',
      platform: 'swiftui',
      createMessage,
      outputDir: workDir,
    })

    // Verify the HTML was included in the prompt sent to createMessage
    const callArgs = (createMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const promptText = Array.isArray(callArgs.messages[0].content)
      ? callArgs.messages[0].content.find((c: { type: string }) => c.type === 'text')?.text
      : callArgs.messages[0].content
    expect(promptText).toContain('bg-blue-500')
    expect(promptText).toContain('Login')
  })

  it('works when designMdContent is undefined', async () => {
    const pngPath = join(workDir, 'screen.png')
    writeFileSync(pngPath, TINY_PNG)

    const createMessage = mockCreateMessage(cannedSpec)
    const result = await extractSpecFromStitch({
      screenshotPaths: [pngPath],
      htmlContents: [],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
      outputDir: workDir,
    })

    // LLM tokens used as-is when no DESIGN.md
    expect(result.spec.designTokens.colors.primary).toBe('#0000FF')
  })

  it('works with empty htmlContents', async () => {
    const pngPath = join(workDir, 'screen.png')
    writeFileSync(pngPath, TINY_PNG)

    const createMessage = mockCreateMessage(cannedSpec)
    const result = await extractSpecFromStitch({
      screenshotPaths: [pngPath],
      htmlContents: [],
      prompt: 'A todo app',
      platform: 'kotlin-compose',
      createMessage,
      outputDir: workDir,
    })

    expect(result.spec.screens).toHaveLength(1)
  })
})
