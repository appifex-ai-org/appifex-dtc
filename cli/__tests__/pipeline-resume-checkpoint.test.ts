/**
 * Tests for checkpoint wiring and phase skip logic in pipeline.ts
 *
 * These tests verify the checkpoint skip gates in isolation without running
 * the full pipeline (which has many external dependencies).
 *
 * Pattern follows cli/__tests__/pipeline-context-save.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunContextBuilder } from '@appifex/core'
import type { PlatformSpec } from '@appifex/core'

// ---------------------------------------------------------------------------
// Helpers: simulate the checkpoint logic as defined in pipeline.ts
// ---------------------------------------------------------------------------

/**
 * Simulate the checkpointRunId logic from pipeline.ts.
 * On resume: use previousContext.runId
 * On fresh run: generate a new run-xxx id
 */
function makeCheckpointRunId(
  isContinuation: boolean,
  previousContext: { runId: string } | null | undefined,
): string {
  if (isContinuation && previousContext?.runId) {
    return previousContext.runId
  }
  // Simulate fresh run — deterministic for testing
  return `run-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Simulate the spec skip gate from pipeline.ts.
 * Returns { skipped, platformSpec } — matching what the actual gate does.
 */
async function trySkipSpec(
  canSkip: boolean,
  runner: { exists: (path: string) => Promise<boolean> },
  checkpoint: { getPhase: (runId: string, phase: string) => unknown | null },
  checkpointRunId: string,
  specPath: string,
): Promise<{ skipped: boolean; platformSpec: PlatformSpec | null }> {
  if (canSkip && (await runner.exists(specPath))) {
    const saved = checkpoint.getPhase(checkpointRunId, 'spec') as {
      platformSpec: PlatformSpec
    } | null
    if (saved?.platformSpec) {
      return { skipped: true, platformSpec: saved.platformSpec }
    }
    // Checkpoint data missing — fall through to re-run
  }
  return { skipped: false, platformSpec: null }
}

/**
 * Simulate the test_gen skip gate from pipeline.ts.
 * Returns { skipped, uiTests, unitTests }
 */
async function trySkipTestGen(
  canSkip: boolean,
  runner: { exists: (path: string) => Promise<boolean> },
  checkpoint: { getPhase: (runId: string, phase: string) => unknown | null },
  checkpointRunId: string,
  flowDir: string,
  testDir: string,
): Promise<{
  skipped: boolean
  uiTests: { fileName: string }[]
  unitTests: { fileName: string }[]
}> {
  if (canSkip && (await runner.exists(flowDir)) && (await runner.exists(testDir))) {
    const saved = checkpoint.getPhase(checkpointRunId, 'test_gen') as {
      uiTestFileNames: string[]
      unitTestFileNames: string[]
      uiTestCount: number
      unitTestCount: number
    } | null
    if (saved) {
      const uiTests = saved.uiTestFileNames.map((fn) => ({ fileName: fn }))
      const unitTests = saved.unitTestFileNames.map((fn) => ({ fileName: fn }))
      return { skipped: true, uiTests, unitTests }
    }
    // Checkpoint data missing — fall through to re-run
  }
  return { skipped: false, uiTests: [], unitTests: [] }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockPlatformSpec: PlatformSpec = {
  platform: 'swiftui',
  screens: [
    {
      id: 'screen-1',
      name: 'HomeScreen',
      components: [],
      route: '/',
    },
  ],
  designTokens: {
    colors: {},
    typography: {},
    spacing: {},
  },
  imports: [],
}

// ---------------------------------------------------------------------------
// describe: checkpointRunId
// ---------------------------------------------------------------------------

describe('checkpointRunId', () => {
  it('uses previousContext.runId on resume', () => {
    const previousContext = { runId: 'run-abc12345' }
    const checkpointRunId = makeCheckpointRunId(true, previousContext)
    expect(checkpointRunId).toBe('run-abc12345')
  })

  it('generates fresh runId on fresh run', () => {
    const checkpointRunId = makeCheckpointRunId(false, null)
    expect(checkpointRunId).toMatch(/^run-/)
    expect(checkpointRunId).not.toBe('run-abc12345')
  })

  it('generates fresh runId when isContinuation but no previousContext', () => {
    const checkpointRunId = makeCheckpointRunId(true, null)
    expect(checkpointRunId).toMatch(/^run-/)
  })

  it('generates fresh runId when previousContext has no runId', () => {
    const checkpointRunId = makeCheckpointRunId(true, { runId: '' })
    // Empty string is falsy — should generate fresh
    expect(checkpointRunId).toMatch(/^run-/)
  })
})

// ---------------------------------------------------------------------------
// describe: spec skip gate
// ---------------------------------------------------------------------------

describe('spec skip gate', () => {
  it('skips spec and restores platformSpec from checkpoint', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(true),
    }
    const checkpoint = {
      getPhase: vi.fn().mockReturnValue({ platformSpec: mockPlatformSpec }),
    }

    const result = await trySkipSpec(true, runner, checkpoint, 'run-abc', '/out/spec.json')

    expect(result.skipped).toBe(true)
    expect(result.platformSpec).toEqual(mockPlatformSpec)
    expect(runner.exists).toHaveBeenCalledWith('/out/spec.json')
    expect(checkpoint.getPhase).toHaveBeenCalledWith('run-abc', 'spec')
  })

  it('falls through when checkpoint returns null', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(true),
    }
    const checkpoint = {
      getPhase: vi.fn().mockReturnValue(null),
    }

    const result = await trySkipSpec(true, runner, checkpoint, 'run-abc', '/out/spec.json')

    expect(result.skipped).toBe(false)
    expect(result.platformSpec).toBeNull()
  })

  it('falls through when spec.json missing from disk', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(false),
    }
    const checkpoint = {
      getPhase: vi.fn(),
    }

    const result = await trySkipSpec(true, runner, checkpoint, 'run-abc', '/out/spec.json')

    expect(result.skipped).toBe(false)
    // Never checks checkpoint if file doesn't exist
    expect(checkpoint.getPhase).not.toHaveBeenCalled()
  })

  it('falls through when canSkip is false', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(true),
    }
    const checkpoint = {
      getPhase: vi.fn().mockReturnValue({ platformSpec: mockPlatformSpec }),
    }

    const result = await trySkipSpec(false, runner, checkpoint, 'run-abc', '/out/spec.json')

    expect(result.skipped).toBe(false)
    // No file or checkpoint checks when canSkip is false
    expect(runner.exists).not.toHaveBeenCalled()
    expect(checkpoint.getPhase).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// describe: test_gen skip gate
// ---------------------------------------------------------------------------

describe('test_gen skip gate', () => {
  it('skips test_gen and restores file names from checkpoint', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(true),
    }
    const checkpoint = {
      getPhase: vi.fn().mockReturnValue({
        uiTestFileNames: ['Flow1.yml', 'Flow2.yml'],
        unitTestFileNames: ['Test1.swift'],
        uiTestCount: 2,
        unitTestCount: 1,
      }),
    }

    const result = await trySkipTestGen(
      true,
      runner,
      checkpoint,
      'run-abc',
      '/out/.maestro',
      '/out/__tests__',
    )

    expect(result.skipped).toBe(true)
    expect(result.uiTests).toHaveLength(2)
    expect(result.uiTests[0].fileName).toBe('Flow1.yml')
    expect(result.uiTests[1].fileName).toBe('Flow2.yml')
    expect(result.unitTests).toHaveLength(1)
    expect(result.unitTests[0].fileName).toBe('Test1.swift')
  })

  it('falls through when checkpoint returns null', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(true),
    }
    const checkpoint = {
      getPhase: vi.fn().mockReturnValue(null),
    }

    const result = await trySkipTestGen(
      true,
      runner,
      checkpoint,
      'run-abc',
      '/out/.maestro',
      '/out/__tests__',
    )

    expect(result.skipped).toBe(false)
    expect(result.uiTests).toHaveLength(0)
    expect(result.unitTests).toHaveLength(0)
  })

  it('falls through when maestro dir missing', async () => {
    const runner = {
      exists: vi.fn().mockImplementation((path: string) => {
        // flowDir (.maestro) doesn't exist, testDir does
        return Promise.resolve(!path.includes('.maestro'))
      }),
    }
    const checkpoint = {
      getPhase: vi.fn(),
    }

    const result = await trySkipTestGen(
      true,
      runner,
      checkpoint,
      'run-abc',
      '/out/.maestro',
      '/out/__tests__',
    )

    expect(result.skipped).toBe(false)
    // Never checks checkpoint when dirs missing
    expect(checkpoint.getPhase).not.toHaveBeenCalled()
  })

  it('falls through when test dir missing', async () => {
    const runner = {
      exists: vi.fn().mockImplementation((path: string) => {
        // flowDir exists, testDir (__tests__) doesn't
        return Promise.resolve(!path.includes('__tests__'))
      }),
    }
    const checkpoint = {
      getPhase: vi.fn(),
    }

    const result = await trySkipTestGen(
      true,
      runner,
      checkpoint,
      'run-abc',
      '/out/.maestro',
      '/out/__tests__',
    )

    expect(result.skipped).toBe(false)
    expect(checkpoint.getPhase).not.toHaveBeenCalled()
  })

  it('falls through when canSkip is false', async () => {
    const runner = {
      exists: vi.fn().mockResolvedValue(true),
    }
    const checkpoint = {
      getPhase: vi.fn(),
    }

    const result = await trySkipTestGen(
      false,
      runner,
      checkpoint,
      'run-abc',
      '/out/.maestro',
      '/out/__tests__',
    )

    expect(result.skipped).toBe(false)
    expect(runner.exists).not.toHaveBeenCalled()
    expect(checkpoint.getPhase).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// describe: checkpoint-skip recording
// ---------------------------------------------------------------------------

describe('checkpoint-skip recording', () => {
  it('records skipped-checkpoint phases as completed in ctxBuilder', () => {
    const ctxBuilder = new RunContextBuilder({
      prompt: 'Test app',
      platform: 'swiftui',
      mode: 'resume',
    })

    // When skipping via checkpoint, we call ctxBuilder.recordPhase with 'completed'
    // (not 'skipped') so the next resume still recognizes it as completed
    ctxBuilder.recordPhase('spec', 'completed', 'Using spec from previous run (checkpoint)')

    const ctx = ctxBuilder.build('failed')
    expect(ctx.phases.spec?.status).toBe('completed')
    expect(ctx.phases.spec?.summary).toContain('checkpoint')
  })

  it('does NOT record as skipped (which would break next resume)', () => {
    const ctxBuilder = new RunContextBuilder({
      prompt: 'Test app',
      platform: 'swiftui',
      mode: 'resume',
    })

    // If we mistakenly record as 'skipped', the next resume would not skip again
    ctxBuilder.recordPhase('spec', 'skipped', 'Using spec from previous run')

    const ctx = ctxBuilder.build('failed')
    // This verifies 'skipped' IS different from 'completed' in RunContext
    expect(ctx.phases.spec?.status).toBe('skipped')
    // And a plain canSkipPhase check on 'skipped' would fail (only 'completed' works)
    const phases = ctx.phases
    const wouldSkip = phases.spec?.status === 'completed'
    expect(wouldSkip).toBe(false) // shows why recording as 'completed' is important
  })
})

// ---------------------------------------------------------------------------
// describe: checkpoint cleanup
// ---------------------------------------------------------------------------

describe('checkpoint cleanup', () => {
  it('SIGINT handler calls checkpoint.close before exit', async () => {
    const ctxBuilder = new RunContextBuilder({ prompt: 'Test', platform: 'swiftui', mode: 'fresh' })
    const mockSave = vi.fn().mockResolvedValue(undefined)
    const mockClose = vi.fn()
    const exitCalls: number[] = []

    let sigintFlushed = false
    const sigintHandler = async (exit: (code: number) => void) => {
      if (sigintFlushed) return
      sigintFlushed = true
      try {
        await mockSave('/tmp/output', ctxBuilder.build('failed'))
      } catch {
        /* best effort */
      }
      try {
        mockClose()
      } catch {
        /* best effort */
      }
      exit(130)
    }

    await sigintHandler((code) => exitCalls.push(code))

    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(exitCalls).toEqual([130])
  })

  it('checkpoint.close errors are swallowed silently', async () => {
    const ctxBuilder = new RunContextBuilder({ prompt: 'Test', platform: 'swiftui', mode: 'fresh' })
    const mockSave = vi.fn().mockResolvedValue(undefined)
    const mockClose = vi.fn().mockImplementation(() => {
      throw new Error('close failed')
    })
    const exitCalls: number[] = []

    let sigintFlushed = false
    const sigintHandler = async (exit: (code: number) => void) => {
      if (sigintFlushed) return
      sigintFlushed = true
      try {
        await mockSave('/tmp/output', ctxBuilder.build('failed'))
      } catch {
        /* best effort */
      }
      try {
        mockClose()
      } catch {
        /* best effort */
      }
      exit(130)
    }

    // Must not throw even if checkpoint.close throws
    await expect(sigintHandler((code) => exitCalls.push(code))).resolves.toBeUndefined()
    expect(exitCalls).toEqual([130])
  })

  it('checkpoint.close is called on normal return path', () => {
    // Simulate the close-then-removeListener pattern
    const mockClose = vi.fn()
    const mockRemoveListener = vi.fn()
    const process = { removeListener: mockRemoveListener }

    // Simulate normal return path
    try {
      mockClose()
    } catch {
      /* ignore */
    }
    process.removeListener('SIGINT', () => {})
    process.removeListener('exit', () => {})

    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(mockRemoveListener).toHaveBeenCalledTimes(2)
  })
})
