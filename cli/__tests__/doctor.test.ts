// Phase 03 Plan 05 (SETUP-03, D-11/D-12): regression tests for runDoctor shallow + --deep tiers.
// Tests 1-8 per plan spec.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseArgs } from '../src/cli.js'

// ── Mock @appifex/core ──────────────────────────────────────────────────────
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return {
    ...actual,
    checkPrerequisites: vi.fn().mockReturnValue({
      platform: 'swiftui',
      checks: [],
      hasCriticalFailures: false,
      hasWarnings: false,
    }),
    checkFirebaseTools: vi.fn().mockReturnValue({
      name: 'firebase CLI',
      severity: 'info',
      status: 'pass',
      message: 'firebase-tools 13.0.0',
    }),
    checkServiceAccountJson: vi.fn().mockResolvedValue({
      name: 'firebase service account',
      severity: 'warning',
      status: 'skip',
      message: 'not configured',
    }),
    checkAscP8: vi.fn().mockResolvedValue({
      name: 'ASC API key',
      severity: 'warning',
      status: 'skip',
      message: 'not configured',
    }),
    runCredentialChecks: vi.fn().mockResolvedValue({
      checks: [{ name: 'llm', severity: 'critical', status: 'OK', message: 'live probe passed' }],
      hasBlockingFailures: false,
    }),
    loadConfig: vi.fn().mockResolvedValue({
      llm: { provider: 'anthropic', apiKey: 'sk-ant-test-key' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }),
    isFixtureMode: actual.isFixtureMode,
    CliError: actual.CliError,
    ConfigError: actual.ConfigError,
  }
})

// ── Helper: capture runDoctor output to a buffer ───────────────────────────

async function captureDoctor(opts: {
  deep?: boolean
  configDir?: string
}): Promise<{ output: string; error: Error | null }> {
  const chunks: string[] = []
  const fakeStream = {
    write: (chunk: string) => {
      chunks.push(chunk)
      return true
    },
  } as unknown as NodeJS.WritableStream

  const { runDoctor } = await import('../src/doctor.js')
  let error: Error | null = null
  try {
    await runDoctor({ ...opts, output: fakeStream })
  } catch (err) {
    error = err as Error
  }
  return { output: chunks.join(''), error }
}

describe('runDoctor — shallow tier (no --deep)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.DTC_LLM_MODE
  })

  // Test 1: shallow calls checkPrerequisites + checkFirebaseTools + checkServiceAccountJson + checkAscP8 but NOT fetch
  it('Test 1: shallow calls shallow check functions, not fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { checkPrerequisites, checkFirebaseTools, checkServiceAccountJson, checkAscP8 } =
      await import('@appifex/core')

    await captureDoctor({ deep: false })

    expect(checkFirebaseTools).toHaveBeenCalled()
    expect(checkServiceAccountJson).toHaveBeenCalled()
    expect(checkAscP8).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  // Test 3: output contains lines for firebase CLI, firebase service account, ASC API key
  it('Test 3: output contains status lines for firebase CLI, firebase service account, ASC API key', async () => {
    const { output } = await captureDoctor({ deep: false })
    expect(output).toMatch(/firebase CLI/)
    expect(output).toMatch(/firebase service account/)
    expect(output).toMatch(/ASC API key/)
  })

  // Test 6 (MCP-safe): runDoctor never calls process.exit
  it('Test 6 (MCP-safe): never calls process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error('process.exit called')
    })
    try {
      await captureDoctor({ deep: false })
      expect(exitSpy).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })
})

describe('runDoctor — deep tier (--deep)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.DTC_LLM_MODE
  })

  // Test 2: --deep calls same shallow functions AND runCredentialChecks
  it('Test 2: --deep calls shallow functions AND runCredentialChecks', async () => {
    const { checkFirebaseTools, checkServiceAccountJson, checkAscP8, runCredentialChecks } =
      await import('@appifex/core')

    await captureDoctor({ deep: true })

    expect(checkFirebaseTools).toHaveBeenCalled()
    expect(checkServiceAccountJson).toHaveBeenCalled()
    expect(checkAscP8).toHaveBeenCalled()
    expect(runCredentialChecks).toHaveBeenCalledWith(expect.anything(), { deep: true })
  })

  // Test 4 (Pitfall 4): --deep uses runCredentialChecks (same as preflight)
  it('Test 4 (Pitfall 4): runDoctor --deep calls runCredentialChecks — same fn as preflight uses', async () => {
    const { runCredentialChecks } = await import('@appifex/core')

    await captureDoctor({ deep: true })

    // runCredentialChecks must be called with deep: true
    expect(runCredentialChecks).toHaveBeenCalledWith(expect.anything(), { deep: true })
  })

  // Test 5 (fixture): DTC_LLM_MODE=fixture + --deep → no live fetch calls
  it('Test 5 (fixture): DTC_LLM_MODE=fixture + --deep skips live fetch', async () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await captureDoctor({ deep: true })

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

// Test 7: parseArgs doctor --deep returns { command: 'doctor', deep: true }
describe('parseArgs — doctor --deep flag', () => {
  it('Test 7: parseArgs([doctor, --deep]) returns deep: true', () => {
    const args = parseArgs(['doctor', '--deep'])
    expect(args.command).toBe('doctor')
    expect(args.deep).toBe(true)
  })

  it('parseArgs([doctor]) has deep undefined (not set)', () => {
    const args = parseArgs(['doctor'])
    expect(args.command).toBe('doctor')
    expect(args.deep).toBeUndefined()
  })
})

// Test 8: failing check → throws CliError (not process.exit)
describe('runDoctor — exit code via CliError on critical failure', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('Test 8: critical failing check throws CliError, not process.exit', async () => {
    const { checkPrerequisites, CliError } = await import('@appifex/core')
    vi.mocked(checkPrerequisites).mockReturnValueOnce({
      platform: 'swiftui',
      checks: [{ name: 'macOS', severity: 'critical', status: 'fail', message: 'not macOS' }],
      hasCriticalFailures: true,
      hasWarnings: false,
    })

    const { error } = await captureDoctor({ deep: false })
    expect(error).not.toBeNull()
    expect(error).toBeInstanceOf(CliError)
  })
})
