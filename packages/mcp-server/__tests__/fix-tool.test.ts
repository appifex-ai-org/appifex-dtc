import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Runner, DtcConfig } from '@appifex/core'

const codexFixFn = vi.fn()
const claudeFixFn = vi.fn()
const defaultFixFn = vi.fn()

vi.mock('@appifex/fix', () => ({
  createCodexCliFixFn: vi.fn(() => codexFixFn),
  createClaudeCliFixFn: vi.fn(() => claudeFixFn),
  createDefaultFixFn: vi.fn(() => defaultFixFn),
  fixLoop: vi.fn(async () => ({
    status: 'all_green',
    attempts: [],
    unresolvedFailures: [],
    rollbackApplied: false,
    totalTokensUsed: 0,
    totalDuration: 0,
  })),
}))

vi.mock('@appifex/validate', () => ({
  validateAll: vi.fn(async () => ({
    ui: {
      total: 1,
      passed: 0,
      failed: 1,
      results: [{ flowName: 'weather', passed: false, error: 'missing id', assertions: [] }],
    },
    unit: { total: 0, passed: 0, failed: 0, failures: [] },
    allPassed: false,
  })),
}))

vi.mock('@appifex/build', () => ({
  buildSwift: vi.fn(async () => ({ success: true, duration: 1 })),
  buildKotlin: vi.fn(async () => ({ success: true, duration: 1 })),
}))

const fix = await import('@appifex/fix')
const { handleFix } = await import('../src/tools/fix.js')

function config(provider: DtcConfig['llm']['provider']): DtcConfig {
  return {
    llm: { provider, apiKey: '', model: provider === 'codex-cli' ? 'gpt-5.5' : 'default' },
    design: { tool: 'prompt' },
    runner: { type: 'local' },
    baas: { provider: 'mock' },
  } as DtcConfig
}

describe('handleFix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects Codex CLI fix when configured with codex-cli provider', async () => {
    await handleFix(
      { platform: 'swiftui', projectDir: '/tmp/proj' },
      {} as Runner,
      config('codex-cli'),
    )

    expect(fix.createCodexCliFixFn).toHaveBeenCalledWith(
      expect.objectContaining({ projectDir: '/tmp/proj', model: 'gpt-5.5' }),
    )
    expect(fix.fixLoop).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ fixFn: codexFixFn }),
    )
  })
})
