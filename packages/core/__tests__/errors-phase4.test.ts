/**
 * Phase 4 (FIRE-04 / FIRE-05): Tests for ProvisionError and SecurityLintError.
 *
 * These tests are written first (TDD RED) before the implementation is added to errors.ts.
 */
import { describe, it, expect } from 'vitest'
import { CliError } from '../src/errors.js'

// Import the new classes — will fail until Task 1 implementation is added
import { ProvisionError, SecurityLintError } from '../src/errors.js'

describe('ProvisionError', () => {
  it('extends CliError', () => {
    const err = new ProvisionError('firebase-tools failed')
    expect(err).toBeInstanceOf(CliError)
    expect(err).toBeInstanceOf(Error)
  })

  it('sets name to ProvisionError', () => {
    const err = new ProvisionError('some failure')
    expect(err.name).toBe('ProvisionError')
  })

  it('sets exitCode to 1', () => {
    const err = new ProvisionError('fail')
    expect(err.exitCode).toBe(1)
  })

  it('preserves the message', () => {
    const err = new ProvisionError('firebase project creation failed')
    expect(err.message).toBe('firebase project creation failed')
  })
})

describe('SecurityLintError', () => {
  it('extends CliError', () => {
    const err = new SecurityLintError('lint failed')
    expect(err).toBeInstanceOf(CliError)
    expect(err).toBeInstanceOf(Error)
  })

  it('sets name to SecurityLintError', () => {
    const err = new SecurityLintError('lint blocked deployment')
    expect(err.name).toBe('SecurityLintError')
  })

  it('sets exitCode to 1', () => {
    const err = new SecurityLintError('lint failed')
    expect(err.exitCode).toBe(1)
  })

  it('preserves the message', () => {
    const err = new SecurityLintError('security lint failed')
    expect(err.message).toBe('security lint failed')
  })

  it('accepts optional violations array', () => {
    const violations = ['open-access rule', 'missing deny-all']
    const err = new SecurityLintError('lint failed', violations)
    expect(err.violations).toEqual(violations)
  })

  it('violations defaults to undefined when not provided', () => {
    const err = new SecurityLintError('lint failed')
    expect(err.violations).toBeUndefined()
  })

  it('violations is readonly', () => {
    const violations = ['violation-1']
    const err = new SecurityLintError('lint failed', violations)
    // TypeScript enforces readonly at compile time; at runtime it is still accessible
    expect(err.violations).toEqual(violations)
  })
})
