import { describe, it, expect, vi, afterEach } from 'vitest'
import { CliError, PreflightError, ConfigError } from '@appifex/core'
import { handleCliError } from '../src/entry.js'

describe('handleCliError — Phase 02 Plan 01 (FOUND-04)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exits with err.exitCode when a CliError is thrown', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code}__`)
    }) as never)

    expect(() => handleCliError(new PreflightError('missing tool'))).toThrow('__exit_1__')
    expect(errorSpy).toHaveBeenCalled()
    const firstMessage = errorSpy.mock.calls[0]?.[0] as string
    expect(firstMessage).toMatch(/PreflightError/)
    expect(firstMessage).toMatch(/missing tool/)
  })

  it('respects custom exitCode on CliError subclasses', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code}__`)
    }) as never)

    class CustomErr extends CliError {
      constructor() {
        super('custom', 42)
        this.name = 'CustomErr'
      }
    }
    expect(() => handleCliError(new CustomErr())).toThrow('__exit_42__')
    expect(exitSpy).toHaveBeenCalledWith(42)
  })

  it('exits 1 on a non-CliError and prints the stringified error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code}__`)
    }) as never)

    expect(() => handleCliError(new Error('boom-generic'))).toThrow('__exit_1__')
    const firstMessage = errorSpy.mock.calls[0]?.[0] as string
    expect(firstMessage).toMatch(/boom-generic/)
  })

  it('ConfigError is a CliError subclass and flows through handleCliError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code}__`)
    }) as never)

    const err = new ConfigError('bad config', 'llm.apiKey')
    expect(err).toBeInstanceOf(CliError)
    expect(err.configKey).toBe('llm.apiKey')
    expect(() => handleCliError(err)).toThrow('__exit_1__')
  })
})
