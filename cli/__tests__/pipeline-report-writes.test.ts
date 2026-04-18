// Phase 7 (OBS-02): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error — formatJson is not yet called at the pipeline write-site; RED until Plan 05/06 wires it
import { formatJson } from '@appifex/report' // eslint-disable-line @typescript-eslint/no-unused-vars

void formatJson // referenced to ensure RED import is exercised

describe('pipeline-report-writes (OBS-02 pipeline write-site)', () => {
  it.todo(
    'writes .dtc-report/report.json after report phase',
    async () => {
      // Plan 05/06 wiring:
      // 1. Create a tmpDir as outputDir
      // 2. Invoke a small test-harness subroutine that mimics the pipeline's report phase
      // 3. Assert .dtc-report/report.json exists under outputDir
      const outputDir = mkdtempSync(join(tmpdir(), 'dtc-report-write-'))
      try {
        // ... implementation deferred to Plan 05/06 ...
        const reportPath = join(outputDir, '.dtc-report', 'report.json')
        void reportPath
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    },
  )

  it.todo(
    'writes .dtc-report/report.md after report phase',
    async () => {
      // Plan 05/06 wiring:
      // 1. Same as above
      // 2. Assert .dtc-report/report.md exists under outputDir
      const outputDir = mkdtempSync(join(tmpdir(), 'dtc-report-write-'))
      try {
        // ... implementation deferred to Plan 05/06 ...
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    },
  )

  it.todo(
    'report.json parses and matches PipelineReport schema',
    async () => {
      // Plan 05/06 wiring:
      // 1. Same as above
      // 2. Read .dtc-report/report.json
      // 3. JSON.parse and assert it has the PipelineReport shape:
      //    - report.summary.allGreen is a boolean
      //    - report.platformReports is an array
      //    - report.costUsdTotal is a number or null (Phase 7 field)
    },
  )
})
