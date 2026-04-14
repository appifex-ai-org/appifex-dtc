/**
 * Phase 14 Plan 14-01 Task 1: Sidecar reader tests
 *
 * Tests RED until snapshot-sidecar.ts is extended with the reader functions.
 * Also covers:
 *   - PHASE_ORDER barrel re-export from @appifex/core
 *   - RunContextBuilder.setModificationPlan persistence
 *   - WR-02 verification: test_regen in PHASE_ORDER + buildContextSummary renders it
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// These imports are expected to fail until the reader is implemented (RED state)
import {
  writePreAgentSnapshotSidecar,
  readPreAgentSnapshotSidecar,
  recomputeAggregateSha256,
  SidecarCorruptError,
  PHASE_ORDER,
  RunContextBuilder,
  buildContextSummary,
} from '../src/index.js'

describe('snapshot-sidecar reader', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sidecar-reader-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('reader round-trips writer output', async () => {
    const snapshot = new Map([
      ['src/App.swift', 'import SwiftUI'],
      ['src/ContentView.swift', 'struct ContentView: View {}'],
      ['Package.swift', 'let package = Package()'],
    ])
    const written = await writePreAgentSnapshotSidecar(dir, 'run-test-1', snapshot)
    // Phase 24 (RESUME-02): written.path is now relative to dir — resolve before reading
    const payload = await readPreAgentSnapshotSidecar(join(dir, written.path))
    const recomputed = recomputeAggregateSha256(payload)
    expect(recomputed).toBe(written.sha256)
  })

  test('reader rejects missing file', async () => {
    const missingPath = join(dir, 'does-not-exist.json')
    await expect(readPreAgentSnapshotSidecar(missingPath)).rejects.toBeInstanceOf(SidecarCorruptError)
  })

  test('reader rejects invalid JSON', async () => {
    const badPath = join(dir, 'bad.json')
    await writeFile(badPath, 'not json at all {{{}')
    await expect(readPreAgentSnapshotSidecar(badPath)).rejects.toThrow('JSON parse failed')
  })

  test('reader rejects missing keys', async () => {
    const badPath = join(dir, 'missing-keys.json')
    await writeFile(badPath, JSON.stringify({ files: {} }))
    await expect(readPreAgentSnapshotSidecar(badPath)).rejects.toThrow('missing required keys')
  })

  test('reader rejects absolute path in files', async () => {
    const badPath = join(dir, 'abs-path.json')
    await writeFile(badPath, JSON.stringify({
      files: { '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash' },
      sha256PerFile: { '/etc/passwd': createHash('sha256').update('root:x:0:0:root:/root:/bin/bash').digest('hex') },
      writtenAt: new Date().toISOString(),
    }))
    await expect(readPreAgentSnapshotSidecar(badPath)).rejects.toThrow('unsafe path')
  })

  test('reader rejects .. traversal in sha256PerFile', async () => {
    const badPath = join(dir, 'traversal.json')
    await writeFile(badPath, JSON.stringify({
      files: { 'safe.ts': 'content' },
      sha256PerFile: {
        'safe.ts': createHash('sha256').update('content').digest('hex'),
        '../../etc/passwd': 'deadbeef',
      },
      writtenAt: new Date().toISOString(),
    }))
    await expect(readPreAgentSnapshotSidecar(badPath)).rejects.toThrow('unsafe path')
  })

  test('PHASE_ORDER re-exported from @appifex/core barrel', () => {
    expect(Array.isArray(PHASE_ORDER)).toBe(true)
    expect(PHASE_ORDER.includes('test_regen')).toBe(true)
    // test_regen must come after codegen and before build
    const codegenIdx = PHASE_ORDER.indexOf('codegen')
    const testRegenIdx = PHASE_ORDER.indexOf('test_regen')
    const buildIdx = PHASE_ORDER.indexOf('build')
    expect(codegenIdx).toBeLessThan(testRegenIdx)
    expect(testRegenIdx).toBeLessThan(buildIdx)
  })

  test('RunContextBuilder.setModificationPlan persists into build() output', () => {
    const builder = new RunContextBuilder({ prompt: 'test', platform: 'swiftui', mode: 'add-feature' })
    builder.setModificationPlan({
      items: [{
        filePath: 'src/HomeView.swift',
        screenName: 'HomeView',
        changeDescription: 'Add dark mode support',
        changeType: 'other',
        fileContent: 'struct HomeView: View {}',
      }],
    })
    const result = builder.build('completed')
    expect(result.modificationPlan).toBeDefined()
    expect(result.modificationPlan!.items.length).toBe(1)
    expect(result.modificationPlan!.items[0].filePath).toBe('src/HomeView.swift')
  })

  test('WR-02: PHASE_ORDER contains test_regen', () => {
    expect(PHASE_ORDER.includes('test_regen')).toBe(true)
  })

  test('WR-02: buildContextSummary renders test_regen phase', () => {
    const builder = new RunContextBuilder({ prompt: 'test', platform: 'swiftui', mode: 'add-feature' })
    builder.recordPhase('test_regen', 'completed', 'test-regen-summary-text')
    const ctx = builder.build('completed')
    const summary = buildContextSummary(ctx)
    expect(summary).toContain('test_regen')
    expect(summary).toContain('test-regen-summary-text')
  })
})
