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

// Mock @appifex/baas to intercept runFirebaseProvision
vi.mock('@appifex/baas', () => ({
  runFirebaseProvision: vi.fn(),
}))

import { handleFirebaseProvision } from '../src/tools/firebase-provision.js'
import { runFirebaseProvision } from '@appifex/baas'

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

describe('handleFirebaseProvision (MCP-01)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-firebase-provision-'))
    vi.clearAllMocks()
  })

  it('returns isError:true when config.firebase.projectId missing', async () => {
    const config = {} as import('@appifex/core').DtcConfig

    const result = await handleFirebaseProvision({ projectDir: tmpDir }, mockRunner, config)

    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/firebase.*projectId|projectId.*missing|firebase.*config/i)
  })

  it('returns isError:true when config.firebase.serviceAccountKeyPath missing', async () => {
    const config = {
      firebase: { projectId: 'test-project-id' },
    } as unknown as import('@appifex/core').DtcConfig

    const result = await handleFirebaseProvision({ projectDir: tmpDir }, mockRunner, config)

    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/serviceAccountKeyPath|service.account/i)
  })

  it('invokes runFirebaseProvision when config present', async () => {
    ;(runFirebaseProvision as Mock).mockResolvedValue({
      skipped: false,
      projectId: 'test-project-id',
      iosAppId: 'test-app-id',
      collectionsSeeded: 3,
    })

    const config = {
      firebase: {
        projectId: 'test-project-id',
        serviceAccountKeyPath: '/tmp/sa.json',
      },
    } as unknown as import('@appifex/core').DtcConfig

    const baasSchema = { entities: [] } as unknown as import('@appifex/core').BaasSchema

    const result = await handleFirebaseProvision(
      { projectDir: tmpDir, baasSchema },
      mockRunner,
      config,
    )

    expect(runFirebaseProvision).toHaveBeenCalledWith(
      expect.objectContaining({ outputDir: tmpDir, runner: mockRunner, config }),
    )
    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as { phase: string; success: boolean }
    expect(parsed.phase).toBe('firebase_provision')
    expect(parsed.success).toBe(true)
  })

  it('returns wrapped error when runFirebaseProvision throws', async () => {
    ;(runFirebaseProvision as Mock).mockRejectedValue(new Error('Firebase API unavailable'))

    const config = {
      firebase: {
        projectId: 'test-project-id',
        serviceAccountKeyPath: '/tmp/sa.json',
      },
    } as unknown as import('@appifex/core').DtcConfig

    const baasSchema = { entities: [] } as unknown as import('@appifex/core').BaasSchema

    const result = await handleFirebaseProvision(
      { projectDir: tmpDir, baasSchema },
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
