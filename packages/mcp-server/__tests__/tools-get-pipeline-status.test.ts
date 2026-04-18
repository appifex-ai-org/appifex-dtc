// Phase 7 (MCP-02): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock @appifex/core so loadRunContext + Checkpoint can be overridden
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return { ...actual, loadRunContext: vi.fn() }
})

// @ts-expect-error — module does not exist yet; RED until Plan 02 creates src/tools/status.ts
import { handleGetPipelineStatus } from '../src/tools/status.js'
import { loadRunContext, PHASE_ORDER } from '@appifex/core'

const mockedLoadRunContext = loadRunContext as unknown as Mock

describe('handleGetPipelineStatus (MCP-02)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-status-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns { runId: null, currentPhase: null, phases: [] } when loadRunContext returns null', async () => {
    mockedLoadRunContext.mockResolvedValue(null)

    const result = await handleGetPipelineStatus({ projectDir: tmpDir })

    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as {
      runId: string | null
      currentPhase: string | null
      phases: unknown[]
    }
    expect(parsed.runId).toBeNull()
    expect(parsed.currentPhase).toBeNull()
    expect(Array.isArray(parsed.phases)).toBe(true)
    expect(parsed.phases).toHaveLength(0)
  })

  it('returns D-06 shape from seeded context', async () => {
    mockedLoadRunContext.mockResolvedValue({
      runId: 'run-abc',
      prompt: 'A test app',
      platform: 'swiftui',
      mode: 'create',
      status: 'completed',
      timestamp: Date.now(),
      phases: {
        design: { status: 'completed', summary: 'ok' },
        spec: { status: 'completed', summary: 'ok' },
      },
      filesGenerated: [],
    })

    const result = await handleGetPipelineStatus({ projectDir: tmpDir })

    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as {
      runId: string
      currentPhase: string | null
      phases: Array<{ id: string; status: string }>
    }

    expect(parsed.runId).toBe('run-abc')
    expect(Array.isArray(parsed.phases)).toBe(true)
    expect(parsed.phases.length).toBe(PHASE_ORDER.length)

    // Phase ids must be in PHASE_ORDER order
    const phaseIds = parsed.phases.map((p) => p.id)
    expect(phaseIds).toEqual(PHASE_ORDER)
  })

  it('derives currentPhase from running phase or next-after-last-completed', async () => {
    mockedLoadRunContext.mockResolvedValue({
      runId: 'run-xyz',
      prompt: 'A test app',
      platform: 'swiftui',
      mode: 'create',
      status: 'running',
      timestamp: Date.now(),
      phases: {
        design: { status: 'completed', summary: 'ok' },
        spec: { status: 'running', summary: '' },
      },
      filesGenerated: [],
    })

    const result = await handleGetPipelineStatus({ projectDir: tmpDir })

    const parsed = JSON.parse(result.text) as {
      currentPhase: string | null
    }
    // When a phase has status 'running', currentPhase should reflect it
    expect(parsed.currentPhase).toBe('spec')
  })

  it('populates lastError when a phase has status:failed', async () => {
    mockedLoadRunContext.mockResolvedValue({
      runId: 'run-fail',
      prompt: 'A test app',
      platform: 'swiftui',
      mode: 'create',
      status: 'failed',
      timestamp: Date.now(),
      phases: {
        design: { status: 'completed', summary: 'ok' },
        codegen: { status: 'failed', summary: 'LLM timeout' },
      },
      filesGenerated: [],
    })

    const result = await handleGetPipelineStatus({ projectDir: tmpDir })

    const parsed = JSON.parse(result.text) as {
      lastError?: { name: string; message: string; phase: string }
    }
    expect(parsed.lastError).toBeDefined()
    expect(parsed.lastError?.phase).toBe('codegen')
    expect(typeof parsed.lastError?.message).toBe('string')
  })
})
