import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import { EpipeError, CliError, type Runner } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

// Phase 02 Plan 03 (FOUND-03): EPIPE surfaces as typed EpipeError in the
// resolve-only inner Promise. The outer function currently `throws` when
// result.success is false; the test asserts the thrown message is EpipeError-prefixed.

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  }
})

const { spawn } = await import('node:child_process')
const { createClaudeCliFixFn } = await import('../src/claude-cli-fix.js')

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
        // Also fire 'close' so the un-fixed code path (no stdin error handler)
        // still settles — the test then fails because no EpipeError prefix.
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

function fakeRunner(): Runner {
  return {
    exec: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => {}),
    glob: vi.fn(async () => []),
    mkdir: vi.fn(async () => {}),
    capabilities: vi.fn(async () => ({
      hasMaestro: false,
      hasXcodebuild: false,
      hasXcodegen: false,
      hasSemgrep: false,
      hasJava: false,
      hasGradle: false,
      hasAdb: false,
      hasEmulator: false,
      hasAndroidSdk: false,
    })),
  } as unknown as Runner
}

const emptyFailures: ValidationResult = {
  unit: { failures: [], total: 0, passed: 0 },
  ui: { results: [], passed: true },
  security: { findings: [] },
} as unknown as ValidationResult

describe('createClaudeCliFixFn — EPIPE handling', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('surfaces EPIPE as EpipeError-prefixed error from the inner spawn Promise', async () => {
    vi.mocked(spawn).mockImplementation((() => makeFakeChildEmittingEpipeOnStdin()) as any)

    const fixFn = createClaudeCliFixFn({
      runner: fakeRunner(),
      projectDir: '/tmp/proj',
      timeoutMs: 60_000,
    })

    // The top-level function re-throws the inner envelope's error.
    // Construct a failures object large enough to produce a prompt of known size.
    const padFailureMessage = 'x'.repeat(100_000)
    const failures: ValidationResult = {
      unit: {
        failures: [{ suiteName: 'S', testName: 'T', error: padFailureMessage }],
        total: 1,
        passed: 0,
      },
      ui: { results: [], passed: true },
      security: { findings: [] },
    } as unknown as ValidationResult

    await expect(fixFn(failures)).rejects.toThrow(/^EpipeError:/)

    try {
      await fixFn(failures)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toMatch(/^EpipeError:/)
      expect(msg).toContain('packages/fix/claude-cli-fix.ts')
      // Error message contains payload byte count — exact count depends on prompt template,
      // but the numeric byte count string must appear.
      expect(msg).toMatch(/\d{5,} bytes/)
    }
  })

  it('exports EpipeError from @appifex/core (smoke)', () => {
    const e = new EpipeError('msg', 'site', 42)
    expect(e).toBeInstanceOf(CliError)
    expect(e.name).toBe('EpipeError')
  })

  // Suppress unused-var warning; emptyFailures may be used in a future test extension.
  void emptyFailures
})
