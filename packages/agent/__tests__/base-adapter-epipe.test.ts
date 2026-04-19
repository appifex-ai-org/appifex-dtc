import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import { EpipeError, CliError } from '@appifex/core'

// Phase 02 Plan 03 (FOUND-03): EPIPE surfaces in AgentResult via the settle() helper.

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  }
})

const { spawn } = await import('node:child_process')
const { spawnAgent } = await import('../src/adapters/base.js')

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
        const err: NodeJS.ErrnoException = new Error('write EPIPE') as NodeJS.ErrnoException
        err.code = 'EPIPE'
        stdinEmitter.emit('error', err)
        // Fire close so un-fixed path settles — test fails because no EpipeError mention.
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

describe('spawnAgent (agent base adapter) — EPIPE handling', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('surfaces EPIPE in AgentResult.error with EpipeError: prefix', async () => {
    const fakeChild = makeFakeChildEmittingEpipeOnStdin()
    vi.mocked(spawn).mockReturnValueOnce(fakeChild as any)

    const prompt = 'x'.repeat(100_000)
    const expectedBytes = Buffer.byteLength(prompt, 'utf8')

    const result = await spawnAgent('claude', ['--print'], {
      prompt,
      cwd: '/tmp',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error!).toMatch(/^EpipeError:/)
    expect(result.error!).toContain('packages/agent/adapters/base.ts')
    expect(result.error!).toContain(String(expectedBytes))
  })

  it('exports EpipeError from @appifex/core (smoke)', () => {
    const e = new EpipeError('msg', 'site', 42)
    expect(e).toBeInstanceOf(CliError)
  })
})
