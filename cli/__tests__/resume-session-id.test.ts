import { describe, it, expect } from 'vitest'
import { resolveResumeSessionId } from '../src/entry.js'

describe('resolveResumeSessionId (RESUME-01)', () => {
  it('bare --resume (boolean true) loads agentSessionId from previous context', () => {
    const result = resolveResumeSessionId(true, { agentSessionId: 'sess-abc' })
    expect(result).toBe('sess-abc')
  })

  it('bare --resume with no previous context throws', () => {
    expect(() => resolveResumeSessionId(true, null)).toThrow(
      '--resume requires a session ID or a previous run with an agentSessionId',
    )
  })

  it('bare --resume with context but no agentSessionId throws', () => {
    expect(() => resolveResumeSessionId(true, {})).toThrow(
      '--resume requires a session ID or a previous run with an agentSessionId',
    )
  })

  it('explicit string session ID passes through unchanged', () => {
    const result = resolveResumeSessionId('explicit-id', null)
    expect(result).toBe('explicit-id')
  })

  it('undefined (no --resume flag) returns undefined', () => {
    const result = resolveResumeSessionId(undefined, { agentSessionId: 'sess-xyz' })
    expect(result).toBeUndefined()
  })
})
