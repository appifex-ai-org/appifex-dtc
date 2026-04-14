/**
 * Phase 14 Plan 14-01 Task 2: Resume bootstrap helper tests
 *
 * Tests RED until cli/src/resume-bootstrap.ts is created.
 * Covers all error classes: corrupt DB (D-04), missing run-context (D-05),
 * runId mismatch (D-06), drift (D-15/D-17), net-new files (D-15),
 * happy path banner, formatDriftError golden string.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, unlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  Checkpoint,
  writePreAgentSnapshotSidecar,
  saveRunContext,
  RunContextBuilder,
} from '@appifex/core'

// These imports fail RED until resume-bootstrap.ts is created
import {
  detectResumeEligibility,
  runResumeBootstrap,
  checkDrift,
  formatDriftError,
  ResumeAbortError,
} from '../src/resume-bootstrap.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'resume-bootstrap-'))
}

async function makeDtcDir(outputDir: string): Promise<string> {
  const dtcDir = join(outputDir, '.dtc')
  await mkdir(dtcDir, { recursive: true })
  await mkdir(join(dtcDir, 'snapshots'), { recursive: true })
  return dtcDir
}

/**
 * Build a minimal valid RunContext + checkpoint for a clean resume scenario.
 * Returns { previousContext, checkpoint, checkpointRunId, sidecarPath, dtcDir }
 */
async function buildCleanResumeFixture(
  outputDir: string,
  sourceFiles: Map<string, string> = new Map(),
) {
  const dtcDir = await makeDtcDir(outputDir)

  // Write source files to disk (so drift check can read them)
  for (const [relPath, content] of sourceFiles) {
    const abs = join(outputDir, relPath)
    await mkdir(join(abs, '..'), { recursive: true })
    await writeFile(abs, content)
  }

  // Create run context
  const builder = new RunContextBuilder({
    prompt: 'Add dark mode',
    platform: 'swiftui',
    mode: 'add-feature',
  })
  builder.recordPhase('analysis', 'completed', 'Analysis done')
  builder.recordPhase('codegen', 'completed', 'Codegen done')
  const ctx = builder.build('completed')
  await saveRunContext(outputDir, ctx)

  // Create checkpoint DB and save analysis row with sidecar pointer
  const dbPath = join(dtcDir, 'checkpoint.db')
  const checkpoint = new Checkpoint(dbPath)
  const checkpointRunId = ctx.runId

  // Write sidecar
  const snapshot = sourceFiles.size > 0 ? sourceFiles : new Map([['placeholder.ts', 'const x = 1']])
  const sidecarMeta = await writePreAgentSnapshotSidecar(dtcDir, checkpointRunId, snapshot)

  // Save analysis checkpoint row with sidecar pointer
  checkpoint.savePhase(checkpointRunId, 'analysis', {
    status: 'completed',
    completedAt: new Date().toISOString(),
    snapshotPath: sidecarMeta.path,
    snapshotSha256: sidecarMeta.sha256,
    fileCount: sidecarMeta.fileCount,
  } as any)
  checkpoint.savePhase(checkpointRunId, 'codegen', {
    status: 'completed',
    completedAt: new Date().toISOString(),
  } as any)

  return {
    previousContext: ctx,
    checkpoint,
    checkpointRunId,
    sidecarPath: sidecarMeta.path,
    dtcDir,
  }
}

// ---------------------------------------------------------------------------
// detectResumeEligibility tests
// ---------------------------------------------------------------------------

