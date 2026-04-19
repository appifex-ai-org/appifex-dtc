// Phase 7 (MCP-01): Wave 0 RED stub — flipped GREEN in Plan 04a
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock @appifex/core so loadRunContext + Checkpoint can be overridden
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return { ...actual, loadRunContext: vi.fn() }
})

// Mock @appifex/build and @appifex/provision to intercept archive + upload
vi.mock('@appifex/build', () => ({
  runXcodeArchivePhase: vi.fn(),
  bundleKotlin: vi.fn(),
}))

vi.mock('@appifex/provision', () => ({
  runTestFlightUploadPhase: vi.fn(),
  PlayConsoleClient: vi.fn(),
}))

import { handleTestflightUpload } from '../src/tools/testflight.js'
import { runXcodeArchivePhase } from '@appifex/build'
import { runTestFlightUploadPhase } from '@appifex/provision'

const mockRunner = {
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

describe('handleTestflightUpload (MCP-01)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-testflight-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns isError:true when config.apple missing', async () => {
    const config = {} as import('@appifex/core').DtcConfig

    const result = await handleTestflightUpload({ projectDir: tmpDir }, mockRunner, config)

    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/apple.*config|apple.*credential|apple.*missing/i)
  })

  it('invokes runXcodeArchivePhase + runTestFlightUploadPhase in sequence', async () => {
    const archiveResult = {
      success: true,
      skipped: false as const,
      ipaPath: `${tmpDir}/MyApp.ipa`,
      exportDir: tmpDir,
      marketingVersion: '1.0.0',
      buildNumber: '42',
      duration: 100,
      bundleId: 'com.example.app',
    }
    const uploadResult = {
      status: 'completed' as const,
      buildId: 'build-42',
      groupId: 'group-1',
      testersAdded: [],
    }

    ;(runXcodeArchivePhase as Mock).mockResolvedValue(archiveResult)
    ;(runTestFlightUploadPhase as Mock).mockResolvedValue(uploadResult)

    const config = {
      apple: {
        ascKeyId: 'KEY-ID',
        ascIssuerId: 'ISSUER-ID',
        ascKeyPath: '/tmp/AuthKey.p8',
        teamId: 'TEAM-ID',
        bundleId: 'com.example.app',
      },
    } as unknown as import('@appifex/core').DtcConfig

    const result = await handleTestflightUpload(
      { projectDir: tmpDir, scheme: 'MyApp' },
      mockRunner,
      config,
    )

    expect(runXcodeArchivePhase).toHaveBeenCalledOnce()
    expect(runTestFlightUploadPhase).toHaveBeenCalledOnce()

    // Archive result must feed into upload call
    expect(runTestFlightUploadPhase).toHaveBeenCalledWith(
      expect.objectContaining({ ipaPath: archiveResult.ipaPath }),
    )

    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as { phase: string; platform: string; success: boolean }
    expect(parsed.phase).toBe('submit')
    expect(parsed.platform).toBe('ios')
    expect(parsed.success).toBe(true)
  })

  it('returns archive.skipped envelope when archive reports skipped', async () => {
    // Matches pattern at packages/mcp-server/src/tools/provision.ts:117-128
    const archiveResult = {
      skipped: true as const,
      reason: 'No Swift sources found',
      buildId: undefined,
    }

    ;(runXcodeArchivePhase as Mock).mockResolvedValue(archiveResult)

    const config = {
      apple: {
        ascKeyId: 'KEY-ID',
        ascIssuerId: 'ISSUER-ID',
        ascKeyPath: '/tmp/AuthKey.p8',
        teamId: 'TEAM-ID',
        bundleId: 'com.example.app',
      },
    } as unknown as import('@appifex/core').DtcConfig

    const result = await handleTestflightUpload({ projectDir: tmpDir }, mockRunner, config)

    // When archive is skipped, upload is never invoked
    expect(runTestFlightUploadPhase).not.toHaveBeenCalled()
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as { skipped: boolean; phase: string }
    expect(parsed.skipped).toBe(true)
    expect(parsed.phase).toBe('archive')
  })
})
