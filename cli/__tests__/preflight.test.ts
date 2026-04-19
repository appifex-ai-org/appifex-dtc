// Phase 03 Plan 02 (SETUP-02): Tests for runPreflight credential gate integration.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PreflightError } from '@appifex/core'

// Mock @appifex/core so we can force checkCriticalPrerequisites and runCredentialChecks
// to report specific outcomes without needing real system state.
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return {
    ...actual,
    checkCriticalPrerequisites: vi.fn(),
    runCredentialChecks: vi.fn(),
    isFixtureMode: vi.fn().mockReturnValue(false),
  }
})

import { checkCriticalPrerequisites, runCredentialChecks, isFixtureMode } from '@appifex/core'
import { runPreflight } from '../src/preflight.js'

// Helper: mock checkCriticalPrerequisites to pass (no critical failures)
function mockPrereqsPass() {
  ;(checkCriticalPrerequisites as ReturnType<typeof vi.fn>).mockReturnValue({
    hasCriticalFailures: false,
    checks: [],
  })
}

// Helper: mock checkCriticalPrerequisites to fail critically
function mockPrereqsFail() {
  ;(checkCriticalPrerequisites as ReturnType<typeof vi.fn>).mockReturnValue({
    hasCriticalFailures: true,
    checks: [
      {
        name: 'xcodebuild',
        status: 'fail',
        severity: 'critical',
        message: 'not found',
        installHint: 'install Xcode',
      },
    ],
  })
}

