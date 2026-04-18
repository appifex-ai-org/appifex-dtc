// Phase 6 (VAL-01 D-01 D-04 D-05 D-06): RED tests for runE2eGatePhase.
// Target module (packages/validate/src/e2e-gate.ts) does not yet exist — this
// file MUST fail today with "Cannot find module". Plan 06-06 creates the phase
// handler that writes the golden-path Maestro YAML, invokes runMaestro, and
// throws E2eGateError (extends CliError) on failure.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Runner, RunnerCapabilities } from '@appifex/core'

vi.mock('../src/maestro.js', () => ({ runMaestro: vi.fn() }))

// NEW module — created by Plan 06-06. Import fails today.
import { runE2eGatePhase } from '../src/e2e-gate.js'
import { runMaestro } from '../src/maestro.js'

const caps: RunnerCapabilities = {
  hasMaestro: true,
  hasXcode: true,
  hasNode: true,
  hasSemgrep: false,
  platform: 'darwin',
}

type WriteFileCall = { path: string; content: string }

function createMockRunner(): Runner & { writes: WriteFileCall[] } {
  const writes: WriteFileCall[] = []
  return {
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: async () => '',
    writeFile: async (path: string, content: string) => {
      writes.push({ path, content })
    },
    exists: async () => true,
    glob: async () => [],
    capabilities: caps,
    writes,
  } as unknown as Runner & { writes: WriteFileCall[] }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runE2eGatePhase — Phase 6 (VAL-01 D-01 D-04 D-06)', () => {
  it('Test 1: writes e2e-gate YAML to {projectDir}/.maestro/e2e/e2e-gate.yaml', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 1,
      passed: 1,
      failed: 0,
      results: [],
    } as any)
    const runner = createMockRunner()
    await runE2eGatePhase({
      runner,
      projectDir: '/proj',
      platform: 'swiftui',
      appId: 'com.example.App',
      reportDir: '/proj/.dtc-report',
    })
    const write = runner.writes.find((w) => w.path.endsWith('/.maestro/e2e/e2e-gate.yaml'))
    expect(write).toBeDefined()
  })

  it('Test 2: generated YAML contains signIn_existingAccount fall-through in a runFlow when-block', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 1,
      passed: 1,
      failed: 0,
      results: [],
    } as any)
    const runner = createMockRunner()
    await runE2eGatePhase({
      runner,
      projectDir: '/proj',
      platform: 'swiftui',
      appId: 'x',
      reportDir: '/proj/.dtc-report',
    })
    const yamlWrite = runner.writes.find((w) => w.path.endsWith('e2e-gate.yaml'))
    expect(yamlWrite).toBeDefined()
    expect(yamlWrite!.content).toContain('signIn_existingAccount')
    expect(yamlWrite!.content).toMatch(/runFlow[\s\S]+when:[\s\S]+visible/)
  })

  it('Test 3: YAML uses extendedWaitUntil with timeout >= 15000 for Firestore assertions', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 1,
      passed: 1,
      failed: 0,
      results: [],
    } as any)
    const runner = createMockRunner()
    await runE2eGatePhase({
      runner,
      projectDir: '/proj',
      platform: 'swiftui',
      appId: 'x',
      reportDir: '/proj/.dtc-report',
    })
    const yamlWrite = runner.writes.find((w) => w.path.endsWith('e2e-gate.yaml'))
    expect(yamlWrite).toBeDefined()
    expect(yamlWrite!.content).toMatch(/extendedWaitUntil[\s\S]+timeout:\s*(1[5-9]\d{3}|[2-9]\d{4})/)
  })

  it('Test 4: throws E2eGateError (extends CliError) when Maestro fails', async () => {
    vi.mocked(runMaestro).mockResolvedValue({
      total: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          flowName: 'x',
          passed: false,
          duration: 0,
          error: 'id not visible',
          assertions: [],
        },
      ],
    } as any)
    const runner = createMockRunner()
    const { CliError } = await import('@appifex/core')

    await expect(
      runE2eGatePhase({
        runner,
        projectDir: '/proj',
        platform: 'swiftui',
        appId: 'x',
        reportDir: '/proj/.dtc-report',
      }),
    ).rejects.toMatchObject({ name: 'E2eGateError' })

    // Also assert it extends CliError
    try {
      await runE2eGatePhase({
        runner,
        projectDir: '/proj',
        platform: 'swiftui',
        appId: 'x',
        reportDir: '/proj/.dtc-report',
      })
      expect.fail('runE2eGatePhase should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(CliError)
    }
  })

  it('Test 5: resolves with MaestroResult on success (no throw)', async () => {
    const success = { total: 1, passed: 1, failed: 0, results: [] }
    vi.mocked(runMaestro).mockResolvedValue(success as any)
    const runner = createMockRunner()
    const result = await runE2eGatePhase({
      runner,
      projectDir: '/proj',
      platform: 'swiftui',
      appId: 'x',
      reportDir: '/proj/.dtc-report',
    })
    expect(result.failed).toBe(0)
  })
})
