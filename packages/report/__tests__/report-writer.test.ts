// Phase 7 (OBS-02): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect } from 'vitest'
import { buildReport, formatJson, formatMarkdown } from '../src/index.js'

// These tests are RED until Plan 05 extends BuildReportInput/PipelineReport with
// the Phase 7 cost fields (tokenUsageBreakdown, costUsdPerPhase, costUsdTotal, model, pricingAsOf).
// The stub runs today against the existing buildReport/formatMarkdown, which do not have these fields yet.
// The assertions will fail when the fields are absent from the output.

const baseInput = {
  projectName: 'test-app',
  platforms: ['swiftui' as const],
  designIterations: 1,
  validation: {},
  fix: {},
  tokenUsage: { codegen: 42_000, fix: 8_104 },
  totalDuration: 5000,
}

describe('buildReport — Phase 7 cost fields (OBS-02)', () => {
  it('report includes tokenUsageBreakdown when provided', () => {
    const report = buildReport({
      ...baseInput,
      // @ts-expect-error — field does not exist yet; RED until Plan 05 extends BuildReportInput
      tokenUsageBreakdown: {
        codegen: { input: 12_000, output: 30_000 },
        fix: { input: 8_000, output: 104 },
      },
      // @ts-expect-error — field does not exist yet
      costUsdPerPhase: {
        codegen: 0.49,
        fix: 0.03,
      },
      // @ts-expect-error — field does not exist yet
      costUsdTotal: 0.52,
      // @ts-expect-error — field does not exist yet
      model: 'claude-sonnet-4-6',
      // @ts-expect-error — field does not exist yet
      pricingAsOf: '2026-04-18',
    })

    // @ts-expect-error — field does not exist yet
    expect(report.tokenUsageBreakdown).toBeDefined()
    // @ts-expect-error — field does not exist yet
    expect(report.costUsdPerPhase?.codegen).toBe(0.49)
    // @ts-expect-error — field does not exist yet
    expect(report.costUsdTotal).toBe(0.52)
    // @ts-expect-error — field does not exist yet
    expect(report.model).toBe('claude-sonnet-4-6')
    // @ts-expect-error — field does not exist yet
    expect(report.pricingAsOf).toBe('2026-04-18')
  })
})

describe('formatMarkdown — Phase 7 cost fields (OBS-02)', () => {
  it('output contains ## Cost Estimate section when costUsdPerPhase provided', () => {
    const report = buildReport({
      ...baseInput,
      // @ts-expect-error — field does not exist yet
      costUsdPerPhase: { codegen: 0.49 },
      // @ts-expect-error — field does not exist yet
      costUsdTotal: 0.49,
      // @ts-expect-error — field does not exist yet
      model: 'claude-sonnet-4-6',
      // @ts-expect-error — field does not exist yet
      pricingAsOf: '2026-04-18',
    })
    const md = formatMarkdown(report)
    expect(md).toContain('## Cost Estimate')
  })

  it('output contains "Prices as of:" when pricingAsOf provided', () => {
    const report = buildReport({
      ...baseInput,
      // @ts-expect-error — field does not exist yet
      pricingAsOf: '2026-04-18',
    })
    const md = formatMarkdown(report)
    expect(md).toContain('Prices as of:')
    expect(md).toContain('2026-04-18')
  })

  it('output contains remediation hint blocks for failed phases', () => {
    const reportWithFailures = buildReport({
      ...baseInput,
      validation: {
        swiftui: {
          ui: { passed: 0, total: 2, results: [] },
          unit: { passed: 0, total: 1, failures: [{ name: 'testLogin', output: 'AssertionError: expected true' }] },
          allPassed: false,
        },
      },
    })
    const md = formatMarkdown(reportWithFailures)
    // After Plan 05 extends formatMarkdown, expect a remediation hint section near failures
    expect(md).toMatch(/Remediation|remediation|hint|Hint/i)
  })

  it('formatJson round-trips all Phase 7 cost fields', () => {
    const report = buildReport({
      ...baseInput,
      // @ts-expect-error — field does not exist yet
      costUsdTotal: 1.23,
      // @ts-expect-error — field does not exist yet
      model: 'claude-sonnet-4-6',
      // @ts-expect-error — field does not exist yet
      pricingAsOf: '2026-04-18',
    })
    const json = formatJson(report)
    const parsed = JSON.parse(json) as {
      costUsdTotal?: number
      model?: string
      pricingAsOf?: string
    }
    expect(parsed.costUsdTotal).toBe(1.23)
    expect(parsed.model).toBe('claude-sonnet-4-6')
    expect(parsed.pricingAsOf).toBe('2026-04-18')
  })
})
