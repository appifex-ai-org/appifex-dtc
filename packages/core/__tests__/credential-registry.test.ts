// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { DtcConfig } from '../src/types.js'
import { runCredentialChecks } from '../src/credential-registry.js'

describe('CredentialRegistry', () => {
  let savedMode: string | undefined

  beforeEach(() => {
    savedMode = process.env.DTC_LLM_MODE
  })

  afterEach(() => {
    if (savedMode === undefined) {
      delete process.env.DTC_LLM_MODE
    } else {
      process.env.DTC_LLM_MODE = savedMode
    }
  })

  it('runCredentialChecks returns OK report in fixture mode', async () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const report = await runCredentialChecks(undefined, { deep: false })
    expect(report.hasBlockingFailures).toBe(false)
    expect(report.checks.length).toBeGreaterThan(0)
    expect(report.checks[0].status).toBe('OK')
  })

  it('runCredentialChecks returns MISSING for undefined config (llm probe)', async () => {
    delete process.env.DTC_LLM_MODE
    const report = await runCredentialChecks(undefined, { deep: false })
    const llmCheck = report.checks.find((c) => c.name === 'llm-api-key')
    expect(llmCheck).toBeDefined()
    expect(llmCheck!.status).toBe('MISSING')
    expect(llmCheck!.severity).toBe('critical')
  })

  it('runCredentialChecks hasBlockingFailures true when LLM key missing', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(true)
  })

  it.todo('probeLlm returns OK when apiKey is present')
  it.todo('probeLlm returns MISSING when apiKey is empty string')
  it.todo('probeAsc returns MISSING when ascKeyPath absent')
  it.todo('probeAsc returns INVALID for bad PEM file')
  it.todo('probeFirebase returns MISSING when firebase config absent')
  it.todo('probeGoogleOauth returns OK (skeleton: transient)')
  it.todo('probeAppleOauth returns OK when no apple oauth config (info only)')
})