describe('detectResumeEligibility', () => {
  test('returns not-add-feature for fresh mode', () => {
    const result = detectResumeEligibility({
      outputDir: '/tmp/fake',
      runMode: 'fresh',
      noResume: false,
      previousContextExists: true,
    })
    expect(result.eligible).toBe(false)
    if (!result.eligible) expect(result.reason).toBe('not-add-feature')
  })

  test('returns no-resume-flag when noResume=true', () => {
    const result = detectResumeEligibility({
      outputDir: '/tmp/fake',
      runMode: 'add-feature',
      noResume: true,
      previousContextExists: true,
    })
    expect(result.eligible).toBe(false)
    if (!result.eligible) expect(result.reason).toBe('no-resume-flag')
  })

  test('returns no-checkpoint-db for first add-feature run', async () => {
    const dir = await makeTmpDir()
    try {
      const result = detectResumeEligibility({
        outputDir: dir,
        runMode: 'add-feature',
        noResume: false,
        previousContextExists: true,
      })
      expect(result.eligible).toBe(false)
      if (!result.eligible) expect(result.reason).toBe('no-checkpoint-db')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// runResumeBootstrap tests
// ---------------------------------------------------------------------------

describe('runResumeBootstrap', () => {
  let dir: string
  beforeEach(async () => {
    dir = await makeTmpDir()
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('returns null for first add-feature run (no banner, no error)', async () => {
    // No checkpoint DB — first run
    const logBanner = vi.fn()
    const dtcDir = await makeDtcDir(dir)
    const checkpoint = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    const builder = new RunContextBuilder({
      prompt: 'test',
      platform: 'swiftui',
      mode: 'add-feature',
    })
    const ctx = builder.build('failed')

    const result = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext: ctx,
      checkpoint,
      checkpointRunId: ctx.runId,
      logBanner,
    })
    checkpoint.close()
    expect(result).toBeNull()
    expect(logBanner).not.toHaveBeenCalled()
  })

  test('runResumeBootstrap aborts with actionable error when run-context missing', async () => {
    // D-05: checkpoint DB exists but no run-context
    const dtcDir = await makeDtcDir(dir)
    const checkpoint = new Checkpoint(join(dtcDir, 'checkpoint.db'))
    const logBanner = vi.fn()

    await expect(
      runResumeBootstrap({
        outputDir: dir,
        runMode: 'add-feature',
        noResume: false,
        previousContext: null,
        checkpoint,
        checkpointRunId: 'run-fake',
        logBanner,
      }),
    ).rejects.toThrow('run-context.json is missing')

    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext: null,
      checkpoint,
      checkpointRunId: 'run-fake',
      logBanner,
    }).catch((e) => e)
    checkpoint.close()
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('--no-resume')
  })

  test('runResumeBootstrap aborts on runId mismatch', async () => {
    // D-06: run-context has run-AAA but checkpoint has run-BBB
    const { checkpoint, dtcDir } = await buildCleanResumeFixture(dir)
    const builder = new RunContextBuilder({
      prompt: 'test',
      platform: 'swiftui',
      mode: 'add-feature',
    })
    // Override runId by building a context and manually setting a different ID
    const ctx = builder.build('completed')
    // Simulate mismatch: pass context with runId=run-AAA but checkpointRunId=run-BBB
    const logBanner = vi.fn()
    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext: { ...ctx, runId: 'run-AAA' },
      checkpoint,
      checkpointRunId: 'run-BBB',
      logBanner,
    }).catch((e) => e)
    checkpoint.close()
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('run-AAA')
    expect(err.message).toContain('run-BBB')
  })

  test('runResumeBootstrap aborts on corrupt checkpoint DB', async () => {
    // D-04: stub checkpoint whose lastCompletedPhase throws
    const dtcDir = await makeDtcDir(dir)

    // Write a checkpoint DB file so detectResumeEligibility sees it as eligible
    const dbPath = join(dtcDir, 'checkpoint.db')
    await writeFile(dbPath, '') // empty / corrupt DB file

    const builder = new RunContextBuilder({
      prompt: 'test',
      platform: 'swiftui',
      mode: 'add-feature',
    })
    const ctx = builder.build('completed')
    await saveRunContext(dir, ctx)

    const stubbedCheckpoint = {
      lastCompletedPhase: (_runId: string) => {
        throw new Error('SQLITE_CORRUPT: database disk image is malformed')
      },
      getPhase: () => null,
      savePhase: () => {},
      completedPhases: () => [],
      close: () => {},
    } as unknown as Checkpoint

    const logBanner = vi.fn()
    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext: ctx,
      checkpoint: stubbedCheckpoint,
      checkpointRunId: ctx.runId,
      logBanner,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('unreadable')
    expect(err.message).toContain('--no-resume')
  })

  test('runResumeBootstrap aborts when sidecar aggregate hash mismatches', async () => {
    // D-16: checkpoint row has a bogus snapshotSha256
    const sourceFiles = new Map([
      ['src/App.swift', 'import SwiftUI'],
      ['src/View.swift', 'struct View {}'],
    ])
    const { previousContext, checkpoint, checkpointRunId, sidecarPath, dtcDir } =
      await buildCleanResumeFixture(dir, sourceFiles)

    // Write source files to disk
    for (const [relPath, content] of sourceFiles) {
      await mkdir(join(dir, relPath, '..'), { recursive: true })
      await writeFile(join(dir, relPath), content)
    }

    // Overwrite the analysis row with a bogus sha256
    checkpoint.savePhase(checkpointRunId, 'analysis', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      snapshotPath: sidecarPath,
      snapshotSha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      fileCount: 2,
    } as any)

    const logBanner = vi.fn()
    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner,
    }).catch((e) => e)
    checkpoint.close()
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('aggregate sha256 mismatch')
    expect(err.message).toContain(
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    )
  })

  test('runResumeBootstrap aborts with drift error when source files modified', async () => {
    // D-15, D-17: modify a tracked file after snapshot
    const sourceFiles = new Map([
      ['src/App.swift', 'import SwiftUI'],
      ['src/ContentView.swift', 'struct ContentView: View {}'],
    ])
    const { previousContext, checkpoint, checkpointRunId, dtcDir } = await buildCleanResumeFixture(
      dir,
      sourceFiles,
    )

    // Modify one file
    await writeFile(join(dir, 'src/App.swift'), 'import SwiftUI\n// MODIFIED')

    const logBanner = vi.fn()
    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner,
    }).catch((e) => e)
    checkpoint.close()
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('Modified:')
    expect(err.message).toContain('src/App.swift')
    expect(err.message).toContain('--no-resume')
  })

  test('runResumeBootstrap aborts with drift error when source file removed', async () => {
    // D-15: delete a sidecar-tracked file
    const sourceFiles = new Map([
      ['src/App.swift', 'import SwiftUI'],
      ['src/ContentView.swift', 'struct ContentView: View {}'],
    ])
    const { previousContext, checkpoint, checkpointRunId, dtcDir } = await buildCleanResumeFixture(
      dir,
      sourceFiles,
    )

    // Remove one file
    await unlink(join(dir, 'src/ContentView.swift'))

    const logBanner = vi.fn()
    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner,
    }).catch((e) => e)
    checkpoint.close()
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('Removed:')
    expect(err.message).toContain('src/ContentView.swift')
  })

  test('runResumeBootstrap aborts with corrupt-sidecar error when sidecar file deleted', async () => {
    // D-32 scenario 3: sidecar file itself deleted before resume
    const sourceFiles = new Map([['src/App.swift', 'import SwiftUI']])
    const { previousContext, checkpoint, checkpointRunId, sidecarPath, dtcDir } =
      await buildCleanResumeFixture(dir, sourceFiles)

    // Delete the sidecar file — sidecarPath is relative to dtcDir (Phase 24), resolve it first
    await unlink(join(dtcDir, sidecarPath))

    const logBanner = vi.fn()
    const err = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner,
    }).catch((e) => e)
    checkpoint.close()
    expect(err).toBeInstanceOf(ResumeAbortError)
    expect(err.message).toContain('sidecar snapshot corrupt')
  })

  test('runResumeBootstrap ignores net-new files not in sidecar', async () => {
    // D-15: files added after snapshot are NOT drift
    const sourceFiles = new Map([['src/App.swift', 'import SwiftUI']])
    const { previousContext, checkpoint, checkpointRunId, dtcDir } = await buildCleanResumeFixture(
      dir,
      sourceFiles,
    )

    // Add a new file (not in sidecar)
    await writeFile(join(dir, 'src/NewView.swift'), 'struct NewView: View {}')

    const logBanner = vi.fn()
    const result = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner,
    })
    checkpoint.close()
    expect(result).not.toBeNull()
    expect(result?.lastCompletedPhase).toBeDefined()
  })

  test('runResumeBootstrap returns ResumeState and prints banner on clean resume', async () => {
    const sourceFiles = new Map([['src/App.swift', 'import SwiftUI']])
    const { previousContext, checkpoint, checkpointRunId, dtcDir } = await buildCleanResumeFixture(
      dir,
      sourceFiles,
    )

    const logBanner = vi.fn()
    const result = await runResumeBootstrap({
      outputDir: dir,
      runMode: 'add-feature',
      noResume: false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner,
    })
    checkpoint.close()
    expect(result).not.toBeNull()
    expect(result?.lastCompletedPhase).toBe('codegen')
    expect(result?.checkpointRunId).toBe(checkpointRunId)
    expect(logBanner).toHaveBeenCalledOnce()
    const bannerArg = logBanner.mock.calls[0][0] as string
    expect(bannerArg).toContain(
      'Resuming add-feature run from checkpoint (last completed: codegen)',
    )
  })
})

