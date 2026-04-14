import { describe, it, expect, vi } from 'vitest'
import { fixLoop, type FixLoopOpts } from '../src/index.js'
import type { BaasIntegrationViolation, ParityViolation } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleViolation: BaasIntegrationViolation = {
  file: 'ios/AuthManager.swift',
  platform: 'swiftui',
  type: 'facade_auth',
  matched: 'isAuthenticated = true',
  expected: 'Auth.auth() call required',
  remediation: 'Replace facade with real Firebase Auth SDK call',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeValidationResult(
  uiPassed: number,
  uiTotal: number,
  unitPassed: number,
  unitTotal: number,
): ValidationResult {
  return {
    ui: {
      total: uiTotal,
      passed: uiPassed,
      failed: uiTotal - uiPassed,
      results: Array.from({ length: uiTotal }, (_, i) => ({
        flowName: `flow-${i}`,
        passed: i < uiPassed,
        duration: 100,
        error: i >= uiPassed ? `flow-${i} failed` : undefined,
        assertions: [],
      })),
    },
    unit: {
      total: unitTotal,
      passed: unitPassed,
      failed: unitTotal - unitPassed,
      failures: Array.from({ length: unitTotal - unitPassed }, (_, i) => ({
        testName: `test-${i}`,
        suiteName: 'suite',
        error: `test-${i} failed`,
      })),
    },
    allPassed: uiPassed === uiTotal && unitPassed === unitTotal,
  }
}

function makeValidationWithBaas(
  uiPassed: number,
  uiTotal: number,
  unitPassed: number,
  unitTotal: number,
  baasViolations: BaasIntegrationViolation[] = [],
  parityViolations: ParityViolation[] = [],
): ValidationResult {
  const base = makeValidationResult(uiPassed, uiTotal, unitPassed, unitTotal)
  return {
    ...base,
    baasIntegration: {
      allPassed: baasViolations.length === 0,
      violations: baasViolations,
      filesScanned: 1,
      duration: 50,
    },
    baasParity: {
      allPassed: parityViolations.length === 0,
      violations: parityViolations,
      platformsCompared: ['swiftui'],
    },
    allPassed: base.allPassed && baasViolations.length === 0 && parityViolations.length === 0,
  }
}

function makeOpts(overrides: Partial<FixLoopOpts> = {}): FixLoopOpts {
  return {
    fixFn: vi.fn().mockResolvedValue({ filesChanged: ['fix.ts'], tokensUsed: 1000 }),
    buildFn: vi.fn().mockResolvedValue({ success: true, duration: 1000 }),
    validateFn: vi.fn().mockResolvedValue(makeValidationResult(5, 5, 12, 12)),
    maxAttempts: 5,
    tokenBudget: 50_000,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('fixLoop BaaS pass-through', () => {
  it('PIPE-02: unresolvedFailures contains BaasIntegrationViolation when BaaS fails but tests pass', async () => {
    // All UI and unit tests pass, but BaaS has a violation
    const baasFailureValidation = makeValidationWithBaas(5, 5, 12, 12, [sampleViolation])

    const opts = makeOpts({
      maxAttempts: 1,
      validateFn: vi.fn().mockResolvedValue(baasFailureValidation),
    })

    // Initial failure also has BaaS violation
    const result = await fixLoop(makeValidationWithBaas(5, 5, 12, 12, [sampleViolation]), opts)

    // Should be stuck because allPassed is false (BaaS fails) and we reach max_attempts
    expect(result.unresolvedFailures).toContainEqual(
      expect.objectContaining({ type: 'facade_auth', file: 'ios/AuthManager.swift' }),
    )
  })

  it('D-03: errorSignature does NOT change when only BaaS violations differ between attempts', async () => {
    // Both validations have same UI/unit failures but differ in BaaS violations
    // The circuit breaker should trigger because errorSignature is the same
    const violation1: BaasIntegrationViolation = { ...sampleViolation, type: 'facade_auth' }
    const violation2: BaasIntegrationViolation = { ...sampleViolation, type: 'missing_import' }

    let callCount = 0
    const validateFn = vi.fn().mockImplementation(() => {
      callCount++
      // Alternate BaaS violations but keep same UI/unit failure
      const baasViolations = callCount % 2 === 0 ? [violation1] : [violation2]
      return Promise.resolve(makeValidationWithBaas(4, 5, 12, 12, baasViolations))
    })

    const opts = makeOpts({
      maxAttempts: 10,
      validateFn,
    })

    const initial = makeValidationWithBaas(4, 5, 12, 12, [violation1])
    const result = await fixLoop(initial, opts)

    // Since BaaS violations don't affect errorSignature, and UI failure is the same every time,
    // same_error_repeated should trigger (not no_progress)
    expect(result.circuitBreakReason).toBe('same_error_repeated')
    // Should not exhaust all 10 attempts
    expect(result.attempts.length).toBeLessThanOrEqual(5)
  })
})
