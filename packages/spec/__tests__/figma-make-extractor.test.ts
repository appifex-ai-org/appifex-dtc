import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 1x1 transparent PNG for screenshot mock
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
  'Nl7BcQAAAABJRU5ErkJggg==',
  'base64',
)

function mockCreateMessage(specJson: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(specJson) }],
    usage: { input_tokens: 100, output_tokens: 200 },
  })
}

const cannedSpec = {
  version: '1.0',
  screens: [
    {
      id: 'screen-home',
      name: 'Home',
      description: 'Main screen',
      components: [
        { id: 'comp-title', type: 'text', name: 'Title', props: { label: 'Hello' }, children: [], style: {} },
      ],
      layout: { type: 'stack', direction: 'vertical', spacing: 16 },
    },
    {
      id: 'screen-settings',
      name: 'Settings',
      description: 'Settings screen',
      components: [],
      layout: { type: 'stack', direction: 'vertical', spacing: 16 },
    },
  ],
  designTokens: {
    colors: { primary: '#0000FF', background: '#FFFFFF' },
    typography: { heading: { fontFamily: 'System', fontSize: 24, fontWeight: 'bold' } },
    spacing: { sm: 8, md: 16 },
    borderRadius: { sm: 8 },
  },
  navigation: { type: 'tab', routes: [{ screenId: 'screen-home', path: '/home' }] },
}

describe('extractSpecFromFigmaMake', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'figma-spec-'))
    writeFileSync(join(tmpDir, 'screen-0.png'), TINY_PNG)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('generates spec from Figma code + screenshot via LLM', async () => {
    const { extractSpecFromFigmaMake } = await import('../src/figma-make-extractor.js')
    const createMessage = mockCreateMessage(cannedSpec)

    const result = await extractSpecFromFigmaMake({
      codeContent: '<div class="bg-white p-4"><h1 class="text-2xl font-bold text-blue-600">Hello</h1></div>',
      metadata: { fileName: 'TestApp', nodeCount: 5 },
      screenshotPaths: [join(tmpDir, 'screen-0.png')],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
    })

    expect(result.spec.screens).toHaveLength(2)
    expect(result.spec.screens[0].name).toBe('Home')
    expect(result.tokensUsed).toBeGreaterThan(0)
  })

  it('includes Figma code in the LLM prompt', async () => {
    const { extractSpecFromFigmaMake } = await import('../src/figma-make-extractor.js')
    const createMessage = mockCreateMessage(cannedSpec)
    const figmaCode = '<div class="flex flex-col gap-4"><button class="bg-blue-500">Click</button></div>'

    await extractSpecFromFigmaMake({
      codeContent: figmaCode,
      metadata: {},
      screenshotPaths: [join(tmpDir, 'screen-0.png')],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
    })

    const promptText = createMessage.mock.calls[0][0].messages[0].content
    // Code should be embedded in the prompt (either as string or array with text)
    const textContent = Array.isArray(promptText)
      ? promptText.find((c: any) => c.type === 'text')?.text ?? ''
      : promptText
    expect(textContent).toContain('bg-blue-500')
  })

  it('extracts Tailwind colors from code as design tokens', async () => {
    const { parseTailwindColors } = await import('../src/figma-make-extractor.js')

    const code = `
      <div class="bg-blue-600 text-white">
        <h1 class="text-emerald-500">Title</h1>
        <button class="bg-red-400 hover:bg-red-500">Delete</button>
        <span class="text-gray-700">Subtitle</span>
      </div>
    `
    const colors = parseTailwindColors(code)

    expect(colors['blue-600']).toBeDefined()
    expect(colors['emerald-500']).toBeDefined()
    expect(colors['red-400']).toBeDefined()
    expect(colors['gray-700']).toBeDefined()
  })

  it('overrides LLM tokens with parsed Tailwind colors', async () => {
    const { extractSpecFromFigmaMake } = await import('../src/figma-make-extractor.js')
    const createMessage = mockCreateMessage(cannedSpec)

    const result = await extractSpecFromFigmaMake({
      codeContent: '<div class="bg-emerald-600 text-white"><h1>Hello</h1></div>',
      metadata: {},
      screenshotPaths: [join(tmpDir, 'screen-0.png')],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
    })

    // Parsed Tailwind colors should be merged into designTokens
    expect(result.spec.designTokens.colors['emerald-600']).toBeDefined()
  })

  it('works without screenshots', async () => {
    const { extractSpecFromFigmaMake } = await import('../src/figma-make-extractor.js')
    const createMessage = mockCreateMessage(cannedSpec)

    const result = await extractSpecFromFigmaMake({
      codeContent: '<div>Hello</div>',
      metadata: {},
      screenshotPaths: [],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
    })

    expect(result.spec.screens).toHaveLength(2)
  })

  it('passes canSendImages=false to skip screenshot', async () => {
    const { extractSpecFromFigmaMake } = await import('../src/figma-make-extractor.js')
    const createMessage = mockCreateMessage(cannedSpec)

    await extractSpecFromFigmaMake({
      codeContent: '<div>Hello</div>',
      metadata: {},
      screenshotPaths: [join(tmpDir, 'screen-0.png')],
      prompt: 'A todo app',
      platform: 'swiftui',
      createMessage,
      canSendImages: false,
    })

    // When canSendImages is false, prompt should be plain text, not array with image
    const promptContent = createMessage.mock.calls[0][0].messages[0].content
    expect(typeof promptContent).toBe('string')
  })
})
