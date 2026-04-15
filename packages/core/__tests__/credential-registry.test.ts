// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import { describe, it } from 'vitest'

describe('CredentialRegistry', () => {
  it.todo('runCredentialChecks returns OK report in fixture mode')
  it.todo('runCredentialChecks returns MISSING for undefined config (llm probe)')
  it.todo('runCredentialChecks hasBlockingFailures true when LLM key missing')
  it.todo('probeLlm returns OK when apiKey is present')
  it.todo('probeLlm returns MISSING when apiKey is empty string')
  it.todo('probeAsc returns MISSING when ascKeyPath absent')
  it.todo('probeAsc returns INVALID for bad PEM file')
  it.todo('probeFirebase returns MISSING when firebase config absent')
  it.todo('probeGoogleOauth returns OK (skeleton: transient)')
  it.todo('probeAppleOauth returns OK when no apple oauth config (info only)')
})
