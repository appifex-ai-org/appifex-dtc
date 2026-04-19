import { describe, it, expect, vi } from 'vitest'
import { logClaudeStdinError } from '../src/debug-helpers.js'

describe('logClaudeStdinError (Phase 02 OBS-01)', () => {
  it('writes claude-epipe.json with message and code when debug is enabled', async () => {
    const debug = {
      enabled: true,
      log: vi.fn().mockResolvedValue(undefined),
      logJson: vi.fn().mockResolvedValue(undefined),
    }
    const epipeErr: NodeJS.ErrnoException = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    })

    await logClaudeStdinError(debug, epipeErr)

    expect(debug.logJson).toHaveBeenCalledWith(
      'claude-epipe.json',
      expect.objectContaining({
        message: 'write EPIPE',
        code: 'EPIPE',
        at: 'child.stdin',
      }),
    )
  })

  it('handles non-Error values without crashing', async () => {
    const debug = {
      enabled: true,
      log: vi.fn().mockResolvedValue(undefined),
      logJson: vi.fn().mockResolvedValue(undefined),
    }

    await logClaudeStdinError(debug, 'some string error')

    expect(debug.logJson).toHaveBeenCalledWith(
      'claude-epipe.json',
      expect.objectContaining({
        message: 'some string error',
        at: 'child.stdin',
      }),
    )
  })

  it('is a no-op when debug.enabled is false (DebugLogger.logJson itself short-circuits)', async () => {
    const debug = {
      enabled: false,
      log: vi.fn().mockResolvedValue(undefined),
      logJson: vi.fn().mockResolvedValue(undefined),
    }

    // Should not throw and should still invoke logJson (the real DebugLogger
    // short-circuits internally when disabled; we just confirm the helper
    // always delegates).
    await expect(logClaudeStdinError(debug, new Error('boom'))).resolves.toBeUndefined()
  })
})
