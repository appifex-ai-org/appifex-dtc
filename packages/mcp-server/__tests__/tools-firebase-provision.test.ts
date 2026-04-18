// Phase 7 (MCP-01): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock @appifex/core so loadRunContext + Checkpoint can be overridden
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return { ...actual, loadRunContext: vi.fn() }
})

// Mock @appifex/baas to intercept runFirebaseProvision
vi.mock('@appifex/baas', () => ({
  runFirebaseProvision: vi.fn(),
}))

// @ts-expect-error — module does not exist yet; RED until Plan 02 creates src/tools/firebase-provision.ts
import { handleFirebaseProvision } from '../src/tools/firebase-provision.js'
import { runFirebaseProvision } from '@appifex/baas'

const mockRunner = {
  exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0, command: '' }),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  glob: vi.fn().mockResolvedValue([]),
  capabilities: { hasMaestro: false, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'darwin' as const },
}

describe('handleFirebaseProvision (MCP-01)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-firebase-provision-'))
    vi.clearAllMocks()
  })

  it('returns isError:true when config.firebase.projectId missing', async () => {
    const config = {} as import('@appifex/core').DtcConfig

    const result = await handleFirebaseProvision(
      { projectDir: tmpDir },
      mockRunner,
      config,
    )

    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/firebase.*projectId|projectId.*missing|firebase.*config/i)
  })

  it('invokes runFirebaseProvision when config present', async () => {
    ;(runFirebaseProvision as Mock).mockResolvedValue({ success: true, message: 'Provisioned' })

    const config = {
      firebase: { projectId: 'test-project-id' },
    } as unknown as import('@appifex/core').DtcConfig

    const result = await handleFirebaseProvision(
      { projectDir: tmpDir },
      mockRunner,
      config,
    )

    expect(runFirebaseProvision).toHaveBeenCalledWith(
      expect.objectContaining({ runner: mockRunner, config, projectDir: tmpDir }),
    )
    expect(result.isError).toBe(false)
  })

  it('returns wrapped error when runFirebaseProvision throws', async () => {
    ;(runFirebaseProvision as Mock).mockRejectedValue(new Error('Firebase API unavailable'))

    const config = {
      firebase: { projectId: 'test-project-id' },
    } as unknown as import('@appifex/core').DtcConfig

    const result = await handleFirebaseProvision(
      { projectDir: tmpDir },
      mockRunner,
      config,
    )

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text) as { success: boolean; error?: string }
    expect(parsed.success).toBe(false)
  })

  // Cleanup after tests
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
})
