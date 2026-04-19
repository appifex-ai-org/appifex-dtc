// Phase 5 Plan 06 integration tests (VALIDATION rows 5-06-01 + 5-06-02):
//   1. PHASE_ORDER has xcode_archive + testflight_upload slotted immediately
//      after 'deliver' and immediately before 'report'.
//   2. CheckpointData round-trip for both new phases preserves their fields.
//   3. packages/provision/src/asc-client.ts is GONE (D-03).
//   4. No file under packages/ or cli/src/ shells out to the community `asc` CLI.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { PHASE_ORDER, Checkpoint } from '@appifex/core'
import type { PhaseId } from '@appifex/core'

describe('Phase 5 wiring: PHASE_ORDER (VALIDATION 5-06-01)', () => {
  // Phase 6 (VAL-01 D-01): e2e_gate is now slotted between deliver and xcode_archive.
  // Original Phase 5 contract was deliver→xcode_archive directly; the gate insertion is the
  // documented architectural change in 06-CONTEXT.md D-01 and is also locked by
  // packages/core/__tests__/phase-order-e2e-gate.test.ts.
  it('xcode_archive follows deliver via e2e_gate (Phase 6 D-01)', () => {
    const deliver = PHASE_ORDER.indexOf('deliver' as PhaseId)
    const e2eGate = PHASE_ORDER.indexOf('e2e_gate' as PhaseId)
    const archive = PHASE_ORDER.indexOf('xcode_archive' as PhaseId)
    expect(deliver).toBeGreaterThanOrEqual(0)
    expect(e2eGate).toBe(deliver + 1)
    expect(archive).toBe(e2eGate + 1)
  })

  it('testflight_upload immediately follows xcode_archive', () => {
    const archive = PHASE_ORDER.indexOf('xcode_archive' as PhaseId)
    const upload = PHASE_ORDER.indexOf('testflight_upload' as PhaseId)
    expect(upload).toBe(archive + 1)
  })

  it('report immediately follows testflight_upload', () => {
    const upload = PHASE_ORDER.indexOf('testflight_upload' as PhaseId)
    const report = PHASE_ORDER.indexOf('report' as PhaseId)
    expect(report).toBe(upload + 1)
  })
})

describe('Phase 5 wiring: CheckpointData round-trip', () => {
  it('xcode_archive payload round-trips through Checkpoint', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dtc-ckpt-'))
    const ckpt = new Checkpoint(path.join(dir, 'checkpoint.db'))
    ckpt.savePhase('run-1', 'xcode_archive', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      ipaPath: '/tmp/App.ipa',
      archivePath: '/tmp/App.xcarchive',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      bundleId: 'com.example.App',
    })
    const got = ckpt.getPhase('run-1', 'xcode_archive') as {
      ipaPath?: string
      buildNumber?: string
      marketingVersion?: string
      bundleId?: string
    } | null
    expect(got?.ipaPath).toBe('/tmp/App.ipa')
    expect(got?.buildNumber).toBe('47')
    expect(got?.marketingVersion).toBe('1.0.3')
    expect(got?.bundleId).toBe('com.example.App')
    ckpt.close()
  })

  it('testflight_upload payload round-trips with warnings', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dtc-ckpt-'))
    const ckpt = new Checkpoint(path.join(dir, 'checkpoint.db'))
    ckpt.savePhase('run-2', 'testflight_upload', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      buildId: 'b1',
      groupId: 'g1',
      testersAdded: 2,
      warnings: ['one warning'],
    })
    const got = ckpt.getPhase('run-2', 'testflight_upload') as {
      buildId?: string
      warnings?: string[]
      groupId?: string
      testersAdded?: number
    } | null
    expect(got?.buildId).toBe('b1')
    expect(got?.warnings).toEqual(['one warning'])
    expect(got?.groupId).toBe('g1')
    expect(got?.testersAdded).toBe(2)
    ckpt.close()
  })
})

describe('Phase 5 wiring: asc-client.ts deletion (D-03)', () => {
  it('packages/provision/src/asc-client.ts does NOT exist', () => {
    const repoRoot = path.resolve(__dirname, '../..')
    const ascClientPath = path.join(repoRoot, 'packages/provision/src/asc-client.ts')
    expect(existsSync(ascClientPath)).toBe(false)
  })
})

describe('Phase 5 wiring: no `asc` CLI shell-out (TF-01, VALIDATION 5-06-02)', () => {
  function walkSources(dir: string, files: string[] = []): string[] {
    if (!existsSync(dir)) return files
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (
        entry.isDirectory() &&
        !entry.name.includes('node_modules') &&
        !entry.name.startsWith('.') &&
        entry.name !== '__tests__' &&
        entry.name !== 'dist'
      ) {
        walkSources(p, files)
      } else if (
        entry.isFile() &&
        (p.endsWith('.ts') || p.endsWith('.tsx')) &&
        !p.includes('__tests__')
      ) {
        files.push(p)
      }
    }
    return files
  }

  it('no runtime file shells out to `asc` CLI', () => {
    const repoRoot = path.resolve(__dirname, '../..')
    const roots = [path.join(repoRoot, 'packages'), path.join(repoRoot, 'cli/src')]
    const offenders: string[] = []
    for (const r of roots) {
      if (!existsSync(r)) continue
      for (const f of walkSources(r)) {
        const content = readFileSync(f, 'utf-8')
        // Match runner.exec('asc', ...) or exec('asc', ...) — community CLI shell-out.
        if (
          /runner\.exec\(\s*['"]asc['"]/.test(content) ||
          /\bexec\(\s*['"]asc['"]/.test(content)
        ) {
          offenders.push(f)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
