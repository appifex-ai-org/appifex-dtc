// Phase 5 Plan 06 integration test (VALIDATION 5-06-03):
// D-17 soft-fail — when runTestFlightUploadPhase returns completed_with_warnings,
// pipeline.ts MUST emit status='completed' (NOT 'failed') so the pipeline exits 0.
//
// Two-layer verification:
//   1) Functional: runTestFlightUploadPhase returns completed_with_warnings when
//      tester reconciliation throws (Plan 05 orchestrator contract).
//   2) Source-level: pipeline.ts has the D-17 branch that emits 'completed' on
//      completed_with_warnings.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Functional mocks — isolate the orchestrator from the real ASC REST + altool + polling.
vi.mock('../../packages/provision/src/asc-rest.js', () => ({
  findOrCreateInternalGroup: vi.fn(),
  reconcileTesters: vi.fn(),
  findBuildByVersion: vi.fn(),
  computeNextBuildNumber: vi.fn(),
  assignBuildToGroups: vi.fn(),
  isDuplicateVersionError: () => false,
}))
vi.mock('../../packages/provision/src/altool.js', () => ({
  uploadIpa: vi.fn(),
  ensureKeyAtStandardPath: vi.fn(),
  parseAltoolOutput: vi.fn(),
}))
vi.mock('../../packages/provision/src/testflight-polling.js', () => ({
  pollUntilProcessed: vi.fn(),
}))

import { runTestFlightUploadPhase } from '@appifex/provision'
import {
  findOrCreateInternalGroup,
  reconcileTesters,
  findBuildByVersion,
} from '../../packages/provision/src/asc-rest.js'
import { uploadIpa } from '../../packages/provision/src/altool.js'
import { pollUntilProcessed } from '../../packages/provision/src/testflight-polling.js'

const APPLE_CFG = {
  apple: {
    teamId: 'T1',
    bundleId: 'com.example.App',
    ascAppId: '123',
    ascKeyId: 'K1',
    ascIssuerId: 'I1',
    ascKeyPath: '/keys/K1.p8',
    ascTestFlightGroup: 'internal',
    testflightTesters: ['alice@example.com'],
  },
}

describe('Phase 5 D-17 soft-fail: runTestFlightUploadPhase (VALIDATION 5-06-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Happy-path fixtures so we can isolate the failure to tester reconciliation.
    ;(uploadIpa as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      toolVersion: '4.11',
      errors: [],
    })
    ;(findBuildByVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'VALID' },
    })
    ;(pollUntilProcessed as ReturnType<typeof vi.fn>).mockResolvedValue('VALID')
  })

  it('tester-reconciliation throw → completed_with_warnings (pipeline exits 0)', async () => {
    ;(findOrCreateInternalGroup as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'g1' })
    ;(reconcileTesters as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('tester reconciliation failed'),
    )

    const emitter = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      get history() {
        return [] as unknown[]
      },
    } as unknown as import('@appifex/core').ProgressEmitter

    const result = await runTestFlightUploadPhase({
      runner: {} as import('@appifex/core').Runner,
      config: APPLE_CFG as unknown as import('@appifex/core').DtcConfig,
      emitter,
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
    })

    expect(result.status).toBe('completed_with_warnings')
    if (result.status === 'completed_with_warnings') {
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.buildId).toBe('b1')
    }
  })

  it('reconcileTesters returns warnings[] → completed_with_warnings', async () => {
    ;(findOrCreateInternalGroup as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'g1' })
    ;(reconcileTesters as ReturnType<typeof vi.fn>).mockResolvedValue({
      added: [],
      warnings: ['alice@example.com: not a team member'],
    })

    const emitter = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      get history() {
        return [] as unknown[]
      },
    } as unknown as import('@appifex/core').ProgressEmitter

    const result = await runTestFlightUploadPhase({
      runner: {} as import('@appifex/core').Runner,
      config: APPLE_CFG as unknown as import('@appifex/core').DtcConfig,
      emitter,
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
    })

    expect(result.status).toBe('completed_with_warnings')
    if (result.status === 'completed_with_warnings') {
      expect(result.warnings).toContain('alice@example.com: not a team member')
    }
  })
})

describe('Phase 5 D-17 source-level guard: pipeline.ts handles completed_with_warnings', () => {
  it('pipeline.ts emits `completed` (not `failed`) on completed_with_warnings', () => {
    const pipelineSrc = readFileSync(path.resolve(__dirname, '../src/pipeline.ts'), 'utf-8')
    // 1) The D-17 branch literal exists in pipeline.ts.
    expect(pipelineSrc).toMatch(/completed_with_warnings/)
    // 2) The branch emits the 'completed' status (NOT 'failed') — search within a
    //    600-char window after the first completed_with_warnings token for the
    //    first emit() call and assert its status literal.
    const m = pipelineSrc.match(
      /completed_with_warnings[\s\S]{0,700}?emit\(\s*'testflight_upload'\s*,\s*'(\w+)'/,
    )
    expect(m?.[1]).toBe('completed')
  })

  it('pipeline.ts saves status=completed on soft-fail (exit 0 invariant)', () => {
    const pipelineSrc = readFileSync(path.resolve(__dirname, '../src/pipeline.ts'), 'utf-8')
    // The soft-fail branch must persist status:'completed' with warnings — otherwise
    // resume logic would classify the phase as failed on the next run.
    const m = pipelineSrc.match(
      /completed_with_warnings[\s\S]{0,1000}?savePhase\([^,]+,\s*'testflight_upload'\s*,\s*\{([\s\S]{0,300})\}/,
    )
    expect(m).not.toBeNull()
    if (m) {
      expect(m[1]).toMatch(/status:\s*'completed'/)
      expect(m[1]).toMatch(/warnings/)
    }
  })
})
