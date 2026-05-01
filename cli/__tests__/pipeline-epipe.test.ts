import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import { EpipeError, CliError } from '@appifex/core'

// Phase 02 Plan 03 (FOUND-03): EPIPE at `claude --print` spawn site in cli/src/pipeline.ts
// must REJECT the surrounding Promise with EpipeError (reject-capable site).

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  }
})

const { spawn } = await import('node:child_process')
// runClaudePrint is the exported helper extracted from buildCreateMessageFn so the
// spawn site is unit-testable. This import will fail until Task 2 adds the export.
const pipelineModule: { runClaudePrint?: (...args: unknown[]) => unknown } =
  await import('../src/pipeline.js')
const pipelineModuleWithCodex: { runCodexExec?: (...args: unknown[]) => unknown } = pipelineModule

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

describe('runClaudePrint (cli/pipeline.ts) — EPIPE handling', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('rejects with EpipeError when stdin emits EPIPE', async () => {
    // If runClaudePrint is not exported yet, fail early with a clear message.
    expect(typeof pipelineModule.runClaudePrint).toBe('function')

    vi.mocked(spawn).mockImplementation((() => makeFakeChildEmittingEpipeOnStdin()) as any)

    const prompt = 'x'.repeat(100_000)
    const expectedBytes = Buffer.byteLength(prompt, 'utf8')

    const p = pipelineModule.runClaudePrint!({
      prompt,
      model: 'claude-sonnet-4-6',
      cwd: '/tmp',
    })

    await expect(p).rejects.toThrow(EpipeError)

    try {
      await pipelineModule.runClaudePrint!({
        prompt,
        model: 'claude-sonnet-4-6',
        cwd: '/tmp',
      })
    } catch (err) {
      expect(err).toBeInstanceOf(EpipeError)
      expect(err).toBeInstanceOf(CliError)
      const epipe = err as EpipeError
      expect(epipe.site).toBe('cli/pipeline.ts:claude-print')
      expect(epipe.payloadBytes).toBe(expectedBytes)
      expect(epipe.name).toBe('EpipeError')
    }
  })
})

describe('runCodexExec (cli/pipeline.ts) — EPIPE handling', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('rejects with EpipeError when stdin emits EPIPE', async () => {
    expect(typeof pipelineModuleWithCodex.runCodexExec).toBe('function')

    vi.mocked(spawn).mockImplementation((() => makeFakeChildEmittingEpipeOnStdin()) as any)

    const prompt = 'x'.repeat(100_000)
    const expectedBytes = Buffer.byteLength(prompt, 'utf8')

    await expect(
      pipelineModuleWithCodex.runCodexExec!({
        prompt,
        model: 'default',
        cwd: '/tmp',
      }),
    ).rejects.toThrow(EpipeError)

    try {
      await pipelineModuleWithCodex.runCodexExec!({
        prompt,
        model: 'default',
        cwd: '/tmp',
      })
    } catch (err) {
      expect(err).toBeInstanceOf(EpipeError)
      const epipe = err as EpipeError
      expect(epipe.site).toBe('cli/pipeline.ts:codex-exec')
      expect(epipe.payloadBytes).toBe(expectedBytes)
    }
  })
})
