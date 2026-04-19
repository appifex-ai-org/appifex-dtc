// Phase 7 (DESIGN-03): Wave 0 RED stub — see 07-VALIDATION.md
// RED until Plan 01 wires sanitizer through the stitch extractor path.
import { describe, it, expect, vi } from 'vitest'
import { StitchAdapter } from '../src/stitch-adapter.js'
import type { StitchClientLike, StitchScreenLike } from '../src/stitch-adapter.js'

// Pathological screen names: '🏠 Home', 'class', 'Home Screen' (×2)
// Expected sanitized PlatformSpec screen IDs: ['home', 'class_', 'homeScreen', 'homeScreen_2']

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

function mockScreen(id: string, name: string): StitchScreenLike {
  return {
    screenId: id,
    name,
    getHtml: vi.fn().mockResolvedValue(`https://stitch.test/${id}.html`),
    getImage: vi.fn().mockResolvedValue(`https://stitch.test/${id}.png`),
    edit: vi.fn(),
  } as unknown as StitchScreenLike
}

function mockStitchClient(screens: StitchScreenLike[]): StitchClientLike {
  return {
    createProject: vi.fn().mockResolvedValue({
      generate: vi.fn().mockResolvedValue(screens[0]),
      screens,
    }),
  } as unknown as StitchClientLike
}

function mockFetchImpl(): typeof fetch {
  return vi.fn().mockImplementation(async () => ({
    ok: true,
    text: async () => '<html></html>',
    arrayBuffer: async () => new TextEncoder().encode('PNG').buffer,
  })) as unknown as typeof fetch
}

describe('StitchAdapter — sanitized screen names (DESIGN-03)', () => {
  it('produces sanitized PlatformSpec screen IDs from pathological layer names', async () => {
    const pathologicalNames = ['🏠 Home', 'class', 'Home Screen', 'Home Screen']
    const screens = pathologicalNames.map((name, i) => mockScreen(`screen-${i}`, name))

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

    const adapter = new StitchAdapter(runner, {
      apiKey: 'test-key',
      stitchClient: mockStitchClient(screens),
      fetchImpl: mockFetchImpl(),
    })

    const result = await adapter.create({ prompt: 'A todo app', outputDir: '/tmp/out' })

    // After Plan 01 wires sanitizer, the resulting PlatformSpec screen IDs must be sanitized.
    // This assertion is RED until the sanitizer is applied inside StitchAdapter / spec extractor.
    const screenIds = result.spec?.screens?.map((s: { id: string }) => s.id) ?? []
    expect(screenIds).toEqual(['home', 'class_', 'homeScreen', 'homeScreen_2'])
  })
})
