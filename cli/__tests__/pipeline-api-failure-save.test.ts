/**
 * Tests for API path failure context save behavior in pipeline.ts
 *
 * These tests verify the failure-save try/catch pattern in isolation without
 * running the full pipeline (which has many external dependencies).
 * Follows the same helper-extraction pattern as pipeline-context-save.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunContextBuilder } from '@appifex/core'

// ---------------------------------------------------------------------------
// Helpers: simulate the API path failure-save pattern from pipeline.ts
//
// The production code structure is:
//   try {
//     // ... all API phases (codegen, build, validate, fix, deliver, provision)
//   } catch (apiErr) {
//     try { await saveRunContext(outputDir, ctxBuilder.build('failed')) } catch { /* swallow */ }
//     throw apiErr
//   }
//   // success save (outside the try/catch — only on normal exit)
//   try { await saveRunContext(outputDir, ctxBuilder.build(apiRunStatus)) } catch { }
// ---------------------------------------------------------------------------

type SaveFn = (outputDir: string, context: unknown) => Promise<void>

/**
 * Simulates the API path failure-save catch block extracted from pipeline.ts.
 * This helper mirrors the exact pattern: save partial context, then re-throw.
 */
async function runApiPathWithFailureSave(
  saveRunContext: SaveFn,
  ctxBuilder: RunContextBuilder,
  outputDir: string,
  apiBlock: () => Promise<void>,
): Promise<void> {
  try {
    await apiBlock()
  } catch (apiErr) {
    // D-05: save partial context with status='failed' before re-throwing
    // D-06: err.message only — ctxBuilder.build('failed') captures recorded phases, no stack traces
    try {
      await saveRunContext(outputDir, ctxBuilder.build('failed'))
    } catch {
      /* context save must not block re-throw */
    }
    throw apiErr
  }
}

/**
 * Simulates the success save block (outside the try/catch in pipeline.ts).
 * Only called on normal exit — regression guard for Task 1 Test 4.
 */
async function runSuccessSave(
  saveRunContext: SaveFn,
  ctxBuilder: RunContextBuilder,
  outputDir: string,
  apiRunStatus: 'completed' | 'budget_exceeded' | 'failed',
): Promise<void> {
  try {
    await saveRunContext(outputDir, ctxBuilder.build(apiRunStatus))
  } catch {
    /* must not block return */
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API path failure save', () => {
  let ctxBuilder: RunContextBuilder
  let mockSave: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ctxBuilder = new RunContextBuilder({ prompt: 'Test app', platform: 'swiftui', mode: 'fresh' })
    mockSave = vi.fn().mockResolvedValue(undefined)
  })

  // Test 1: saveRunContext called with status='failed' before exception propagates
  it('calls saveRunContext with status=failed before the exception propagates', async () => {
    ctxBuilder.recordPhase('design', 'completed', 'Design done')
    ctxBuilder.recordPhase('codegen', 'completed', '10 files')

    const thrownError = new Error('Build failed: linker error')
    const apiBlock = vi.fn().mockRejectedValue(thrownError)

    await expect(
      runApiPathWithFailureSave(mockSave, ctxBuilder, '/tmp/output', apiBlock),
    ).rejects.toThrow('Build failed: linker error')

    // saveRunContext must have been called
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith(
      '/tmp/output',
      expect.objectContaining({
        status: 'failed',
      }),
    )
  })

  // Test 2: Saved context captures recorded phases (no stack traces)
  it('saved failure context captures recorded phases and contains no stack traces', async () => {
    ctxBuilder.recordPhase('design', 'completed', 'Design done')
    ctxBuilder.recordPhase('spec', 'completed', '3 screens')
    ctxBuilder.recordPhase('codegen', 'failed', 'Codegen error')

    const thrownError = new Error('Unexpected token')
    const apiBlock = vi.fn().mockRejectedValue(thrownError)

    await expect(
      runApiPathWithFailureSave(mockSave, ctxBuilder, '/tmp/output', apiBlock),
    ).rejects.toThrow('Unexpected token')

    expect(mockSave).toHaveBeenCalledTimes(1)
    const savedCtx = mockSave.mock.calls[0][1] as ReturnType<RunContextBuilder['build']>

    // Status must be 'failed'
    expect(savedCtx.status).toBe('failed')

    // Recorded phases must be present
    expect(savedCtx.phases.design?.status).toBe('completed')
    expect(savedCtx.phases.spec?.status).toBe('completed')
    expect(savedCtx.phases.codegen?.status).toBe('failed')

    // No stack trace in the context — only what ctxBuilder.build() produces
    const serialized = JSON.stringify(savedCtx)
    expect(serialized).not.toContain('.ts:')
    expect(serialized).not.toContain('.js:')
    expect(serialized).not.toContain('at Object.')
    expect(serialized).not.toContain('stack')
  })

  // Test 3: If saveRunContext itself throws during failure save, original exception still propagates
  it('swallows save errors so the original exception always re-throws', async () => {
    ctxBuilder.recordPhase('design', 'completed', 'Design done')

    const originalError = new Error('Build crashed')
    const apiBlock = vi.fn().mockRejectedValue(originalError)
    const failingSave = vi.fn().mockRejectedValue(new Error('ENOSPC: disk full'))

    const thrown = await runApiPathWithFailureSave(
      failingSave,
      ctxBuilder,
      '/tmp/output',
      apiBlock,
    ).catch((e) => e)

    // The original error (not the save error) must propagate
    expect(thrown).toBe(originalError)
    expect(thrown.message).toBe('Build crashed')
    expect(failingSave).toHaveBeenCalledTimes(1)
  })

  // Test 4: Normal API path exit (no exception) still saves with correct status — regression guard
  it('normal exit (no exception) skips the failure-save and uses the correct apiRunStatus', async () => {
    ctxBuilder.recordPhase('design', 'completed', 'Design done')
    ctxBuilder.recordPhase('codegen', 'completed', '12 files')
    ctxBuilder.recordPhase('build', 'completed', 'Build succeeded')
    ctxBuilder.recordPhase('validate', 'completed', 'All tests passed')

    const apiBlock = vi.fn().mockResolvedValue(undefined)

    // No throw — failure save should NOT be called
    await runApiPathWithFailureSave(mockSave, ctxBuilder, '/tmp/output', apiBlock)
    expect(mockSave).not.toHaveBeenCalled()

    // Success save (the existing block outside try/catch) uses real status
    await runSuccessSave(mockSave, ctxBuilder, '/tmp/output', 'completed')

    expect(mockSave).toHaveBeenCalledTimes(1)
    const savedCtx = mockSave.mock.calls[0][1] as ReturnType<RunContextBuilder['build']>
    expect(savedCtx.status).toBe('completed')
    expect(savedCtx.phases.design?.status).toBe('completed')
    expect(savedCtx.phases.codegen?.status).toBe('completed')
  })
})
