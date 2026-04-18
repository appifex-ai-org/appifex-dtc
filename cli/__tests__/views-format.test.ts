// Phase 7 (OBS-01): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect } from 'vitest'
import chalk from 'chalk'
import { formatPhaseStatus } from '../src/views/format.js'
// @ts-expect-error — formatUsd does not exist yet in format.ts; RED until Plan 04 extends it
import { formatUsd } from '../src/views/format.js'

describe('formatUsd (OBS-01)', () => {
  it('null → dim em-dash placeholder (7 chars)', () => {
    const result = formatUsd(null)
    // Expected: chalk.dim('      —') — 7-char right-aligned dim em-dash
    expect(result).toBe(chalk.dim('      —'))
  })

  it('undefined → dim em-dash placeholder', () => {
    const result = formatUsd(undefined)
    expect(result).toBe(chalk.dim('      —'))
  })

  it('0.234 → "  $0.23" (right-aligned 7 chars)', () => {
    const result = formatUsd(0.234)
    // Strip chalk color codes for comparison
    const stripped = result.replace(/\u001B\[[0-9;]*m/g, '')
    expect(stripped).toBe('  $0.23')
  })

  it('1.23 → "  $1.23"', () => {
    const stripped = formatUsd(1.23).replace(/\u001B\[[0-9;]*m/g, '')
    expect(stripped).toBe('  $1.23')
  })

  it('12.34 → " $12.34"', () => {
    const stripped = formatUsd(12.34).replace(/\u001B\[[0-9;]*m/g, '')
    expect(stripped).toBe(' $12.34')
  })

  it('1500 → "  $1.5K" (compact thousands)', () => {
    const stripped = formatUsd(1500).replace(/\u001B\[[0-9;]*m/g, '')
    expect(stripped).toBe('  $1.5K')
  })

  it('0.005 → "  $0.01" (floor to penny)', () => {
    const stripped = formatUsd(0.005).replace(/\u001B\[[0-9;]*m/g, '')
    expect(stripped).toBe('  $0.01')
  })
})

describe('formatPhaseStatus — Phase 7 tokens + costUsd extension (OBS-01)', () => {
  it('includes token count and USD cost when both provided', () => {
    // After Plan 04 extends PhaseState with tokens + costUsd fields
    const line = formatPhaseStatus({
      id: 'codegen',
      status: 'running',
      // @ts-expect-error — field does not exist yet; RED until Plan 04 extends PhaseState
      tokens: 42318,
      // @ts-expect-error — field does not exist yet
      costUsd: 0.23,
    })
    expect(line).toContain('42,318 tok')
    expect(line).toContain('$0.23')
  })

  it('omits cost when costUsd is undefined (backward compat)', () => {
    const line = formatPhaseStatus({
      id: 'codegen',
      status: 'completed',
    })
    // Must not contain a dollar sign when costUsd is absent
    expect(line).not.toMatch(/\$\d/)
  })
})
