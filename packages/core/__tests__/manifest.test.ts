// Phase 7 (MCP-03): Wave 0 RED stub — see 07-VALIDATION.md
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error — module does not exist yet; RED until Plan 03 creates packages/core/src/manifest.ts
import { readManifest, writeManifest, diffManifest } from '../src/manifest.js'

describe('manifest (MCP-03)', () => {
  let outputDir: string

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'dtc-manifest-'))
  })

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true })
  })

  it('writeManifest → readManifest round-trip equals input', async () => {
    const manifest = {
      manifestVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      runId: 'run-test-1',
      entries: [
        {
          path: 'Sources/ContentView.swift',
          sha256: 'abc123',
          generatedAt: new Date().toISOString(),
          phase: 'codegen' as import('../src/types.js').PhaseId,
        },
      ],
    }

    await writeManifest(outputDir, manifest)
    const read = await readManifest(outputDir)

    expect(read).not.toBeNull()
    expect(read?.runId).toBe('run-test-1')
    expect(read?.entries).toHaveLength(1)
    expect(read?.entries[0].path).toBe('Sources/ContentView.swift')
  })

  it('readManifest returns null when no .dtc-manifest.json exists', async () => {
    const result = await readManifest(outputDir)
    expect(result).toBeNull()
  })

  it('readManifest returns null when JSON is corrupt', async () => {
    mkdirSync(join(outputDir, '.dtc'), { recursive: true })
    writeFileSync(join(outputDir, '.dtc-manifest.json'), 'not-valid-json}')
    const result = await readManifest(outputDir)
    expect(result).toBeNull()
  })

  it('readManifest returns null when manifestVersion !== 1', async () => {
    mkdirSync(join(outputDir, '.dtc'), { recursive: true })
    writeFileSync(
      join(outputDir, '.dtc-manifest.json'),
      JSON.stringify({ manifestVersion: 99, generatedAt: '', runId: '', entries: [] }),
    )
    const result = await readManifest(outputDir)
    expect(result).toBeNull()
  })

  it('diffManifest detects modified file', async () => {
    const filePath = 'Sources/ContentView.swift'
    const absolutePath = join(outputDir, filePath)
    mkdirSync(join(outputDir, 'Sources'), { recursive: true })
    writeFileSync(absolutePath, 'hello')

    const { createHash } = await import('node:crypto')
    const sha256Hello = createHash('sha256').update('hello').digest('hex')

    const manifest = {
      manifestVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      runId: 'run-diff-1',
      entries: [
        {
          path: filePath,
          sha256: sha256Hello,
          generatedAt: new Date().toISOString(),
          phase: 'codegen' as import('../src/types.js').PhaseId,
        },
      ],
    }
    await writeManifest(outputDir, manifest)

    // Modify the file on disk
    writeFileSync(absolutePath, 'world')

    const diff = await diffManifest(outputDir, manifest)
    expect(diff.userEdited).toContain(filePath)
    expect(diff.missing).toHaveLength(0)
  })

  it('diffManifest detects missing file', async () => {
    const manifest = {
      manifestVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      runId: 'run-diff-2',
      entries: [
        {
          path: 'Sources/DeletedView.swift',
          sha256: 'does-not-matter',
          generatedAt: new Date().toISOString(),
          phase: 'codegen' as import('../src/types.js').PhaseId,
        },
      ],
    }
    await writeManifest(outputDir, manifest)

    const diff = await diffManifest(outputDir, manifest)
    expect(diff.missing).toContain('Sources/DeletedView.swift')
  })

  it('diffManifest returns empty arrays when nothing changed', async () => {
    const filePath = 'Sources/ContentView.swift'
    const absolutePath = join(outputDir, filePath)
    mkdirSync(join(outputDir, 'Sources'), { recursive: true })
    writeFileSync(absolutePath, 'hello')

    const { createHash } = await import('node:crypto')
    const sha256 = createHash('sha256').update('hello').digest('hex')

    const manifest = {
      manifestVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      runId: 'run-diff-3',
      entries: [
        {
          path: filePath,
          sha256,
          generatedAt: new Date().toISOString(),
          phase: 'codegen' as import('../src/types.js').PhaseId,
        },
      ],
    }
    await writeManifest(outputDir, manifest)

    const diff = await diffManifest(outputDir, manifest)
    expect(diff.userEdited).toHaveLength(0)
    expect(diff.missing).toHaveLength(0)
  })

  it('excluded globs are not tracked in the manifest', async () => {
    // Per D-12: .git/**, node_modules/**, Pods/**, DerivedData/**, *.xcodeproj/**, GoogleService-Info.plist excluded
    // Included: Sources/**/*.swift
    // Assert: a manifest written with only an excluded path + an included path
    // reads back with only the included path present.
    const manifest = {
      manifestVersion: 1 as const,
      generatedAt: new Date().toISOString(),
      runId: 'run-exclude-1',
      entries: [
        {
          path: 'Sources/ContentView.swift',
          sha256: 'abc',
          generatedAt: new Date().toISOString(),
          phase: 'codegen' as import('../src/types.js').PhaseId,
        },
        // These should be excluded by writeManifest when writing real files (D-12)
        // For the stub, we assert the diffManifest / readManifest contract excludes them.
        {
          path: 'GoogleService-Info.plist',
          sha256: 'xyz',
          generatedAt: new Date().toISOString(),
          phase: 'firebase_provision' as import('../src/types.js').PhaseId,
        },
      ],
    }

    await writeManifest(outputDir, manifest)
    const read = await readManifest(outputDir)

    // After Plan 03 implements exclusion: only Sources/ContentView.swift should survive
    expect(read).not.toBeNull()
    const excludedPaths = (read?.entries ?? []).map((e: { path: string }) => e.path)
    expect(excludedPaths).not.toContain('GoogleService-Info.plist')
    expect(excludedPaths).toContain('Sources/ContentView.swift')
  })
})
