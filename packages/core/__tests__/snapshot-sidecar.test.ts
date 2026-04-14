import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
// Wave 1 will create this module. Test is RED until then.
// @ts-expect-error Wave 1 helper — module does not yet exist (expected RED state)
import { writePreAgentSnapshotSidecar } from '../src/snapshot-sidecar.js'

describe('Phase 13: preAgentSnapshot sidecar', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'sidecar-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('produces per-file sha256 for every file in the snapshot', async () => {
    const snap = new Map<string, string>([['a.ts', 'console.log(1)'], ['b.ts', 'console.log(2)']])
    const res = await writePreAgentSnapshotSidecar(dir, 'run-1', snap)
    const body = JSON.parse(await readFile(join(dir, res.path), 'utf8'))
    expect(Object.keys(body.sha256PerFile).sort()).toEqual(['a.ts', 'b.ts'])
    expect(body.sha256PerFile['a.ts']).toMatch(/^[a-f0-9]{64}$/)
    expect(body.sha256PerFile['b.ts']).toMatch(/^[a-f0-9]{64}$/)
  })

  it('aggregate hash is deterministic across Map insertion orders', async () => {
    const snapA = new Map([['a.ts','1'], ['b.ts','2']])
    const snapB = new Map([['b.ts','2'], ['a.ts','1']])
    const a = await writePreAgentSnapshotSidecar(dir, 'rA', snapA)
    const b = await writePreAgentSnapshotSidecar(dir, 'rB', snapB)
    expect(a.sha256).toBe(b.sha256)
  })

  it('writes JSON with {files, sha256PerFile, writtenAt} schema', async () => {
    const snap = new Map([['x.ts', 'content']])
    const res = await writePreAgentSnapshotSidecar(dir, 'run-2', snap)
    const body = JSON.parse(await readFile(join(dir, res.path), 'utf8'))
    expect(body).toHaveProperty('files')
    expect(body).toHaveProperty('sha256PerFile')
    expect(body).toHaveProperty('writtenAt')
    expect(body.files['x.ts']).toBe('content')
    expect(res.fileCount).toBe(1)
    expect(res.path).toBe('snapshots/run-2-preAgent.json')
  })
})

describe('Phase 24 (RESUME-02): relative path return', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'sidecar-rel-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('returns a relative path (not absolute)', async () => {
    const snap = new Map([['a.ts', 'code']])
    const res = await writePreAgentSnapshotSidecar(dir, 'run-rel', snap)
    expect(isAbsolute(res.path)).toBe(false)
  })

  it('relative path is snapshots/{runId}-preAgent.json', async () => {
    const snap = new Map([['a.ts', 'code']])
    const res = await writePreAgentSnapshotSidecar(dir, 'run-rel', snap)
    expect(res.path).toBe('snapshots/run-rel-preAgent.json')
  })

  it('join(dtcDir, relativePath) resolves to the written file', async () => {
    const snap = new Map([['a.ts', 'code']])
    const res = await writePreAgentSnapshotSidecar(dir, 'run-rel', snap)
    const absPath = join(dir, res.path)
    const body = JSON.parse(await readFile(absPath, 'utf8'))
    expect(body.files['a.ts']).toBe('code')
  })
})
