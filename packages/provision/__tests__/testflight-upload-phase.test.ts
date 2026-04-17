// Phase 5 Plan 05 (TF-04 Wave-0): RED tests for the runTestFlightUploadPhase orchestrator.
// Covers: happy path, D-09 retry-once on duplicate, D-15 polling outcomes, D-17 soft-fail
// on tester-add + group-create failures, D-19 default 'dtc-internal' group fallback.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock asc-rest primitives
vi.mock('../src/asc-rest.js', () => ({
  findOrCreateInternalGroup: vi.fn(),
  reconcileTesters: vi.fn(),
  getBuildProcessingState: vi.fn(),
  findBuildByVersion: vi.fn(),
  computeNextBuildNumber: vi.fn(),
  assignBuildToGroups: vi.fn(),
  isDuplicateVersionError: (c: string | null) =>
    c != null && /^ITMS-(90189|90478)$|^ENTITY_ERROR/.test(c),
}))
vi.mock('../src/altool.js', () => ({
  uploadIpa: vi.fn(),
  parseAltoolOutput: vi.fn(),
  ensureKeyAtStandardPath: vi.fn(),
}))
// Stub polling to be instant in tests
vi.mock('../src/testflight-polling.js', () => ({
  pollUntilProcessed: vi.fn(),
}))

import { runTestFlightUploadPhase } from '../src/testflight-upload-phase.js'
import {
  findOrCreateInternalGroup,
  reconcileTesters,
  findBuildByVersion,
  computeNextBuildNumber,
} from '../src/asc-rest.js'
import { uploadIpa } from '../src/altool.js'
import { pollUntilProcessed } from '../src/testflight-polling.js'

const APPLE = {
  teamId: 'T1',
  bundleId: 'com.example.App',
  ascAppId: '123',
  ascKeyId: 'K1',
  ascIssuerId: 'I1',
  ascKeyPath: '/keys/K1.p8',
  ascTestFlightGroup: 'internal',
  testflightTesters: ['alice@example.com'],
}
const EMITTER = { emit: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runTestFlightUploadPhase happy path', () => {
  it('uploads, polls, creates group, reconciles testers, returns completed', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true, toolVersion: '4.11' } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      type: 'builds',
      attributes: {
        version: '47',
        processingState: 'PROCESSING',
        uploadedDate: '',
        expired: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('VALID')
    vi.mocked(findOrCreateInternalGroup).mockResolvedValue({
      id: 'g1',
      type: 'betaGroups',
      attributes: {
        name: 'internal',
        isInternalGroup: true,
        hasAccessToAllBuilds: true,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(reconcileTesters).mockResolvedValue({
      added: ['alice@example.com'],
      warnings: [],
    })

    const result = await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { apple: APPLE } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })

    expect(result.status).toBe('completed')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).buildId).toBe('b1')
    expect(uploadIpa).toHaveBeenCalledOnce()
    expect(findOrCreateInternalGroup).toHaveBeenCalledWith(expect.anything(), '123', 'internal')
    expect(reconcileTesters).toHaveBeenCalledWith(expect.anything(), 'g1', [
      'alice@example.com',
    ])
  })
})

