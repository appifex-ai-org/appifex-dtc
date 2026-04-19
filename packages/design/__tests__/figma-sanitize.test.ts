// Phase 7 (DESIGN-02): Wave 0 RED stub — see 07-VALIDATION.md
// RED until Plan 01 wires sanitizer through the figma extractor paths.
import { describe, it, expect, vi } from 'vitest'
import { FigmaRestClient } from '../src/figma-rest-client.js'
import { FigmaMakeAdapter } from '../src/figma-make-adapter.js'
import type { FigmaMcpClientLike, FigmaDesignContext } from '../src/figma-make-adapter.js'

// The FigmaRestClient adapter must apply sanitizeLayerName from @appifex/design
// and produce sanitized screen names / PlatformSpec node IDs.
// Pathological names used: '🏠 Home', 'class', 'Home Screen' (×2)
// Expected sanitized output: ['home', 'class_', 'homeScreen', 'homeScreen_2']

const FIGMA_REST_FIXTURE_SCREENS = ['🏠 Home', 'class', 'Home Screen', 'Home Screen']

// Build a minimal FigmaFileResponse-shaped object sufficient for FigmaRestClient
function buildFigmaFileResponse(screenNames: string[]): Record<string, unknown> {
  return {
    document: {
      id: 'doc-1',
      name: 'Test File',
      type: 'DOCUMENT',
      children: [
        {
          id: 'page-1',
          name: 'Page 1',
          type: 'CANVAS',
          children: screenNames.map((name, i) => ({
            id: `frame-${i}`,
            name,
            type: 'FRAME',
            fills: [],
            children: [],
          })),
        },
      ],
    },
    components: {},
    styles: {},
  }
}

describe('FigmaRestClient — sanitized screen names (DESIGN-02)', () => {
  it('produces sanitized screen IDs matching the sanitization spec', async () => {
    const fixture = buildFigmaFileResponse(FIGMA_REST_FIXTURE_SCREENS)

    const client = new FigmaRestClient({
      token: 'test-token',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => fixture,
        text: async () => JSON.stringify(fixture),
      }) as unknown as typeof fetch,
    })

    const context = await client.getDesignContext({
      fileUrl: 'https://figma.com/design/ABC123/Test',
    })

    // Phase 7 (WR-06): screenNames returns raw Figma display names for callers to use as human-
    // readable labels. Sanitized IDs are derived downstream (e.g. in FigmaMakeAdapter.readDesign).
    expect(context.screenNames).toEqual(['🏠 Home', 'class', 'Home Screen', 'Home Screen'])
  })
})

describe('FigmaMakeAdapter — sanitized screen names (DESIGN-02)', () => {
  it('produces sanitized screen IDs from FigmaMcpClientLike response', async () => {
    const mockContext: FigmaDesignContext = {
      code: '<html><!-- screens --></html>',
      metadata: {},
      screenNames: ['🏠 Home', 'class', 'Home Screen', 'Home Screen'],
    }

    const mcpClient: FigmaMcpClientLike = {
      getDesignContext: vi.fn().mockResolvedValue(mockContext),
      getScreenshot: vi.fn().mockResolvedValue(Buffer.from('PNG')),
    }

    const runner = {
      exec: vi
        .fn()
        .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0, command: '' }),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true),
      glob: vi.fn().mockResolvedValue([]),
      capabilities: {
        hasMaestro: false,
        hasXcode: false,
        hasNode: true,
        hasSemgrep: false,
        platform: 'darwin' as const,
      },
    }

    const adapter = new FigmaMakeAdapter({
      figmaToken: 'test-token',
      figmaFileUrl: 'https://figma.com/design/ABC123/Test',
      mcpClient,
    })

    const result = await adapter.create({ prompt: 'A test app', outputDir: '/tmp/out', runner })

    // After Plan 01 wires sanitizer, the resulting PlatformSpec screen IDs must be sanitized.
    // This assertion is RED until the sanitizer is applied inside FigmaMakeAdapter / spec extractor.
    const screenIds = result.spec?.screens?.map((s: { id: string }) => s.id) ?? []
    expect(screenIds).toEqual(['home', 'class_', 'homeScreen', 'homeScreen_2'])
  })
})
