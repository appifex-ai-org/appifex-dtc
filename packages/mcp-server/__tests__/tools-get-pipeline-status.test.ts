// Phase 7 (MCP-02): Wave 0 RED stub — flipped GREEN in Plan 04a
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Revision B-04: mock Checkpoint so we can inject 'running' status for mid-phase-crash tests.
// Checkpoint constructor opens a real SQLite file; mock it to avoid filesystem deps in tests.
const mockGetPhase = vi.fn().mockReturnValue(null)
const mockClose = vi.fn()

vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  class MockCheckpoint {
    getPhase = mockGetPhase
    close = mockClose
    savePhase = vi.fn()
    completedPhases = vi.fn().mockReturnValue([])
    lastCompletedPhase = vi.fn().mockReturnValue(null)
  }
  return { ...actual, loadRunContext: vi.fn(), Checkpoint: MockCheckpoint }
})

import { handleGetPipelineStatus } from '../src/tools/status.js'
import { loadRunContext, PHASE_ORDER } from '@appifex/core'

const mockedLoadRunContext = loadRunContext as unknown as Mock

describe('handleGetPipelineStatus (MCP-02)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-status-'))
    vi.clearAllMocks()
    mockGetPhase.mockReturnValue(null)
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
        spec: { status: 'completed', summary: 'ok' },
      },
      filesGenerated: [],
    })

    // Simulate Checkpoint returning 'running' for test_gen phase (revision B-04)
    mockGetPhase.mockImplementation((_runId: string, phase: string) => {
      if (phase === 'test_gen') return { status: 'running' }
      return null
    })

    const result = await handleGetPipelineStatus({ projectDir: tmpDir })

    const parsed = JSON.parse(result.text) as {
      currentPhase: string | null
    }
    // When a checkpoint phase has status 'running', currentPhase should reflect it
    expect(parsed.currentPhase).toBe('test_gen')
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

  // Revision B-04: mid-phase-crash test — Checkpoint has 'running' for a phase
  // that is absent from RunContext (exactly the state a crashed in-progress run leaves behind).
  it('surfaces running status from Checkpoint when RunContext has no entry for that phase (mid-phase crash)', async () => {
    mockedLoadRunContext.mockResolvedValue({
      runId: 'run-crash',
      prompt: 'A test app',
      platform: 'swiftui',
      mode: 'create',
      status: 'running',
      timestamp: Date.now(),
      phases: {
        design: { status: 'completed', summary: 'ok' },
        // NOTE: 'spec' is intentionally absent — simulates crash during spec phase
      },
      filesGenerated: [],
    })

    // Checkpoint row shows 'spec' was started but never committed
    mockGetPhase.mockImplementation((_runId: string, phase: string) => {
      if (phase === 'spec') return { status: 'running' }
      return null
    })

    const result = await handleGetPipelineStatus({ projectDir: tmpDir })

    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text) as {
      runId: string
      currentPhase: string | null
      phases: Array<{ id: string; status: string }>
    }

    // The spec phase should surface as 'running' (from Checkpoint, not RunContext)
    const specPhase = parsed.phases.find((p) => p.id === 'spec')
    expect(specPhase?.status).toBe('running')

    // currentPhase must point at the running phase
    expect(parsed.currentPhase).toBe('spec')
  })
})
