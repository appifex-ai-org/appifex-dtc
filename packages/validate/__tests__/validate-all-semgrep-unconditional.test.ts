// Phase 6 (VAL-04 D-18): RED tests that lock the "semgrep runs unconditionally"
// contract. Today's validate-all.ts:62 guard (`runSecurity && baseTestsPassed`)
// skips semgrep when Maestro or unit tests fail. D-18 removes that guard; Tests 1
// and 2 assert the new behavior and therefore fail today.
//
// Rule 1 deviation: the plan specified mock path '../src/unit.js', but the actual
// module lives at '../src/unit-tests.js' exporting `runUnitTests`. Mocking the
// wrong path causes a Cannot-find-module error at import time that masks the
// intended assertion RED. Corrected to match the real file name.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Runner, RunnerCapabilities } from '@appifex/core'

// Mock runMaestro, runUnitTests, runSemgrep so we can control pass/fail and track invocations.
vi.mock('../src/maestro.js', () => ({
  runMaestro: vi.fn(),
}))
vi.mock('../src/unit-tests.js', () => ({
  runUnitTests: vi.fn(),
}))
vi.mock('../src/semgrep.js', () => ({
  runSemgrep: vi.fn(),
}))

import { validateAll } from '../src/validate-all.js'
import { runMaestro } from '../src/maestro.js'
import { runUnitTests } from '../src/unit-tests.js'
import { runSemgrep } from '../src/semgrep.js'

const caps: RunnerCapabilities = {
  hasMaestro: true,
  hasXcode: true,
  hasNode: true,
  hasSemgrep: true,
  platform: 'darwin',
}

function createMockRunner(): Runner {
  return {
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: async () => '',
    writeFile: async () => {},
    exists: async () => true,
    glob: async () => [],
    capabilities: caps,
  } as unknown as Runner
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateAll semgrep unconditional — Phase 6 (VAL-04 D-18)', () => {
  it('Test 1: runs semgrep even when Maestro failed', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 1,
      passed: 0,
      failed: 1,
      results: [{ flowName: 'x', passed: false, duration: 0, assertions: [] }],
    } as any)
    vi.mocked(runUnitTests).mockResolvedValue({
      total: 0,
      passed: 0,
      failed: 0,
      failures: [],
    } as any)
    vi.mocked(runSemgrep).mockResolvedValue({
      total: 0,
      passed: 0,
      failed: 0,
      findings: [],
    } as any)

    await validateAll(createMockRunner(), {
      projectDir: '/proj',
      platform: 'swiftui',
      runSecurity: true,
      flowDir: '/proj/.maestro',
      testDir: '/proj/Tests',
      reportDir: '/proj/.dtc-report',
      scheme: 'App',
    } as any)

    expect(runSemgrep).toHaveBeenCalledTimes(1)
  })

  it('Test 2: runs semgrep even when unit tests failed', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
    } as any)
    vi.mocked(runUnitTests).mockResolvedValue({
      total: 1,
      passed: 0,
      failed: 1,
      failures: [{ testName: 't', suiteName: 's', error: 'y' }],
    } as any)
    vi.mocked(runSemgrep).mockResolvedValue({
      total: 0,
      passed: 0,
      failed: 0,
      findings: [],
    } as any)

    await validateAll(createMockRunner(), {
      projectDir: '/proj',
      platform: 'swiftui',
      runSecurity: true,
      flowDir: '/proj/.maestro',
      testDir: '/proj/Tests',
      reportDir: '/proj/.dtc-report',
      scheme: 'App',
    } as any)

    expect(runSemgrep).toHaveBeenCalledTimes(1)
  })

  it('Test 3: does NOT run semgrep when runSecurity is false (regression guard)', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
    } as any)
    vi.mocked(runUnitTests).mockResolvedValue({
      total: 0,
      passed: 0,
      failed: 0,
      failures: [],
    } as any)

    await validateAll(createMockRunner(), {
      projectDir: '/proj',
      platform: 'swiftui',
      runSecurity: false,
      flowDir: '/proj/.maestro',
      testDir: '/proj/Tests',
      reportDir: '/proj/.dtc-report',
      scheme: 'App',
    } as any)

    expect(runSemgrep).not.toHaveBeenCalled()
  })
})
