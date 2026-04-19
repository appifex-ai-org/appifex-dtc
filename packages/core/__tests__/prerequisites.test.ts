// Phase 1 Plan 01-10 (GATE-02 fix): checkLlmAccess must pass when DTC_LLM_MODE=fixture
// so hermetic CI (no ~/.dtc/config.json, no ANTHROPIC_API_KEY) can start the pipeline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkCriticalPrerequisites } from '../src/prerequisites.js'
import type { DtcConfig, Platform } from '../src/types.js'

const emptyAnthropicConfig: DtcConfig = {
  llm: { provider: 'anthropic', apiKey: '' },
  design: { tool: 'pencil' },
  runner: { type: 'local' },
}

function findLlmCheck(report: ReturnType<typeof checkCriticalPrerequisites>) {
  const llm = report.checks.find((c) => c.name === 'LLM access')
  if (!llm) throw new Error('LLM access check missing from report')
  return llm
}

describe('checkCriticalPrerequisites — LLM access under fixture mode', () => {
  const prevMode = process.env.DTC_LLM_MODE

  beforeEach(() => {
    delete process.env.DTC_LLM_MODE
  })

  afterEach(() => {
    if (prevMode === undefined) delete process.env.DTC_LLM_MODE
    else process.env.DTC_LLM_MODE = prevMode
  })

  it('fails when DTC_LLM_MODE is unset and anthropic apiKey is missing', () => {
    const report = checkCriticalPrerequisites('kotlin-compose', emptyAnthropicConfig)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('fail')
    expect(llm.message).toMatch(/anthropic API key missing/)
  })

  it('passes when DTC_LLM_MODE=fixture even with empty apiKey', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const report = checkCriticalPrerequisites('kotlin-compose', emptyAnthropicConfig)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })

  it('passes when DTC_LLM_MODE=fixture and no config is supplied', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const report = checkCriticalPrerequisites('kotlin-compose')
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })

  it('fixture short-circuit wins over the claude-cli provider branch', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const cfg: DtcConfig = {
      llm: { provider: 'claude-cli', apiKey: '' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('kotlin-compose', cfg)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })
})

// Phase 02 (DX-01): unzip is invoked unconditionally by the design adapters
// (packages/design/src/design-zip.ts). Surface missing-unzip at preflight
// instead of letting the pipeline fail opaquely mid-run.
describe('checkCriticalPrerequisites — unzip', () => {
  it('registers an `unzip` check for swiftui', () => {
    const cfg: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('swiftui', cfg)
    const unzip = report.checks.find((c) => c.name === 'unzip')
    expect(unzip).toBeDefined()
  })

  it('registers an `unzip` check for kotlin-compose', () => {
    const cfg: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('kotlin-compose', cfg)
    const unzip = report.checks.find((c) => c.name === 'unzip')
    expect(unzip).toBeDefined()
  })

  it('passes when unzip is present on PATH (host runs this test with unzip installed)', () => {
    const cfg: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('swiftui', cfg)
    const unzip = report.checks.find((c) => c.name === 'unzip')
    expect(unzip?.severity).toBe('critical')
    // Host CI will have unzip, so status should be 'pass'.
    expect(unzip?.status).toBe('pass')
  })

  it('fails with `unzip not found` when `which unzip` throws (simulated via execSync mock)', async () => {
    // Re-import prerequisites under a child_process mock so `which('unzip')`
    // returns false. Other `execSync` calls fall back to throwing too — the
    // test only asserts on the `unzip` check, so other checks may flip to
    // `fail` but that's fine for our scoped assertion.
    vi.resetModules()
    vi.doMock('node:child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('command not found')
      }),
    }))

    const mod = await import('../src/prerequisites.js')
    const cfg: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    for (const platform of ['swiftui', 'kotlin-compose'] as Platform[]) {
      const report = mod.checkCriticalPrerequisites(platform, cfg)
      const unzip = report.checks.find((c) => c.name === 'unzip')
      expect(unzip).toBeDefined()
      expect(unzip?.status).toBe('fail')
      expect(unzip?.severity).toBe('critical')
      expect(unzip?.message).toBe('unzip not found')
      expect(unzip?.installHint).toContain('brew install unzip')
    }

    vi.doUnmock('node:child_process')
    vi.resetModules()
  })
})
