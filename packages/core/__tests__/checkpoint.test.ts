import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Checkpoint } from '../src/checkpoint.js'
import type { PhaseId } from '../src/types.js'

describe('Checkpoint', () => {
  let dbDir: string
  let checkpoint: Checkpoint

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'dtc-ckpt-'))
    checkpoint = new Checkpoint(join(dbDir, 'checkpoint.db'))
  })

  afterEach(() => {
    checkpoint.close()
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('saves and restores pipeline state', () => {
    const runId = 'run-1'
    checkpoint.savePhase(runId, 'design', { penFile: '/tmp/design.pen' })
    checkpoint.savePhase(runId, 'spec', { specFile: '/tmp/spec.json' })

    const state = checkpoint.getPhase(runId, 'design')
    expect(state).toEqual({ penFile: '/tmp/design.pen' })

    const specState = checkpoint.getPhase(runId, 'spec')
    expect(specState).toEqual({ specFile: '/tmp/spec.json' })
  })

  it('returns null for missing phase', () => {
    expect(checkpoint.getPhase('run-1', 'build')).toBeNull()
  })

  it('overwrites existing phase data', () => {
    checkpoint.savePhase('run-1', 'design', { iteration: 1 })
    checkpoint.savePhase('run-1', 'design', { iteration: 2 })

    expect(checkpoint.getPhase('run-1', 'design')).toEqual({ iteration: 2 })
  })

  it('lists completed phases for a run', () => {
    checkpoint.savePhase('run-1', 'design', {})
    checkpoint.savePhase('run-1', 'spec', {})
    checkpoint.savePhase('run-1', 'codegen', {})

    const phases = checkpoint.completedPhases('run-1')
    expect(phases).toEqual(['design', 'spec', 'codegen'])
  })

  it('isolates data between runs', () => {
    checkpoint.savePhase('run-1', 'design', { v: 1 })
    checkpoint.savePhase('run-2', 'design', { v: 2 })

    expect(checkpoint.getPhase('run-1', 'design')).toEqual({ v: 1 })
    expect(checkpoint.getPhase('run-2', 'design')).toEqual({ v: 2 })
  })

  it('persists across instances (reopened from same file)', () => {
    const dbPath = join(dbDir, 'checkpoint.db')
    checkpoint.savePhase('run-1', 'build', { status: 'ok' as any })
    checkpoint.close()

    const checkpoint2 = new Checkpoint(dbPath)
    expect(checkpoint2.getPhase('run-1', 'build')).toEqual({ status: 'ok' })
    checkpoint2.close()
  })
})

describe('Phase 13: generic savePhase + lastCompletedPhase', () => {
  it('savePhase accepts typed analysis payload with snapshot hints', () => {
    const ckpt = new Checkpoint(':memory:')
    ckpt.savePhase('run-1', 'analysis', {
      status: 'completed',
      completedAt: '2026-04-10T00:00:00.000Z',
      snapshotPath: '.dtc/snapshots/run-1-preAgent.json',
      snapshotSha256: 'abc123',
      fileCount: 3,
    })
    const row = ckpt.getPhase('run-1', 'analysis') as any
    expect(row.snapshotSha256).toBe('abc123')
    expect(row.fileCount).toBe(3)
    ckpt.close()
  })

  it('lastCompletedPhase returns null for empty runId', () => {
    const ckpt = new Checkpoint(':memory:')
    expect(ckpt.lastCompletedPhase('nonexistent')).toBeNull()
    ckpt.close()
  })

  it('lastCompletedPhase returns single completed phase', () => {
    const ckpt = new Checkpoint(':memory:')
    ckpt.savePhase('r', 'analysis', { status: 'completed', completedAt: 'x' })
    expect(ckpt.lastCompletedPhase('r')).toBe('analysis')
    ckpt.close()
  })

  it('lastCompletedPhase ignores failed and skipped rows', () => {
    const ckpt = new Checkpoint(':memory:')
    ckpt.savePhase('r', 'analysis', { status: 'completed', completedAt: 'x' })
    ckpt.savePhase('r', 'design', { status: 'failed', error: 'boom', failedAt: 'y' })
    ckpt.savePhase('r', 'spec', { status: 'skipped', reason: 'no baseline' })
    expect(ckpt.lastCompletedPhase('r')).toBe('analysis')
    ckpt.close()
  })

  it('lastCompletedPhase returns highest-rowid completed across mixed trail', () => {
    const ckpt = new Checkpoint(':memory:')
    ckpt.savePhase('r', 'analysis', { status: 'completed', completedAt: 'a' })
    ckpt.savePhase('r', 'design',   { status: 'completed', completedAt: 'b' })
    ckpt.savePhase('r', 'spec',     { status: 'failed', error: 'boom', failedAt: 'c' })
    expect(ckpt.lastCompletedPhase('r')).toBe('design')
    ckpt.close()
  })

  it('failed row round-trip preserves error + failedAt', () => {
    const ckpt = new Checkpoint(':memory:')
    ckpt.savePhase('r', 'codegen', { status: 'failed', error: 'agent crashed', failedAt: 't1' })
    const row = ckpt.getPhase('r', 'codegen') as any
    expect(row.status).toBe('failed')
    expect(row.error).toBe('agent crashed')
    expect(row.failedAt).toBe('t1')
    ckpt.close()
  })

  it('skipped row round-trip preserves reason', () => {
    const ckpt = new Checkpoint(':memory:')
    ckpt.savePhase('r', 'design_delta', { status: 'skipped', reason: 'no baseline .pen' })
    const row = ckpt.getPhase('r', 'design_delta') as any
    expect(row.status).toBe('skipped')
    expect(row.reason).toBe('no baseline .pen')
    ckpt.close()
  })
})
