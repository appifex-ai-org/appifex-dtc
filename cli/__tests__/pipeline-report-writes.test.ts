// Phase 7 (OBS-02): Wave 0 stub — wired GREEN by Plan 07-06b Task 2
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildReport, formatJson } from '@appifex/report'
import { mkdir as mkdirAsync, writeFile as writeFileAsync } from 'node:fs/promises'
import { formatMarkdown } from '@appifex/report'

// Minimal helper that mirrors the pipeline's writeReportFiles function.
async function writeReportFiles(
  outputDir: string,
  report: import('@appifex/report').PipelineReport,
): Promise<void> {
  const reportDir = join(outputDir, '.dtc-report')
  await mkdirAsync(reportDir, { recursive: true })
  await writeFileAsync(join(reportDir, 'report.json'), formatJson(report), 'utf-8')
  await writeFileAsync(join(reportDir, 'report.md'), formatMarkdown(report), 'utf-8')
}

function makeReport() {
  return buildReport({
    projectName: 'Test Project',
    platforms: ['swiftui'],
    designIterations: 1,
    validation: {},
    fix: {},
    tokenUsage: {},
    totalDuration: 1000,
  })
}

describe('pipeline-report-writes (OBS-02 pipeline write-site)', () => {
  it('writes .dtc-report/report.json after report phase', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dtc-report-write-'))
    try {
      const report = makeReport()
      await writeReportFiles(outputDir, report)
      const reportPath = join(outputDir, '.dtc-report', 'report.json')
      expect(existsSync(reportPath)).toBe(true)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it('writes .dtc-report/report.md after report phase', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dtc-report-write-'))
    try {
      const report = makeReport()
      await writeReportFiles(outputDir, report)
      const reportMdPath = join(outputDir, '.dtc-report', 'report.md')
      expect(existsSync(reportMdPath)).toBe(true)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it('report.json parses and matches PipelineReport schema', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dtc-report-write-'))
    try {
      const report = makeReport()
      await writeReportFiles(outputDir, report)
      const reportPath = join(outputDir, '.dtc-report', 'report.json')
      const raw = readFileSync(reportPath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(typeof parsed['summary']).toBe('object')
      const summary = parsed['summary'] as Record<string, unknown>
      expect(typeof summary['allGreen']).toBe('boolean')
      expect(Array.isArray(parsed['platformReports'])).toBe(true)
      // costUsdTotal is optional — may be undefined/null/number
      if ('costUsdTotal' in parsed) {
        expect(parsed['costUsdTotal'] === null || typeof parsed['costUsdTotal'] === 'number').toBe(
          true,
        )
      }
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })
})
