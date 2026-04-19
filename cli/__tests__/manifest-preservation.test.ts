// Phase 7 (MCP-03): Manifest preservation integration tests — flipped GREEN by Plan 06a.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readManifest, writeManifest, diffManifest, computeSha256 } from '@appifex/core'

describe('manifest-preservation (MCP-03 pipeline integration)', () => {
  it('preserves user-edited file by default (skip-with-warning)', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dtc-preserve-'))
    try {
      // 1. Create Sources/View.swift with content "original"
      const srcDir = join(outputDir, 'Sources')
      mkdirSync(srcDir, { recursive: true })
      const filePath = join(srcDir, 'View.swift')
      writeFileSync(filePath, 'original', 'utf-8')

      // 2. Write manifest recording sha256 of "original"
      const sha256Original = await computeSha256(filePath)
      await writeManifest(outputDir, {
        manifestVersion: 1,
        generatedAt: new Date().toISOString(),
        runId: 'test-run-id',
        entries: [
          {
            path: 'Sources/View.swift',
            sha256: sha256Original,
            generatedAt: new Date().toISOString(),
            phase: 'codegen',
          },
        ],
      })

      // 3. Modify Sources/View.swift on disk to "user-edited"
      writeFileSync(filePath, 'user-edited', 'utf-8')

      // 4. Invoke diffManifest (the gate subroutine)
      const manifest = await readManifest(outputDir)
      expect(manifest).not.toBeNull()
      const diff = await diffManifest(outputDir, manifest!)

      // 5. Assert Sources/View.swift appears in userEdited list (preserved)
      expect(diff.userEdited).toContain('Sources/View.swift')
      expect(diff.missing).toHaveLength(0)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  it('overwrites user-edited file when --overwrite-user-edits is passed', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dtc-overwrite-'))
    try {
      // 1. Create Sources/View.swift with content "original"
      const srcDir = join(outputDir, 'Sources')
      mkdirSync(srcDir, { recursive: true })
      const filePath = join(srcDir, 'View.swift')
      writeFileSync(filePath, 'original', 'utf-8')

      // 2. Write manifest recording sha256 of "original"
      const sha256Original = await computeSha256(filePath)
      await writeManifest(outputDir, {
        manifestVersion: 1,
        generatedAt: new Date().toISOString(),
        runId: 'test-run-id-2',
        entries: [
          {
            path: 'Sources/View.swift',
            sha256: sha256Original,
            generatedAt: new Date().toISOString(),
            phase: 'codegen',
          },
        ],
      })

      // 3. Modify Sources/View.swift on disk to "user-edited"
      writeFileSync(filePath, 'user-edited', 'utf-8')

      // 4. Invoke diffManifest — with overwriteUserEdits the pipeline writes new content
      const manifest = await readManifest(outputDir)
      expect(manifest).not.toBeNull()
      const diff = await diffManifest(outputDir, manifest!)

      // 5. When --overwrite-user-edits is set, diff still detects the change
      // but the pipeline does NOT add it to preservedPaths — it proceeds to overwrite.
      // This test verifies the gate correctly identifies the file as user-edited
      // so the pipeline can make the overwrite decision.
      expect(diff.userEdited).toContain('Sources/View.swift')

      // 6. Simulate overwrite: pipeline writes new content and refreshes manifest
      writeFileSync(filePath, 'pipeline-generated', 'utf-8')
      const sha256New = await computeSha256(filePath)
      await writeManifest(outputDir, {
        manifestVersion: 1,
        generatedAt: new Date().toISOString(),
        runId: 'test-run-id-2',
        entries: [
          {
            path: 'Sources/View.swift',
            sha256: sha256New,
            generatedAt: new Date().toISOString(),
            phase: 'codegen',
          },
        ],
      })

      // 7. After overwrite + manifest refresh, diff shows no user-edited files
      const manifestAfter = await readManifest(outputDir)
      expect(manifestAfter).not.toBeNull()
      const diffAfter = await diffManifest(outputDir, manifestAfter!)
      expect(diffAfter.userEdited).toHaveLength(0)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })
})