// ---------------------------------------------------------------------------
// checkDrift tests
// ---------------------------------------------------------------------------

describe('checkDrift', () => {
  let dir: string
  beforeEach(async () => {
    dir = await makeTmpDir()
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('checkDrift rejects path traversal in sidecar entries', async () => {
    // Defense in depth: path traversal entries land in removed[] without fs access
    const sidecar = {
      files: {},
      sha256PerFile: {
        '../../etc/passwd': 'deadbeef',
      },
      writtenAt: new Date().toISOString(),
    }
    const result = await checkDrift(sidecar, dir)
    expect(result.removed).toContain('../../etc/passwd')
    expect(result.modified).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// formatDriftError tests
// ---------------------------------------------------------------------------

describe('formatDriftError', () => {
  test('formatDriftError matches D-17 example format exactly', () => {
    const output = formatDriftError({
      modified: ['cli/src/pipeline.ts', 'packages/core/src/types.ts'],
      removed: ['packages/core/src/snapshot-sidecar.ts'],
    })
    // Must contain the count and "source files"
    expect(output).toContain('3 source files')
    // Must have Modified: section
    expect(output).toContain('Modified:')
    expect(output).toContain('  cli/src/pipeline.ts')
    expect(output).toContain('  packages/core/src/types.ts')
    // Must have Removed: section
    expect(output).toContain('Removed:')
    expect(output).toContain('  packages/core/src/snapshot-sidecar.ts')
    // Must have the --no-resume fallback line
    expect(output).toContain('`dtc run --add-feature --no-resume`')
  })

  test('formatDriftError uses singular "file" for 1 drift', () => {
    const output = formatDriftError({ modified: ['src/App.swift'], removed: [] })
    expect(output).toContain('1 source file')
    expect(output).not.toContain('1 source files')
  })
})

// ---------------------------------------------------------------------------
// Phase 24 (RESUME-02): legacy absolute path migration
// ---------------------------------------------------------------------------

describe('Phase 24 (RESUME-02): legacy absolute path migration', () => {
  test('absolute snapshotPath is resolved to current dtcDir on read', async () => {
    // Create sidecar at dtcDirA
    const dtcDirA = await mkdtemp(join(tmpdir(), 'dtc-old-'))
    const dtcDirB = await mkdtemp(join(tmpdir(), 'dtc-new-'))
    try {
      const snap = new Map([['src/App.swift', 'import SwiftUI']])
      await writePreAgentSnapshotSidecar(dtcDirA, 'run-legacy', snap)
      // Simulate legacy: checkpoint stored absolute path
      const legacyAbsPath = join(dtcDirA, 'snapshots', 'run-legacy-preAgent.json')

      // Copy the sidecar file to dtcDirB/snapshots/
      const { mkdirSync, copyFileSync } = await import('node:fs')
      mkdirSync(join(dtcDirB, 'snapshots'), { recursive: true })
      copyFileSync(legacyAbsPath, join(dtcDirB, 'snapshots', 'run-legacy-preAgent.json'))

      // Migrate-on-read: resolve absolute to new dtcDir
      const { migrateSnapshotPath } = await import('../src/resume-bootstrap.js')
      const resolved = migrateSnapshotPath(legacyAbsPath, dtcDirB)
      expect(resolved).toBe(join(dtcDirB, 'snapshots', 'run-legacy-preAgent.json'))
      expect(isAbsolute(resolved)).toBe(true) // resolved path IS absolute (ready for readFile)

      // Verify file at resolved path is valid
      const body = JSON.parse(await readFile(resolved, 'utf8'))
      expect(body.files['src/App.swift']).toBe('import SwiftUI')
    } finally {
      await rm(dtcDirA, { recursive: true, force: true })
      await rm(dtcDirB, { recursive: true, force: true })
    }
  })

  test('relative snapshotPath is joined with dtcDir unchanged', async () => {
    const dtcDir = await mkdtemp(join(tmpdir(), 'dtc-rel-'))
    try {
      const snap = new Map([['a.ts', 'x']])
      await writePreAgentSnapshotSidecar(dtcDir, 'run-new', snap)
      const { migrateSnapshotPath } = await import('../src/resume-bootstrap.js')
      const resolved = migrateSnapshotPath('snapshots/run-new-preAgent.json', dtcDir)
      expect(resolved).toBe(join(dtcDir, 'snapshots', 'run-new-preAgent.json'))
    } finally {
      await rm(dtcDir, { recursive: true, force: true })
    }
  })
})
