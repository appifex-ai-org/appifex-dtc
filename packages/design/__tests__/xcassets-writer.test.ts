import { describe, it, expect, vi } from 'vitest'
import { writeImageAssets } from '../src/xcassets-writer.js'
import type { Runner, ExecResult } from '@appifex/core'

function mockRunner(): Runner {
  return {
    exec: vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 } as ExecResult),
    readFile: vi.fn().mockResolvedValue('FAKE_IMAGE_DATA'),
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

describe('writeImageAssets', () => {
  it('creates imageset directory with Contents.json and image file', async () => {
    const runner = mockRunner()

    const result = await writeImageAssets(runner, '/project/Sources/Assets.xcassets', [
      { name: 'hero-banner', filePath: '/tmp/assets/hero.png' },
    ])

    expect(result).toEqual(['hero-banner'])

    // Should write Contents.json
    expect(runner.writeFile).toHaveBeenCalledWith(
      '/project/Sources/Assets.xcassets/hero-banner.imageset/Contents.json',
      expect.stringContaining('"filename": "hero-banner.png"'),
    )

    // Contents.json should have correct structure
    const contentsCall = (runner.writeFile as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: string[]) => c[0].endsWith('Contents.json'),
    )
    const contents = JSON.parse(contentsCall![1])
    expect(contents.images[0]).toEqual({
      filename: 'hero-banner.png',
      idiom: 'universal',
      scale: '2x',
    })
    expect(contents.info).toEqual({ author: 'xcode', version: 1 })

    // Should copy source image to imageset (binary-safe via cp)
    expect(runner.exec).toHaveBeenCalledWith('cp', [
      '/tmp/assets/hero.png',
      '/project/Sources/Assets.xcassets/hero-banner.imageset/hero-banner.png',
    ])
  })

  it('handles multiple assets', async () => {
    const runner = mockRunner()

    const result = await writeImageAssets(runner, '/project/Assets.xcassets', [
      { name: 'hero', filePath: '/tmp/hero.png' },
      { name: 'avatar', filePath: '/tmp/avatar.jpg', scale: 3 },
    ])

    expect(result).toEqual(['hero', 'avatar'])
    // 2 assets × 1 writeFile each (Contents.json) = 2 writes
    expect(runner.writeFile).toHaveBeenCalledTimes(2)
    // 2 assets × 1 exec('cp') each = 2 cp calls
    expect(runner.exec).toHaveBeenCalledTimes(2)
  })

  it('uses custom scale factor', async () => {
    const runner = mockRunner()

    await writeImageAssets(runner, '/project/Assets.xcassets', [
      { name: 'icon', filePath: '/tmp/icon.png', scale: 3 },
    ])

    const contentsCall = (runner.writeFile as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: string[]) => c[0].endsWith('Contents.json'),
    )
    const contents = JSON.parse(contentsCall![1])
    expect(contents.images[0].scale).toBe('3x')
  })

  it('preserves file extension from source path', async () => {
    const runner = mockRunner()

    await writeImageAssets(runner, '/project/Assets.xcassets', [
      { name: 'photo', filePath: '/tmp/photo.jpg' },
    ])

    expect(runner.exec).toHaveBeenCalledWith('cp', [
      '/tmp/photo.jpg',
      '/project/Assets.xcassets/photo.imageset/photo.jpg',
    ])
  })

  it('returns empty array for empty input', async () => {
    const runner = mockRunner()

    const result = await writeImageAssets(runner, '/project/Assets.xcassets', [])

    expect(result).toEqual([])
    expect(runner.writeFile).not.toHaveBeenCalled()
  })
})
