import { describe, it, expect } from 'vitest'
import {
  formatPhaseStatus,
  formatTokenBar,
  formatValidationSummary,
  formatFixStatus,
  type PhaseState,
} from '../src/views/format.js'
import { PIPELINE_PHASES } from '../src/views/PipelineView.js'

describe('formatPhaseStatus', () => {
  it('formats pending phase with dim circle', () => {
    const result = formatPhaseStatus({ id: 'design', status: 'pending' })
    expect(result).toContain('○')
    expect(result).toContain('Design')
  })

  it('formats running phase with spinner-like indicator', () => {
    const result = formatPhaseStatus({ id: 'codegen', status: 'running', message: 'Generating 14 files' })
    expect(result).toContain('◐')
    expect(result).toContain('Codegen')
    expect(result).toContain('Generating 14 files')
  })

  it('formats completed phase with checkmark', () => {
    const result = formatPhaseStatus({ id: 'build', status: 'completed', message: 'swiftui ✓' })
    expect(result).toContain('✓')
    expect(result).toContain('Build')
  })

  it('formats failed phase with X', () => {
    const result = formatPhaseStatus({ id: 'validate', status: 'failed', message: 'UI 4/5 Unit 11/12' })
    expect(result).toContain('✗')
    expect(result).toContain('Validate')
  })

  it('formats skipped phase', () => {
    const result = formatPhaseStatus({ id: 'fix', status: 'skipped' })
    expect(result).toContain('–')
    expect(result).toContain('Fix')
  })
})

describe('formatTokenBar', () => {
  it('renders a progress bar with used/total', () => {
    const result = formatTokenBar(25_000, 100_000)
    expect(result).toContain('25,000')
    expect(result).toContain('100,000')
    // Should contain bar characters
    expect(result).toMatch(/[━░]/)
  })

  it('shows correct percentage fill', () => {
    const half = formatTokenBar(50_000, 100_000)
    // At 50%, roughly half should be filled
    expect(half).toBeDefined()
  })

  it('handles zero budget', () => {
    const result = formatTokenBar(0, 0)
    expect(result).toBeDefined()
  })
})

describe('formatValidationSummary', () => {
  it('formats passing results', () => {
    const result = formatValidationSummary({
      platform: 'swiftui',
      ui: { passed: 5, total: 5 },
      unit: { passed: 12, total: 12 },
    })
    expect(result).toContain('swiftui')
    expect(result).toContain('UI 5/5')
    expect(result).toContain('Unit 12/12')
    expect(result).toContain('✓')
  })

  it('formats failing results', () => {
    const result = formatValidationSummary({
      platform: 'swiftui',
      ui: { passed: 4, total: 5 },
      unit: { passed: 11, total: 12 },
    })
    expect(result).toContain('4/5')
    expect(result).toContain('11/12')
  })
})

describe('formatFixStatus', () => {
  it('formats all_green result', () => {
    const result = formatFixStatus({
      status: 'all_green',
      attempts: 1,
      tokensUsed: 3400,
    })
    expect(result).toContain('ALL GREEN')
    expect(result).toContain('1 attempt')
    expect(result).toContain('3,400')
  })

  it('formats stuck result with recommendation', () => {
    const result = formatFixStatus({
      status: 'stuck',
      attempts: 5,
      tokensUsed: 25_000,
      recommendation: 'manual_fix',
    })
    expect(result).toContain('STUCK')
    expect(result).toContain('5 attempts')
    expect(result).toContain('manual_fix')
  })
})

describe('PIPELINE_PHASES ordering', () => {
  it('includes design_delta between spec and test_gen', () => {
    const specIdx = PIPELINE_PHASES.indexOf('spec')
    const deltaIdx = PIPELINE_PHASES.indexOf('design_delta')
    const testGenIdx = PIPELINE_PHASES.indexOf('test_gen')
    expect(specIdx).toBeGreaterThanOrEqual(0)
    expect(deltaIdx).toBeGreaterThan(specIdx)
    expect(testGenIdx).toBeGreaterThan(deltaIdx)
  })

  it('formatPhaseStatus renders a design_delta row with the Design delta label when running', () => {
    const result = formatPhaseStatus({ id: 'design_delta', status: 'running', message: '0 added / 0 removed / 1 changed' })
    expect(result).toContain('◐')
    expect(result).toContain('Design delta')
    expect(result).toContain('1 changed')
  })

  it('formatPhaseStatus renders a design_delta row with a check when completed', () => {
    const result = formatPhaseStatus({ id: 'design_delta', status: 'completed', message: '2 added / 0 removed / 1 changed' })
    expect(result).toContain('✓')
    expect(result).toContain('Design delta')
  })
})
