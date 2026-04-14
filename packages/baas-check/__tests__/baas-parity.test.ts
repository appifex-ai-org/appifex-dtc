import { describe, it, expect } from 'vitest'
import { checkBaasParity } from '@appifex/baas-check'
import type { BaasIntegrationResult, BaasIntegrationViolation } from '@appifex/core'

// ── Test helpers ────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<BaasIntegrationResult> = {}): BaasIntegrationResult {
  return {
    allPassed: true,
    violations: [],
    filesScanned: 0,
    duration: 5,
    platformsScanned: ['swiftui', 'kotlin-compose'],
    ...overrides,
  }
}

function makeViolation(
  overrides: Partial<BaasIntegrationViolation> = {},
): BaasIntegrationViolation {
  return {
    file: 'AuthManager.swift',
    platform: 'swiftui',
    type: 'facade_auth',
    expected: 'Real SDK auth call',
    remediation: 'Wire real Firebase Auth',
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('checkBaasParity', () => {
  it('Test 1: iOS passes + Android has facade_auth -> ParityViolation', () => {
    const result = checkBaasParity(
      makeResult({
        allPassed: false,
        violations: [
          makeViolation({
            file: 'AuthViewModel.kt',
            platform: 'kotlin-compose',
            type: 'facade_auth',
            expected: 'FirebaseAuth.getInstance()',
            remediation: 'Wire real Firebase Auth',
          }),
        ],
      }),
    )

    expect(result.allPassed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].passingPlatform).toBe('swiftui')
    expect(result.violations[0].failingPlatform).toBe('kotlin-compose')
    expect(result.violations[0].failingViolationTypes).toContain('facade_auth')
  })

  it('Test 2: Both platforms pass -> allPassed: true, violations: []', () => {
    const result = checkBaasParity(makeResult())

    expect(result.allPassed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('Test 3: platformsScanned has only swiftui -> allPassed: true (parity N/A)', () => {
    const result = checkBaasParity(makeResult({ platformsScanned: ['swiftui'] }))

    expect(result.allPassed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('Test 4: Both platforms fail -> allPassed: true (detection issue, not parity)', () => {
    const result = checkBaasParity(
      makeResult({
        allPassed: false,
        violations: [
          makeViolation({ platform: 'swiftui', type: 'facade_auth' }),
          makeViolation({
            file: 'AuthViewModel.kt',
            platform: 'kotlin-compose',
            type: 'facade_auth',
          }),
        ],
      }),
    )

    expect(result.allPassed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('Test 5: ParityViolation has all required fields', () => {
    const result = checkBaasParity(
      makeResult({
        allPassed: false,
        violations: [
          makeViolation({
            file: 'AuthViewModel.kt',
            platform: 'kotlin-compose',
            type: 'facade_auth',
          }),
        ],
      }),
    )

    expect(result.violations).toHaveLength(1)
    const v = result.violations[0]
    expect(v).toHaveProperty('passingPlatform')
    expect(v).toHaveProperty('failingPlatform')
    expect(v).toHaveProperty('failingViolationTypes')
    expect(v).toHaveProperty('remediation')
  })

  it('Test 6: Android passes + iOS has missing_import -> ParityViolation reversed', () => {
    const result = checkBaasParity(
      makeResult({
        allPassed: false,
        violations: [
          makeViolation({
            file: 'AuthManager.swift',
            platform: 'swiftui',
            type: 'missing_import',
          }),
        ],
      }),
    )

    expect(result.allPassed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].passingPlatform).toBe('kotlin-compose')
    expect(result.violations[0].failingPlatform).toBe('swiftui')
  })

  it('Test 7: platformsScanned is undefined -> allPassed: true (backward compat)', () => {
    const result = checkBaasParity(makeResult({ platformsScanned: undefined }))

    expect(result.allPassed).toBe(true)
  })

  it('Test 8: platformsScanned is empty [] -> allPassed: true', () => {
    const result = checkBaasParity(makeResult({ platformsScanned: [] }))

    expect(result.allPassed).toBe(true)
  })
})
