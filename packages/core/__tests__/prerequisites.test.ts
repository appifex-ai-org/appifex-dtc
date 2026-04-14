// Phase 1 Plan 01-10 (GATE-02 fix): checkLlmAccess must pass when DTC_LLM_MODE=fixture
// so hermetic CI (no ~/.dtc/config.json, no ANTHROPIC_API_KEY) can start the pipeline.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkCriticalPrerequisites } from '../src/prerequisites.js'
import type { DtcConfig } from '../src/types.js'

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
