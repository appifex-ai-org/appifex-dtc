import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { EpipeError, CliError } from '@appifex/core'

// Phase 02 Plan 03 (FOUND-03): EPIPE surfaces as typed EpipeError in ClaudeCliResult.error
// Mock node:child_process.spawn so the fake child's stdin emits { code: 'EPIPE' } on write.

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  }
})

// Import after the mock is registered so the runClaude export picks up our mock
const { spawn } = await import('node:child_process')
const { runClaude } = await import('../src/claude-cli-generate.js')

function makeFakeChildEmittingEpipeOnStdin() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const stdinEmitter = new EventEmitter()
  const stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: (_chunk: any) => {
      setImmediate(() => {
        const err: NodeJS.ErrnoException = new Error(
          'write EPIPE',
        ) as NodeJS.ErrnoException
        err.code = 'EPIPE'
        stdinEmitter.emit('error', err)
        // Also fire 'close' afterwards so the un-fixed production code path
        // (which has no stdin error handler) still settles — the test will
        // then fail because the envelope is success:true with no EpipeError mention.
        setImmediate(() => {
          child.emit('close', 0)
        })
      })
      return true
    },
    end: () => {},
  } as unknown as Writable
  child.stdin = stdin
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  return child
}

describe('runClaude (claude-cli-generate) — EPIPE handling', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('surfaces EPIPE as EpipeError-prefixed error in ClaudeCliResult envelope', async () => {
    const fakeChild = makeFakeChildEmittingEpipeOnStdin()
    vi.mocked(spawn).mockReturnValueOnce(fakeChild as any)

    const prompt = 'x'.repeat(100_000)
    const expectedBytes = Buffer.byteLength(prompt, 'utf8')

    const result = await runClaude(prompt, '/tmp', 'claude-sonnet-4-6', 60_000)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toMatch(/^EpipeError:/)
    expect(result.error).toContain('packages/codegen/claude-cli-generate.ts')
    expect(result.error).toContain(String(expectedBytes))
  })

  it('exports EpipeError from @appifex/core as a CliError subclass (smoke)', () => {
    const e = new EpipeError('msg', 'site', 42)
    expect(e).toBeInstanceOf(CliError)
    expect(e.name).toBe('EpipeError')
    expect(e.site).toBe('site')
    expect(e.payloadBytes).toBe(42)
  })
})
