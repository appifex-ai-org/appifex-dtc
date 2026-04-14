import { describe, it, expect } from 'vitest'
import { fixLoop } from '@appifex/fix'
import type { ValidationResult } from '@appifex/validate'
import type { SemgrepFinding } from '@appifex/core'

function makeValidation(
  overrides: {
    uiPassed?: boolean
    unitPassed?: boolean
    securityFindings?: SemgrepFinding[]
  } = {},
): ValidationResult {
  const findings = overrides.securityFindings ?? []
  return {
    ui: { total: 1, passed: 1, failed: 0, results: [{ flowName: 'test', passed: true }] },
    unit: { total: 1, passed: 1, failed: 0, failures: [] },
    security:
      findings.length > 0
        ? { total: findings.length, passed: 0, failed: findings.length, findings }
        : { total: 0, passed: 1, failed: 0, findings: [] },
    allPassed:
      findings.length === 0 && overrides.uiPassed !== false && overrides.unitPassed !== false,
  }
}

const hardcodedPasswordFinding: SemgrepFinding = {
  ruleId: 'swift.lang.security.hardcoded-password',
  severity: 'ERROR',
  message: 'Hardcoded password detected',
  file: 'Sources/TaskStore.swift',
  line: 10,
}

describe('fix loop with security findings', () => {
  it('enters fix loop when security findings exist (allPassed=false)', async () => {
    const failingValidation = makeValidation({ securityFindings: [hardcodedPasswordFinding] })
    let fixCallCount = 0

    // First call: security finding present → allPassed=false
    // Second call (after fix): clean → allPassed=true
    const result = await fixLoop(failingValidation, {
      fixFn: async (failures) => {
        fixCallCount++
        // Verify security findings are passed to fixFn
        expect(failures.security?.findings).toHaveLength(1)
        expect(failures.security?.findings[0].ruleId).toBe('swift.lang.security.hardcoded-password')
        return { filesChanged: ['Sources/TaskStore.swift'], tokensUsed: 500 }
      },
      buildFn: async () => ({ success: true, duration: 100 }),
      validateFn: async () => makeValidation(), // clean on re-validate
      maxAttempts: 5,
      tokenBudget: 50_000,
    })

    expect(fixCallCount).toBe(1)
    expect(result.status).toBe('all_green')
  })

  it('circuit-breaks after repeated same security finding', async () => {
    const failingValidation = makeValidation({ securityFindings: [hardcodedPasswordFinding] })

    const result = await fixLoop(failingValidation, {
      fixFn: async () => ({ filesChanged: ['Sources/TaskStore.swift'], tokensUsed: 500 }),
      buildFn: async () => ({ success: true, duration: 100 }),
      validateFn: async () => makeValidation({ securityFindings: [hardcodedPasswordFinding] }), // never fixes
      maxAttempts: 5,
      tokenBudget: 50_000,
    })

    expect(result.status).toBe('stuck')
    expect(result.circuitBreakReason).toBe('same_error_repeated')
    expect(result.attempts.length).toBeLessThanOrEqual(3)
  })

  it('skips fix loop when security is clean', async () => {
    const cleanValidation = makeValidation()
    // allPassed is true, so the pipeline would skip the fix loop entirely
    // This test verifies the validation shape is correct
    expect(cleanValidation.allPassed).toBe(true)
    expect(cleanValidation.security?.failed).toBe(0)
  })

  it('includes security findings in error signature for dedup', async () => {
    const finding1: SemgrepFinding = { ...hardcodedPasswordFinding, line: 10 }
    const finding2: SemgrepFinding = {
      ...hardcodedPasswordFinding,
      ruleId: 'swift.lang.security.sql-injection',
      line: 20,
    }
    let callCount = 0

    const result = await fixLoop(makeValidation({ securityFindings: [finding1] }), {
      fixFn: async () => {
        callCount++
        return { filesChanged: ['Sources/TaskStore.swift'], tokensUsed: 500 }
      },
      buildFn: async () => ({ success: true, duration: 100 }),
      // Alternates between two different findings — not "same error repeated"
      validateFn: async () => {
        return makeValidation({
          securityFindings: [callCount % 2 === 0 ? finding1 : finding2],
        })
      },
      maxAttempts: 5,
      tokenBudget: 50_000,
    })

    // Should hit no_progress (different errors but no improvement) rather than same_error_repeated
    expect(result.status).toBe('stuck')
    expect(result.circuitBreakReason).toBe('no_progress')
  })
})
