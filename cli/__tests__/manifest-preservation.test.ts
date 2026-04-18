// Phase 7 (MCP-03): Wave 0 RED stub — see 07-VALIDATION.md
// Note: finalized by Plan 06 when pipeline gate wires to diffManifest.
import { describe, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error — readManifest/writeManifest/diffManifest do not exist yet; RED until Plan 03
import { readManifest, writeManifest, diffManifest } from '@appifex/core' // eslint-disable-line @typescript-eslint/no-unused-vars

// Suppress unused import until Plan 03 fills in the symbols
void readManifest
void writeManifest
void diffManifest

describe('manifest-preservation (MCP-03 pipeline integration)', () => {
  it.todo(
    'preserves user-edited file by default (skip-with-warning)',
    async () => {
      // Plan 06 wiring:
      // 1. Create a tmpDir as outputDir
      // 2. Write Sources/View.swift with content "original"
      // 3. Write manifest recording sha256 of "original"
      // 4. Modify Sources/View.swift on disk to "user-edited"
      // 5. Invoke the pipeline's manifest gate subroutine (Plan 06 helper)
      // 6. Assert Sources/View.swift still contains "user-edited" (preserved)
      // 7. Assert a warning was emitted mentioning Sources/View.swift

      const outputDir = mkdtempSync(join(tmpdir(), 'dtc-preserve-'))
      try {
        // ... implementation deferred to Plan 06 ...
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    },
  )

  it.todo(
    'overwrites user-edited file when --overwrite-user-edits is passed',
    async () => {
      // Plan 06 wiring:
      // 1. Same setup as above
      // 2. Invoke pipeline gate subroutine with { overwriteUserEdits: true }
      // 3. Assert Sources/View.swift contains the new pipeline-generated content
      // 4. Assert overwrite was logged

      const outputDir = mkdtempSync(join(tmpdir(), 'dtc-overwrite-'))
      try {
        // ... implementation deferred to Plan 06 ...
      } finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    },
  )
})