describe('runPreflight — Phase 03 Plan 02 (SETUP-02)', () => {
  let savedMode: string | undefined

  beforeEach(() => {
    savedMode = process.env.DTC_LLM_MODE
    delete process.env.DTC_LLM_MODE
    vi.clearAllMocks()
    ;(isFixtureMode as ReturnType<typeof vi.fn>).mockReturnValue(false)
  })

  afterEach(() => {
    if (savedMode === undefined) {
      delete process.env.DTC_LLM_MODE
    } else {
      process.env.DTC_LLM_MODE = savedMode
    }
    vi.restoreAllMocks()
  })

  // ── Test 1: Missing credential throws PreflightError, never reaches pipeline ──
  it('Test 1: runPreflight with missing llm.apiKey throws PreflightError; stdout contains [MISSING] llm', async () => {
    mockPrereqsPass()
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: true,
      checks: [
        {
          name: 'llm',
          severity: 'critical',
          status: 'MISSING',
          message: 'LLM provider key not set',
          remedy: 'Run `dtc setup llm` to configure an API key.',
        },
      ],
    })

    const lines: string[] = []
    const buf = {
      write: (data: string) => {
        lines.push(data)
        return true
      },
    } as unknown as NodeJS.WritableStream

    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    }
    await expect(runPreflight('swiftui', config, { deep: false, output: buf })).rejects.toThrow(
      PreflightError,
    )
    const combined = lines.join('')
    expect(combined).toMatch(/\[MISSING\].*llm/i)
  })

  // ── Test 2: All OK → no throw, stdout contains [OK] for present credentials ──
  it('Test 2: successful preflight returns without throwing; stdout shows [OK] lines', async () => {
    mockPrereqsPass()
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: false,
      checks: [
        { name: 'llm', severity: 'critical', status: 'OK', message: 'anthropic (shape-valid)' },
        { name: 'asc', severity: 'critical', status: 'OK', message: 'ASC key valid (offline)' },
        { name: 'firebase-plist', severity: 'critical', status: 'OK', message: 'plist found' },
      ],
    })

    const lines: string[] = []
    const buf = {
      write: (data: string) => {
        lines.push(data)
        return true
      },
    } as unknown as NodeJS.WritableStream

    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-test' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    }
    await expect(
      runPreflight('swiftui', config, { deep: false, output: buf }),
    ).resolves.not.toThrow()
    const combined = lines.join('')
    expect(combined).toMatch(/\[OK\].*llm/i)
    expect(combined).toMatch(/\[OK\].*asc/i)
    expect(combined).toMatch(/\[OK\].*firebase/i)
  })

  // ── Test 3: Transient network error → does NOT throw; shows [OK] with transient note ──
  it('Test 3: transient network failure (ECONNRESET) + deep=true → no throw; [OK] line with transient note', async () => {
    mockPrereqsPass()
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: false,
      checks: [
        {
          name: 'llm',
          severity: 'critical',
          status: 'OK',
          message: 'transient network error: ECONNRESET',
          transientError: true,
        },
      ],
    })

    const lines: string[] = []
    const buf = {
      write: (data: string) => {
        lines.push(data)
        return true
      },
    } as unknown as NodeJS.WritableStream

    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-test' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    }
    await expect(
      runPreflight('swiftui', config, { deep: true, output: buf }),
    ).resolves.not.toThrow()
    const combined = lines.join('')
    expect(combined).toMatch(/\[OK\].*llm/i)
    // Should note transient nature
    expect(combined).toMatch(/transient/i)
  })

  // ── Test 4: Fixture mode → no throw regardless of config ──
  it('Test 4: DTC_LLM_MODE=fixture → runPreflight returns without throwing regardless of config (Pitfall 7)', async () => {
    ;(isFixtureMode as ReturnType<typeof vi.fn>).mockReturnValue(true)
    mockPrereqsPass()
    // runCredentialChecks should not be called in fixture mode
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: false,
      checks: [],
    })

    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    }
    await expect(runPreflight('swiftui', config, { deep: false })).resolves.not.toThrow()
  })

  // ── Test 5: Multiple critical failures → all printed, then error thrown ──
  it('Test 5: multiple critical failures → all printed before throwing; error message summarises them all', async () => {
    mockPrereqsPass()
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: true,
      checks: [
        { name: 'llm', severity: 'critical', status: 'MISSING', message: 'no api key' },
        { name: 'asc', severity: 'critical', status: 'MISSING', message: 'no key file' },
      ],
    })

    const lines: string[] = []
    const buf = {
      write: (data: string) => {
        lines.push(data)
        return true
      },
    } as unknown as NodeJS.WritableStream

    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    }

    let caughtErr: Error | undefined
    try {
      await runPreflight('swiftui', config, { deep: false, output: buf })
    } catch (err) {
      caughtErr = err as Error
    }
    expect(caughtErr).toBeInstanceOf(PreflightError)
    const combined = lines.join('')
    // Both failures should appear in output
    expect(combined).toMatch(/\[MISSING\].*llm/i)
    expect(combined).toMatch(/\[MISSING\].*asc/i)
    // Error message summarises both
    expect(caughtErr!.message).toMatch(/llm/)
    expect(caughtErr!.message).toMatch(/asc/)
  })

  // ── Test 6: MCP-safe — process.exit never called ──
  it('Test 6 (MCP-safe): runPreflight never calls process.exit', async () => {
    mockPrereqsPass()
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: true,
      checks: [{ name: 'llm', severity: 'critical', status: 'MISSING', message: 'no api key' }],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit called with ${code}`)
    }) as never)

    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    }

    try {
      await runPreflight('swiftui', config, { deep: false })
    } catch {
      // expected to throw PreflightError — but NOT via process.exit
    } finally {
      exitSpy.mockRestore()
    }
    expect(exitSpy).not.toHaveBeenCalled()
  })

  // ── Legacy tests from phase 02 plan 01 scaffold ──
  it('throws PreflightError instead of calling process.exit when prerequisites fail', async () => {
    ;(checkCriticalPrerequisites as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      hasCriticalFailures: true,
      checks: [
        {
          name: 'xcodebuild',
          status: 'fail',
          severity: 'critical',
          message: 'not found',
          installHint: 'install Xcode',
        },
      ],
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit called with ${code}`)
    }) as never)

    try {
      await expect(runPreflight('swiftui')).rejects.toThrow(PreflightError)
    } finally {
      exitSpy.mockRestore()
    }

    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('returns normally (no throw) when no critical failures', async () => {
    ;(checkCriticalPrerequisites as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      hasCriticalFailures: false,
      checks: [],
    })
    ;(runCredentialChecks as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasBlockingFailures: false,
      checks: [],
    })

    await expect(runPreflight('swiftui')).resolves.not.toThrow()
  })

  it('PreflightError exposes exitCode 1 and inherits from CliError', async () => {
    const { CliError } = await import('@appifex/core')
    const err = new PreflightError('missing tool', 'xcodebuild')
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(1)
    expect(err.check).toBe('xcodebuild')
    expect(err.name).toBe('PreflightError')
  })
})
