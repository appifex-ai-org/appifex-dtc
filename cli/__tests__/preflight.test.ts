import { describe, it, expect, vi } from 'vitest'
import { PreflightError } from '@appifex/core'

// Mock @appifex/core so we can force checkCriticalPrerequisites to report a
// critical failure without needing real system state.
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return {
    ...actual,
    checkCriticalPrerequisites: vi.fn(),
  }
})

import { checkCriticalPrerequisites } from '@appifex/core'
import { runPreflight } from '../src/preflight.js'

describe('runPreflight — Phase 02 Plan 01 (FOUND-04)', () => {
  it('throws PreflightError instead of calling process.exit when prerequisites fail', () => {
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
      expect(() => runPreflight('swiftui')).toThrow(PreflightError)
    } finally {
      exitSpy.mockRestore()
    }

    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('returns normally (no throw) when no critical failures', () => {
    ;(checkCriticalPrerequisites as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      hasCriticalFailures: false,
      checks: [],
    })

    expect(() => runPreflight('swiftui')).not.toThrow()
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
