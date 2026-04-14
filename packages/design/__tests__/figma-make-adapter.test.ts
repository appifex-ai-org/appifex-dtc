import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

import type { FigmaMcpClientLike } from '../src/figma-make-adapter.js'

function mockRunner() {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
  }
}

function mockMcpClient(): FigmaMcpClientLike {
  return {
    getDesignContext: vi.fn().mockResolvedValue({
      code: '<div class="p-4"><h1>Hello World</h1></div>',
      metadata: { fileName: 'test-design', nodeCount: 5 },
      screenNames: ['Home', 'Settings'],
    }),
    getScreenshot: vi.fn().mockResolvedValue(Buffer.from('PNG_DATA')),
  }
}

describe('FigmaMakeAdapter', () => {
  let runner: ReturnType<typeof mockRunner>
  let mcpClient: ReturnType<typeof mockMcpClient>

  beforeEach(() => {
    vi.clearAllMocks()
    runner = mockRunner()
    mcpClient = mockMcpClient()
  })

  // Lazy import to allow vi.mock to take effect
  async function createAdapter(opts?: { figmaFileUrl?: string }) {
    const { FigmaMakeAdapter } = await import('../src/figma-make-adapter.js')
    return new FigmaMakeAdapter(runner as any, {
      figmaToken: 'figd_test_token',
      figmaFileUrl: opts?.figmaFileUrl ?? 'https://www.figma.com/design/abc123/TestDesign',
      mcpClient,
    })
  }

  describe('create()', () => {
    it('calls MCP and returns successful result with artifacts', async () => {
      const adapter = await createAdapter()

      const result = await adapter.create({
        prompt: 'A todo app',
        outputDir: '/tmp/output',
        previewPath: '/tmp/output/preview.png',
      })

      expect(result.success).toBe(true)
      expect(result.tool).toBe('figma-make')
      expect(result.outputDir).toContain('/tmp/output')
      expect(result.screenshotPaths.length).toBeGreaterThan(0)
      expect(result.htmlPaths.length).toBeGreaterThan(0)
      expect(mcpClient.getDesignContext).toHaveBeenCalled()
      expect(mcpClient.getScreenshot).toHaveBeenCalled()
    })

    it('returns screen IDs from design context', async () => {
      const adapter = await createAdapter()

      const result = await adapter.create({
        prompt: 'A todo app',
        outputDir: '/tmp/output',
      })

      expect(result.screenIds).toEqual(['Home', 'Settings'])
    })

    it('returns error when MCP call fails', async () => {
      ;(mcpClient.getDesignContext as any).mockRejectedValue(new Error('Auth failed'))
      const adapter = await createAdapter()

      const result = await adapter.create({
        prompt: 'A todo app',
        outputDir: '/tmp/output',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Auth failed')
    })

    it('returns error when no figmaFileUrl is configured', async () => {
      const { FigmaMakeAdapter } = await import('../src/figma-make-adapter.js')
      const adapter = new FigmaMakeAdapter(runner as any, {
        figmaToken: 'figd_test_token',
        mcpClient,
      })

      const result = await adapter.create({
        prompt: 'A todo app',
        outputDir: '/tmp/output',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Figma file URL')
    })
  })

  describe('iterate()', () => {
    it('re-reads design from MCP after user edits', async () => {
      const adapter = await createAdapter()
      // First create to set the file URL
      await adapter.create({ prompt: 'A todo app', outputDir: '/tmp/output' })

      vi.clearAllMocks()
      const result = await adapter.iterate({
        prompt: 'Make the header blue',
        outputDir: '/tmp/output',
        previewPath: '/tmp/output/preview.png',
      })

      expect(result.success).toBe(true)
      expect(result.tool).toBe('figma-make')
      expect(mcpClient.getDesignContext).toHaveBeenCalled()
      expect(mcpClient.getScreenshot).toHaveBeenCalled()
    })
  })
})
