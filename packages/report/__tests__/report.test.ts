import { describe, it, expect } from 'vitest'
import { buildReport, formatMarkdown, formatJson, type PipelineReport } from '../src/index.js'
import type { FixResult } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

const sampleValidation: ValidationResult = {
  ui: { total: 5, passed: 5, failed: 0, results: [] },
  unit: { total: 12, passed: 12, failed: 0, failures: [] },
  allPassed: true,
}

const sampleFix: FixResult = {
  status: 'all_green',
  attempts: [{
    attempt: 1, model: 'claude-sonnet', filesChanged: ['Home.tsx', 'utils.ts'],
    testsBefore: { passed: 14, total: 17 }, testsAfter: { passed: 17, total: 17 },
    tokensUsed: 3400, duration: 12000,
  }],
  unresolvedFailures: [],
  rollbackApplied: false,
  totalTokensUsed: 3400,
  totalDuration: 12000,
}

describe('buildReport', () => {
  it('builds a report from pipeline results', () => {
    const report = buildReport({
      projectName: 'Pet Adoption App',
      platforms: ['swiftui'],
      designIterations: 2,
      validation: { 'swiftui': sampleValidation },
      fix: { 'swiftui': sampleFix },
      tokenUsage: {
        design: 5000, spec: 1000, test_gen: 2000,
        codegen: 15000, build: 0, validate: 500,
        fix: 3400, deliver: 200, report: 0,
      },
      totalDuration: 120000,
    })

    expect(report.projectName).toBe('Pet Adoption App')
    expect(report.summary.totalTests).toBe(17)
    expect(report.summary.totalPassed).toBe(17)
    expect(report.summary.allGreen).toBe(true)
    expect(report.summary.fixAttempts).toBe(1)
    expect(report.summary.totalTokens).toBeGreaterThan(0)
  })

  it('calculates correct totals across platforms', () => {
    const ktValidation: ValidationResult = {
      ui: { total: 5, passed: 5, failed: 0, results: [] },
      unit: { total: 8, passed: 8, failed: 0, failures: [] },
      allPassed: true,
    }

    const report = buildReport({
      projectName: 'App',
      platforms: ['swiftui', 'kotlin-compose'],
      designIterations: 1,
      validation: { 'swiftui': sampleValidation, 'kotlin-compose': ktValidation },
      fix: {},
      tokenUsage: { design: 1000 },
      totalDuration: 60000,
    })

    expect(report.summary.totalTests).toBe(30) // 17 SwiftUI + 13 Kotlin
    expect(report.summary.totalPassed).toBe(30)
  })
})

describe('formatMarkdown', () => {
  it('produces markdown with summary and per-platform results', () => {
    const report = buildReport({
      projectName: 'Pet App',
      platforms: ['swiftui'],
      designIterations: 2,
      validation: { 'swiftui': sampleValidation },
      fix: { 'swiftui': sampleFix },
      tokenUsage: { design: 5000, codegen: 15000, fix: 3400 },
      totalDuration: 120000,
    })

    const md = formatMarkdown(report)

    expect(md).toContain('# Pet App')
    expect(md).toContain('swiftui')
    expect(md).toContain('5/5')  // UI tests
    expect(md).toContain('12/12') // Unit tests
    expect(md).toContain('ALL GREEN') // or similar
    expect(md).toContain('Token') // token usage section
  })
})

describe('formatJson', () => {
  it('produces valid JSON', () => {
    const report = buildReport({
      projectName: 'App',
      platforms: ['swiftui'],
      designIterations: 1,
      validation: { 'swiftui': sampleValidation },
      fix: {},
      tokenUsage: {},
      totalDuration: 1000,
    })

    const json = formatJson(report)
    const parsed = JSON.parse(json)

    expect(parsed.projectName).toBe('App')
    expect(parsed.summary).toBeDefined()
  })
})
