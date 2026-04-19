// Phase 5 (TF-01 D-01, TF-03): runXcodeArchivePhase orchestrator tests.
// Covers D-16 (idempotent skip when VALID build exists in ASC), D-06 (next build number),
// D-07 (marketing version from package.json + 1.0.0 fallback), and ArchiveError on missing creds.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock provision layer BEFORE importing xcode-archive-phase (vi.mock hoisting)
vi.mock('@appifex/provision', () => ({
  computeNextBuildNumber: vi.fn(),
  findBuildByVersion: vi.fn(),
}))
vi.mock('../src/swift-archive.js', () => ({
  archiveSwift: vi.fn(),
}))

import { runXcodeArchivePhase } from '../src/xcode-archive-phase.js'
import { ArchiveError } from '@appifex/core'
import { computeNextBuildNumber, findBuildByVersion } from '@appifex/provision'
import { archiveSwift } from '../src/swift-archive.js'

const FULL_APPLE = {
  teamId: 'TEAM1',
  bundleId: 'com.example.App',
  ascAppId: '123456789',
  ascKeyId: 'KEY1',
  ascIssuerId: 'ISS1',
  ascKeyPath: '/tmp/AuthKey_KEY1.p8',
}

function createMockRunner(files: Record<string, string>) {
  return {
    readFile: async (p: string) => {
      if (p in files) return files[p]
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    writeFile: async () => {},
    exists: async (p: string) => p in files,
    glob: async () => [],
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
  } as any
}

beforeEach(() => {
  vi.mocked(computeNextBuildNumber).mockReset()
  vi.mocked(findBuildByVersion).mockReset()
  vi.mocked(archiveSwift).mockReset()
})

describe('runXcodeArchivePhase', () => {
  it('D-16: skips archive when build already VALID in ASC', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('47')
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b-existing',
      type: 'builds',
      attributes: {
        version: '47',
        processingState: 'VALID',
        uploadedDate: '2026-04-17',
        expired: false,
      },
    } as any)

    const result = await runXcodeArchivePhase({
      runner: createMockRunner({ '/proj/package.json': '{"version":"1.0.3"}' }),
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })

    expect(result.skipped).toBe(true)
    if (result.skipped) {
      expect(result.reason).toMatch(/VALID/i)
      expect(result.buildId).toBe('b-existing')
    }
    expect(archiveSwift).not.toHaveBeenCalled()
  })

  it('D-06: passes computed build number to archiveSwift', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('48')
    vi.mocked(findBuildByVersion).mockResolvedValue(null)
    vi.mocked(archiveSwift).mockResolvedValue({
      ipaPath: '/proj/build/export/App.ipa',
      archivePath: '/proj/build/App.xcarchive',
      marketingVersion: '1.0.3',
      buildNumber: '48',
    } as any)

    await runXcodeArchivePhase({
      runner: createMockRunner({ '/proj/package.json': '{"version":"1.0.3"}' }),
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })
    const call = vi.mocked(archiveSwift).mock.calls[0][1] as any
    expect(call.buildNumber).toBe('48')
  })

  it('D-07: reads marketingVersion from package.json', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('1')
    vi.mocked(findBuildByVersion).mockResolvedValue(null)
    vi.mocked(archiveSwift).mockResolvedValue({
      ipaPath: '/x.ipa',
      archivePath: '/x',
      marketingVersion: '2.5.0',
      buildNumber: '1',
    } as any)

    await runXcodeArchivePhase({
      runner: createMockRunner({ '/proj/package.json': '{"version":"2.5.0"}' }),
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })
    const call = vi.mocked(archiveSwift).mock.calls[0][1] as any
    expect(call.marketingVersion).toBe('2.5.0')
  })

  it('D-07 fallback: missing package.json -> marketingVersion=1.0.0', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('1')
    vi.mocked(findBuildByVersion).mockResolvedValue(null)
    vi.mocked(archiveSwift).mockResolvedValue({
      ipaPath: '/x.ipa',
      archivePath: '/x',
      marketingVersion: '1.0.0',
      buildNumber: '1',
    } as any)

    await runXcodeArchivePhase({
      runner: createMockRunner({}), // no package.json
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })
    const call = vi.mocked(archiveSwift).mock.calls[0][1] as any
    expect(call.marketingVersion).toBe('1.0.0')
  })

  it('D-07 fallback: package.json with no version field -> 1.0.0', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('1')
    vi.mocked(findBuildByVersion).mockResolvedValue(null)
    vi.mocked(archiveSwift).mockResolvedValue({
      ipaPath: '/x.ipa',
      archivePath: '/x',
      marketingVersion: '1.0.0',
      buildNumber: '1',
    } as any)

    await runXcodeArchivePhase({
      runner: createMockRunner({ '/proj/package.json': '{}' }),
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })
    const call = vi.mocked(archiveSwift).mock.calls[0][1] as any
    expect(call.marketingVersion).toBe('1.0.0')
  })

  it('throws ArchiveError when apple.ascAppId is missing', async () => {
    await expect(
      runXcodeArchivePhase({
        runner: createMockRunner({}),
        config: { apple: { ...FULL_APPLE, ascAppId: undefined } } as any,
        projectDir: '/proj',
        scheme: 'App',
      }),
    ).rejects.toThrow(ArchiveError)
  })

  it('throws ArchiveError when apple.ascKeyPath is missing', async () => {
    await expect(
      runXcodeArchivePhase({
        runner: createMockRunner({}),
        config: { apple: { ...FULL_APPLE, ascKeyPath: undefined } } as any,
        projectDir: '/proj',
        scheme: 'App',
      }),
    ).rejects.toThrow(ArchiveError)
  })

  it('throws ArchiveError when apple.ascKeyId is missing', async () => {
    await expect(
      runXcodeArchivePhase({
        runner: createMockRunner({}),
        config: { apple: { ...FULL_APPLE, ascKeyId: undefined } } as any,
        projectDir: '/proj',
        scheme: 'App',
      }),
    ).rejects.toThrow(ArchiveError)
  })

  it('throws ArchiveError when apple.ascIssuerId is missing', async () => {
    await expect(
      runXcodeArchivePhase({
        runner: createMockRunner({}),
        config: { apple: { ...FULL_APPLE, ascIssuerId: undefined } } as any,
        projectDir: '/proj',
        scheme: 'App',
      }),
    ).rejects.toThrow(ArchiveError)
  })

  it('returns { skipped: false, ipaPath, buildNumber, marketingVersion } on happy path', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('10')
    vi.mocked(findBuildByVersion).mockResolvedValue(null)
    vi.mocked(archiveSwift).mockResolvedValue({
      ipaPath: '/proj/build/export/App.ipa',
      archivePath: '/proj/build/App.xcarchive',
      marketingVersion: '1.2.3',
      buildNumber: '10',
    } as any)

    const result = await runXcodeArchivePhase({
      runner: createMockRunner({ '/proj/package.json': '{"version":"1.2.3"}' }),
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })
    expect(result.skipped).toBe(false)
    expect((result as any).ipaPath).toBe('/proj/build/export/App.ipa')
    expect((result as any).buildNumber).toBe('10')
    expect((result as any).marketingVersion).toBe('1.2.3')
    expect((result as any).bundleId).toBe('com.example.App')
  })

  it('propagates archiveSwift failure', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('1')
    vi.mocked(findBuildByVersion).mockResolvedValue(null)
    vi.mocked(archiveSwift).mockRejectedValue(new Error('xcodebuild failed'))

    await expect(
      runXcodeArchivePhase({
        runner: createMockRunner({ '/proj/package.json': '{"version":"1.0.0"}' }),
        config: { apple: FULL_APPLE } as any,
        projectDir: '/proj',
        scheme: 'App',
      }),
    ).rejects.toThrow()
  })

  it('does NOT skip when findBuildByVersion returns PROCESSING (non-VALID state)', async () => {
    vi.mocked(computeNextBuildNumber).mockResolvedValue('5')
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b-processing',
      type: 'builds',
      attributes: {
        version: '5',
        processingState: 'PROCESSING',
        uploadedDate: '2026-04-17',
        expired: false,
      },
    } as any)
    vi.mocked(archiveSwift).mockResolvedValue({
      ipaPath: '/x.ipa',
      archivePath: '/x',
      marketingVersion: '1.0.0',
      buildNumber: '5',
    } as any)

    const result = await runXcodeArchivePhase({
      runner: createMockRunner({ '/proj/package.json': '{"version":"1.0.0"}' }),
      config: { apple: FULL_APPLE } as any,
      projectDir: '/proj',
      scheme: 'App',
    })
    expect(result.skipped).toBe(false)
    expect(archiveSwift).toHaveBeenCalled()
  })
})
