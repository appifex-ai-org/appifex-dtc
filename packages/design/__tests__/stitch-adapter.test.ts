import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  StitchAdapter,
  type StitchClientLike,
  type StitchScreenLike,
} from '../src/stitch-adapter.js'
import type { Runner, ExecResult } from '@appifex/core'

// Mock fs/promises to avoid real file writes in tests
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

function mockRunner(execResult: Partial<ExecResult> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      duration: 100,
      command: '',
      ...execResult,
    }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  }
}

function mockScreen(id = 'screen-1'): StitchScreenLike {
  const screen: StitchScreenLike = {
    screenId: id,
    getHtml: vi.fn().mockResolvedValue('https://stitch.test/screen.html'),
    getImage: vi.fn().mockResolvedValue('https://stitch.test/screen.png'),
    edit: vi.fn().mockImplementation(async () => mockScreen('screen-2')),
  }
  return screen
}

function mockStitchClient(screen?: StitchScreenLike): StitchClientLike {
  const s = screen ?? mockScreen()
  return {
    createProject: vi.fn().mockResolvedValue({
      generate: vi.fn().mockResolvedValue(s),
    }),
  }
}

function mockFetchImpl(htmlContent = '<html></html>', imageContent = 'PNG'): typeof fetch {
  return vi.fn().mockImplementation(async (url: string) => ({
    ok: true,
    text: async () => htmlContent,
    arrayBuffer: async () =>
      new TextEncoder().encode(url.includes('.png') ? imageContent : htmlContent).buffer,
  })) as unknown as typeof fetch
}

describe('StitchAdapter', () => {
  let runner: Runner

  beforeEach(() => {
    runner = mockRunner()
  })

  it('create() produces HTML and PNG files in outputDir', async () => {
    const adapter = new StitchAdapter(runner, {
      apiKey: 'test-key',
      stitchClient: mockStitchClient(),
      fetchImpl: mockFetchImpl(),
    })

    const result = await adapter.create({
      prompt: 'A todo app',
      outputDir: '/out',
    })

    expect(result.success).toBe(true)
    expect(result.htmlPaths).toHaveLength(1)
    expect(result.screenshotPaths).toHaveLength(1)
    // HTML written via runner.writeFile
    const writeCalls = (runner.writeFile as ReturnType<typeof vi.fn>).mock.calls
    const writtenPaths = writeCalls.map((c: string[]) => c[0])
    expect(writtenPaths.some((p: string) => p.includes('screen-0.html'))).toBe(true)
    // PNG written via fs.writeFile (binary)
    const { writeFile: fsWrite } = await import('node:fs/promises')
    const fsCalls = (fsWrite as ReturnType<typeof vi.fn>).mock.calls
    const fsPaths = fsCalls.map((c: unknown[]) => c[0])
    expect(fsPaths.some((p: unknown) => String(p).includes('screen-0.png'))).toBe(true)
  })

  it('create() copies first screenshot to previewPath', async () => {
    const adapter = new StitchAdapter(runner, {
      apiKey: 'test-key',
      stitchClient: mockStitchClient(),
      fetchImpl: mockFetchImpl(),
    })

    const result = await adapter.create({
      prompt: 'A todo app',
      outputDir: '/out',
      previewPath: '/out/preview.png',
    })

    expect(result.success).toBe(true)
    expect(result.previewPath).toBe('/out/preview.png')
    // Preview PNG written via fs.writeFile (binary)
    const { writeFile: fsWrite } = await import('node:fs/promises')
    const fsCalls = (fsWrite as ReturnType<typeof vi.fn>).mock.calls
    const fsPaths = fsCalls.map((c: unknown[]) => String(c[0]))
    expect(fsPaths).toContain('/out/preview.png')
  })

  it('iterate() calls screen.edit and downloads new artifacts', async () => {
    const screen = mockScreen()
    const editedScreen = mockScreen('screen-2')
    ;(screen.edit as ReturnType<typeof vi.fn>).mockResolvedValue(editedScreen)

    const adapter = new StitchAdapter(runner, {
      apiKey: 'test-key',
      stitchClient: mockStitchClient(screen),
      fetchImpl: mockFetchImpl(),
    })

    // First create to populate state
    await adapter.create({ prompt: 'A todo app', outputDir: '/out' })

    // Then iterate
    const result = await adapter.iterate({ prompt: 'Make it dark theme', outputDir: '/out' })

    expect(result.success).toBe(true)
    expect(screen.edit).toHaveBeenCalledWith('Make it dark theme')
  })

  it('create() returns success:false on SDK error', async () => {
    const client: StitchClientLike = {
      createProject: vi.fn().mockRejectedValue(new Error('SDK rate limited')),
    }

    const adapter = new StitchAdapter(runner, {
      apiKey: 'test-key',
      stitchClient: client,
      fetchImpl: mockFetchImpl(),
    })

    const result = await adapter.create({ prompt: 'A todo app', outputDir: '/out' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('SDK rate limited')
  })

  it('create() returns success:false when download fails', async () => {
    const failFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch

    const adapter = new StitchAdapter(runner, {
      apiKey: 'test-key',
      stitchClient: mockStitchClient(),
      fetchImpl: failFetch,
    })

    const result = await adapter.create({ prompt: 'A todo app', outputDir: '/out' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('download')
  })
})
