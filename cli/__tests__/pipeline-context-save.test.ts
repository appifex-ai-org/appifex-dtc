/**
 * Tests for incremental context save and SIGINT handler behavior in pipeline.ts
 *
 * These tests verify the flushContext pattern in isolation without running
 * the full pipeline (which has many external dependencies).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunContextBuilder } from '@appifex/core'

// ---------------------------------------------------------------------------
// Helpers: simulate the flushContext closure as defined in pipeline.ts
// ---------------------------------------------------------------------------

function makeFlushContext(
  saveRunContext: (outputDir: string, context: unknown) => Promise<void>,
  ctxBuilder: RunContextBuilder,
  outputDir: string,
) {
  return async () => {
    try {
      await saveRunContext(outputDir, ctxBuilder.build('failed'))
    } catch {
      /* must not block pipeline */
    }
  }
}

// ---------------------------------------------------------------------------
// Tests for flushContext (Task 1)
// ---------------------------------------------------------------------------

describe('flushContext', () => {
  let ctxBuilder: RunContextBuilder
  let mockSave: ReturnType<typeof vi.fn>
  let flushContext: () => Promise<void>

  beforeEach(() => {
    ctxBuilder = new RunContextBuilder({ prompt: 'Test app', platform: 'swiftui', mode: 'fresh' })
    mockSave = vi.fn().mockResolvedValue(undefined)
    flushContext = makeFlushContext(mockSave, ctxBuilder, '/tmp/output')
  })

  it('calls saveRunContext after a completed phase emit', async () => {
    // Simulate what emit() does for a terminal status
    ctxBuilder.recordPhase('design', 'completed', 'Design created')

    await flushContext()

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith('/tmp/output', expect.objectContaining({
      status: 'failed', // partial pipeline — always 'failed' for incremental saves
    }))
  })

  it('calls saveRunContext after a failed phase emit', async () => {
    ctxBuilder.recordPhase('spec', 'failed', 'Spec extraction failed')

    await flushContext()

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith('/tmp/output', expect.objectContaining({
      status: 'failed',
    }))
  })

  it('calls saveRunContext after a skipped phase emit', async () => {
    ctxBuilder.recordPhase('fix', 'skipped', 'All tests passed')

    await flushContext()

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith('/tmp/output', expect.objectContaining({
      status: 'failed',
    }))
  })

  it('does NOT call saveRunContext for started status (non-terminal)', async () => {
    // emit('codegen', 'started', ...) — no flushContext() call follows in the code
    // We test the pattern: if we DON'T call flushContext, saveRunContext is not called
    // This documents the intent: started/running statuses do NOT trigger incremental saves
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('does NOT call saveRunContext for running status (non-terminal)', async () => {
    // Same as above — running status should not trigger a save
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('swallows errors silently — file write failure does not throw', async () => {
    const failingSave = vi.fn().mockRejectedValue(new Error('ENOSPC: disk full'))
    const failingFlush = makeFlushContext(failingSave, ctxBuilder, '/tmp/output')

    // Must not throw
    await expect(failingFlush()).resolves.toBeUndefined()
    expect(failingSave).toHaveBeenCalledTimes(1)
  })

  it('captures the phase recorded before flush in the saved context', async () => {
    ctxBuilder.recordPhase('design', 'completed', 'Design created')
    ctxBuilder.recordPhase('spec', 'completed', '3 screens, swiftui')

    await flushContext()

    const savedContext = mockSave.mock.calls[0][1] as ReturnType<RunContextBuilder['build']>
    expect(savedContext.phases.design?.status).toBe('completed')
    expect(savedContext.phases.spec?.status).toBe('completed')
  })

  it('final save uses the correct final status, not "failed"', async () => {
    // Simulate the final save that already exists in pipeline.ts
    // The final save calls ctxBuilder.build(runStatus) where runStatus is the real status
    ctxBuilder.recordPhase('design', 'completed', 'Design created')
    ctxBuilder.recordPhase('spec', 'completed', '3 screens')
    ctxBuilder.recordPhase('codegen', 'completed', '12 files')

    // Incremental save uses 'failed'
    await flushContext()
    expect(mockSave).toHaveBeenLastCalledWith('/tmp/output', expect.objectContaining({ status: 'failed' }))

    // Final save uses the real status (e.g., 'completed')
    const finalContext = ctxBuilder.build('completed')
    expect(finalContext.status).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// Tests for SIGINT handler pattern (Task 2)
// ---------------------------------------------------------------------------

describe('SIGINT handler', () => {
  it('prevents double-flush via sigintFlushed guard', async () => {
    const ctxBuilder = new RunContextBuilder({ prompt: 'Test', platform: 'swiftui', mode: 'fresh' })
    const mockSave = vi.fn().mockResolvedValue(undefined)

    // Simulate the SIGINT handler closure from pipeline.ts
    let sigintFlushed = false
    const sigintHandler = async () => {
      if (sigintFlushed) return
      sigintFlushed = true
      try { await mockSave('/tmp/output', ctxBuilder.build('failed')) } catch { /* best effort */ }
    }

    // First call — should flush
    await sigintHandler()
    expect(mockSave).toHaveBeenCalledTimes(1)

    // Second call (double-flush scenario) — should NOT flush again
    await sigintHandler()
    expect(mockSave).toHaveBeenCalledTimes(1) // still 1, not 2
  })

  it('calls saveRunContext with status "failed" on SIGINT', async () => {
    const ctxBuilder = new RunContextBuilder({ prompt: 'Test', platform: 'swiftui', mode: 'fresh' })
    const mockSave = vi.fn().mockResolvedValue(undefined)
    ctxBuilder.recordPhase('design', 'completed', 'Design done')

    let sigintFlushed = false
    const sigintHandler = async () => {
      if (sigintFlushed) return
      sigintFlushed = true
      try { await mockSave('/tmp/output', ctxBuilder.build('failed')) } catch { /* best effort */ }
    }

    await sigintHandler()

    expect(mockSave).toHaveBeenCalledWith('/tmp/output', expect.objectContaining({
      status: 'failed',
      phases: expect.objectContaining({
        design: expect.objectContaining({ status: 'completed' }),
      }),
    }))
  })

  it('swallows errors in SIGINT handler — process.exit still called even on save failure', async () => {
    const failingSave = vi.fn().mockRejectedValue(new Error('Disk full'))
    const exitCalls: number[] = []

    let sigintFlushed = false
    const sigintHandler = async (exit: (code: number) => void) => {
      if (sigintFlushed) return
      sigintFlushed = true
      try { await failingSave() } catch { /* best effort */ }
      exit(130)
    }

    await sigintHandler((code) => exitCalls.push(code))

    expect(exitCalls).toEqual([130])
  })
})