describe('D-09 retry on duplicate version', () => {
  it('re-queries ASC max, bumps +1, re-uploads once on ITMS-90478', async () => {
    vi.mocked(uploadIpa)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({
        success: false,
        errors: [{ message: 'ERROR ITMS-90478', itmsCode: 'ITMS-90478' }],
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ success: true, toolVersion: '4.11' } as any)
    vi.mocked(computeNextBuildNumber).mockResolvedValue('48')
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b2',
      type: 'builds',
      attributes: {
        version: '48',
        processingState: 'PROCESSING',
        uploadedDate: '',
        expired: false,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('VALID')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(findOrCreateInternalGroup).mockResolvedValue({ id: 'g1' } as any)
    vi.mocked(reconcileTesters).mockResolvedValue({ added: [], warnings: [] })

    const result = await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { apple: APPLE } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })

    expect(result.status).toBe('completed')
    expect(uploadIpa).toHaveBeenCalledTimes(2) // initial + one retry
    expect(computeNextBuildNumber).toHaveBeenCalledTimes(1) // bump triggered once
  })

  it('hard-fails (TestFlightError) on second duplicate (D-09 retry-once budget exhausted)', async () => {
    vi.mocked(uploadIpa).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        success: false,
        errors: [{ message: 'ERROR ITMS-90478', itmsCode: 'ITMS-90478' }],
      } as any,
    )
    vi.mocked(computeNextBuildNumber).mockResolvedValue('48')

    await expect(
      runTestFlightUploadPhase({
        ipaPath: '/tmp/App.ipa',
        buildNumber: '47',
        marketingVersion: '1.0.3',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: { apple: APPLE } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emitter: EMITTER as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runner: {} as any,
      }),
    ).rejects.toThrow() // TestFlightError or similar
  })
})

describe('D-15 polling outcomes', () => {
  it('succeeds on VALID', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'PROCESSING' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('VALID')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(findOrCreateInternalGroup).mockResolvedValue({ id: 'g1' } as any)
    vi.mocked(reconcileTesters).mockResolvedValue({ added: [], warnings: [] })

    const result = await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { apple: APPLE } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })
    expect(result.status).toBe('completed')
  })

  it('45-min TIMEOUT soft-fails (D-15 + D-17): completed_with_warnings, exit 0', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'PROCESSING' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('TIMEOUT')

    const result = await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { apple: APPLE } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })
    expect(result.status).toBe('completed_with_warnings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).warnings.join(' ')).toMatch(/processing.*check ASC|ASC/i)
  })

  it('FAILED processing state hard-fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'PROCESSING' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('FAILED')

    await expect(
      runTestFlightUploadPhase({
        ipaPath: '/tmp/App.ipa',
        buildNumber: '47',
        marketingVersion: '1.0.3',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: { apple: APPLE } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emitter: EMITTER as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runner: {} as any,
      }),
    ).rejects.toThrow()
  })
})

describe('D-17 soft-fail on assignment failure', () => {
  it('tester-reconciliation error → completed_with_warnings, exit 0', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'PROCESSING' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('VALID')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(findOrCreateInternalGroup).mockResolvedValue({ id: 'g1' } as any)
    vi.mocked(reconcileTesters).mockRejectedValue(new Error('tester reconciliation failed'))

    const result = await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { apple: APPLE } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })
    expect(result.status).toBe('completed_with_warnings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).warnings.join(' ')).toMatch(/group assignment|tester|assignment failed/i)
  })

  it('group creation error → completed_with_warnings, exit 0', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'PROCESSING' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('VALID')
    vi.mocked(findOrCreateInternalGroup).mockRejectedValue(new Error('group create failed'))

    const result = await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { apple: APPLE } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })
    expect(result.status).toBe('completed_with_warnings')
  })
})

describe('D-19 default group name', () => {
  it("falls back to 'dtc-internal' when apple.ascTestFlightGroup is absent", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(uploadIpa).mockResolvedValue({ success: true } as any)
    vi.mocked(findBuildByVersion).mockResolvedValue({
      id: 'b1',
      attributes: { version: '47', processingState: 'PROCESSING' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    vi.mocked(pollUntilProcessed).mockResolvedValue('VALID')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(findOrCreateInternalGroup).mockResolvedValue({ id: 'g1' } as any)
    vi.mocked(reconcileTesters).mockResolvedValue({ added: [], warnings: [] })

    const configNoGroup = { apple: { ...APPLE, ascTestFlightGroup: undefined } }
    await runTestFlightUploadPhase({
      ipaPath: '/tmp/App.ipa',
      buildNumber: '47',
      marketingVersion: '1.0.3',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: configNoGroup as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitter: EMITTER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runner: {} as any,
    })

    expect(findOrCreateInternalGroup).toHaveBeenCalledWith(
      expect.anything(),
      '123',
      'dtc-internal',
    )
  })
})
