// Plan 01 wave-0: this file fails because the drift gate is unwired in cli/src/pipeline.ts.
// Plan 03 Task 2 wires the gate by exporting runDesignDeltaPhase and RunDesignDeltaDeps;
// this file is NOT edited in Plan 03 — assertions flip GREEN automatically when the source
// is wired correctly.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunContextBuilder, type ProgressEvent, type DesignTokens } from '@appifex/core'

// Mock @appifex/analysis so diffDesignTokens returns a controlled delta per test.
vi.mock('@appifex/analysis', async () => {
  const actual = await vi.importActual<typeof import('@appifex/analysis')>('@appifex/analysis')
  return {
    ...actual,
    diffDesignTokens: vi.fn(),
  }
})

// Import the to-be-created exported function + deps type from pipeline.ts.
// Plan 01: runDesignDeltaPhase does not exist yet → import resolves to undefined →
// calling it throws TypeError → every test fails (the Plan 01 RED signal).
// Plan 03 Task 2: exports runDesignDeltaPhase → tests flip GREEN.
import { runDesignDeltaPhase, type RunDesignDeltaDeps } from '../src/pipeline.js'
import { diffDesignTokens } from '@appifex/analysis'

const diffMock = vi.mocked(diffDesignTokens)

const baseExistingTokens: DesignTokens = {
  colors: { primary: '#ffffff' },
  typography: {},
  spacing: { md: 8 },
  borderRadius: {},
}

const baseNewTokens: DesignTokens = {
  colors: { primary: '#ffffff' },
  typography: {},
  spacing: { md: 8 },
  borderRadius: {},
}

function makeCtxBuilder() {
  return new RunContextBuilder({
    prompt: 'Add dark mode',
    platform: 'swiftui',
    mode: 'add-feature',
  })
}

function makeDeps(overrides: Partial<RunDesignDeltaDeps> = {}): {
  deps: RunDesignDeltaDeps
  emitted: ProgressEvent[]
  ctxBuilder: RunContextBuilder
} {
  const emitted: ProgressEvent[] = []
  const ctxBuilder = makeCtxBuilder()
  const deps: RunDesignDeltaDeps = {
    runMode: 'add-feature',
    existingDesignTokens: baseExistingTokens,
    newDesignTokens: baseNewTokens,
    ctxBuilder,
    emit: (phase, status, message) => {
      emitted.push({ phase, status, message, timestamp: Date.now() } as ProgressEvent)
    },
    interactive: true,
    readline: {
      question: vi.fn((_prompt: string, cb: (answer: string) => void) => cb('y')),
      close: vi.fn(),
    },
    ...overrides,
  }
  return { deps, emitted, ctxBuilder }
}

beforeEach(() => {
  diffMock.mockReset()
})

describe('pipeline design_delta phase', () => {
  it('interactive add-feature with changed tokens, user answers y → emits design_delta completed and proceeds (no throw)', async () => {
    diffMock.mockReturnValue({
      added: [],
      removed: [],
      changed: [{ category: 'colors', name: 'primary', oldValue: '#ffffff', newValue: '#fefefe' }],
    })
    const rl = {
      question: vi.fn((_prompt: string, cb: (answer: string) => void) => cb('y')),
      close: vi.fn(),
    }
    const { deps, emitted } = makeDeps({ readline: rl })

    await expect(runDesignDeltaPhase(deps)).resolves.not.toThrow()

    expect(emitted.some((e) => e.phase === 'design_delta' && e.status === 'completed')).toBe(true)
  })

  it('interactive add-feature with changed tokens, user answers n → pipeline throws with cancel message', async () => {
    diffMock.mockReturnValue({
      added: [],
      removed: [],
      changed: [{ category: 'colors', name: 'primary', oldValue: '#ffffff', newValue: '#fefefe' }],
    })
    const rl = {
      question: vi.fn((_prompt: string, cb: (answer: string) => void) => cb('n')),
      close: vi.fn(),
    }
    const { deps } = makeDeps({ readline: rl })

    await expect(runDesignDeltaPhase(deps)).rejects.toThrow(
      'Pipeline cancelled by user at pre-build summary.',
    )
  })

  it('non-interactive add-feature with changed tokens and no acceptDrift → throws error mentioning designDelta and --accept-drift', async () => {
    diffMock.mockReturnValue({
      added: [],
      removed: [],
      changed: [{ category: 'colors', name: 'bg', oldValue: '#fff', newValue: '#eee' }],
    })
    const { deps } = makeDeps({ interactive: false, readline: undefined })

    let thrownError: Error | undefined
    try {
      await runDesignDeltaPhase(deps)
    } catch (e) {
      thrownError = e as Error
    }

    expect(thrownError).toBeDefined()
    expect(thrownError!.message).toContain('designDelta')
    expect(thrownError!.message).toContain('--accept-drift')
  })

  it('non-interactive add-feature with pure addition (changed=[], removed=[]) → no throw, pipeline proceeds', async () => {
    diffMock.mockReturnValue({
      added: [{ category: 'colors', name: 'accent', value: '#00d632' }],
      removed: [],
      changed: [],
    })
    const { deps } = makeDeps({ interactive: false, readline: undefined })

    await expect(runDesignDeltaPhase(deps)).resolves.not.toThrow()
  })

  it('add-feature run with existingDesignTokens === null → emits design_delta skipped and does not set designDelta on run-context', async () => {
    const { deps, emitted, ctxBuilder } = makeDeps({ existingDesignTokens: null })

    await runDesignDeltaPhase(deps)

    expect(emitted.some((e) => e.phase === 'design_delta' && e.status === 'skipped')).toBe(true)
    const ctx = ctxBuilder.build('completed')
    expect(ctx.designDelta).toBeUndefined()
    // diffDesignTokens must not be called when there's no baseline
    expect(diffMock).not.toHaveBeenCalled()
  })

  it('fresh-app run (runMode !== add-feature) → NO design_delta events emitted, no designDelta on run-context', async () => {
    diffMock.mockReturnValue({ added: [], removed: [], changed: [] })
    const { deps, emitted, ctxBuilder } = makeDeps({ runMode: 'fresh', existingDesignTokens: null })

    await runDesignDeltaPhase(deps)

    expect(emitted.some((e) => e.phase === 'design_delta')).toBe(false)
    const ctx = ctxBuilder.build('completed')
    expect(ctx.designDelta).toBeUndefined()
  })
})
