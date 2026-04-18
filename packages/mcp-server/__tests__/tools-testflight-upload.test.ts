// Phase 7 (MCP-01): Wave 0 RED stub — see 07-VALIDATION.md
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

// @ts-expect-error — module does not exist yet; RED until Plan 02 creates src/tools/testflight.ts
import { handleTestflightUpload } from '../src/tools/testflight.js'
import { runXcodeArchivePhase } from '@appifex/build'
import { runTestFlightUploadPhase } from '@appifex/provision'

const mockRunner = {
  exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0, command: '' }),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  glob: vi.fn().mockResolvedValue([]),
  capabilities: { hasMaestro: false, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'darwin' as const },
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

    const result = await handleTestflightUpload(
      { projectDir: tmpDir },
      mockRunner,
      config,
    )

    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/apple.*config|apple.*credential|apple.*missing/i)
  })

  it('invokes runXcodeArchivePhase + runTestFlightUploadPhase in sequence', async () => {
    const archiveResult = {
      success: true,
      skipped: false,
      ipaPath: `${tmpDir}/MyApp.ipa`,
      exportDir: tmpDir,
    }
    const uploadResult = {
      success: true,
      buildNumber: '42',
      message: 'Uploaded to TestFlight',
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
    const uploadCallArgs = (runTestFlightUploadPhase as Mock).mock.calls[0][0] as { ipaPath?: string }
    expect(uploadCallArgs.ipaPath ?? uploadCallArgs).toEqual(
      expect.objectContaining({ ipaPath: archiveResult.ipaPath }),
    )

    expect(result.isError).toBe(false)
  })

  it('returns archive.skipped envelope when archive reports skipped', async () => {
    // Matches pattern at packages/mcp-server/src/tools/provision.ts:117-128
    const archiveResult = {
      success: true,
      skipped: true,
      skipReason: 'No Swift sources found',
      ipaPath: undefined,
      exportDir: tmpDir,
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

    const result = await handleTestflightUpload(
      { projectDir: tmpDir },
      mockRunner,
      config,
    )

    // When archive is skipped, upload is never invoked
    expect(runTestFlightUploadPhase).not.toHaveBeenCalled()
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as { skipped: boolean; skipReason?: string }
    expect(parsed.skipped).toBe(true)
  })
})
