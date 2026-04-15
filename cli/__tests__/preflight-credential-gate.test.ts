// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import { describe, it } from 'vitest'

describe('preflight credential gate', () => {
  it.todo('fails before LLM spend on MISSING ASC key')
  it.todo('fails before LLM spend on MISSING LLM API key')
  it.todo('passes when all credentials are OK')
  it.todo('returns INVALID status for malformed ASC key path')
  it.todo('returns EXPIRED status for past-expiry ASC JWT')
})
