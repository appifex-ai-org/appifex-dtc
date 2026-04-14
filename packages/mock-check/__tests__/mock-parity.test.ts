import { describe, it, expect } from 'vitest'
import { checkMockParity } from '@appifex/mock-check'
import type { MockCheckResult, MockLayerViolation } from '@appifex/core'

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<MockCheckResult> = {}): MockCheckResult {
  return {
    allPassed: true,
    violations: [],
    filesScanned: 0,
    duration: 5,
    platformsScanned: ['swiftui', 'kotlin-compose'],
    ...overrides,
  }
}

function makeViolation(overrides: Partial<MockLayerViolation> = {}): MockLayerViolation {
  return {
    file: 'MockAuthManager.swift',
    platform: 'swiftui',
    type: 'MISSING_MOCK',
    remediation: 'Create MockAuthManager.swift',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkMockParity', () => {
  it('Test 1: single platform (swiftui only) returns allPassed true — no comparison possible', () => {
    const result = checkMockParity(makeResult({ platformsScanned: ['swiftui'] }))
    expect(result.allPassed).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.platformsCompared).toEqual(['swiftui'])
  })

  it('Test 2: all platforms passing returns allPassed true with no parity violations', () => {
    const result = checkMockParity(
      makeResult({
        platformsScanned: ['swiftui', 'kotlin-compose'],
        violations: [],
      }),
    )
    expect(result.allPassed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('Test 3: Swift clean + Kotlin has MISSING_MOCK returns parity violation (passing=swiftui, failing=kotlin-compose)', () => {
    const result = checkMockParity(
      makeResult({
        allPassed: false,
        platformsScanned: ['swiftui', 'kotlin-compose'],
        violations: [
          makeViolation({
            file: 'MockAuthManager.kt',
            platform: 'kotlin-compose',
            type: 'MISSING_MOCK',
          }),
        ],
      }),
    )
    expect(result.allPassed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].passingPlatform).toBe('swiftui')
    expect(result.violations[0].failingPlatform).toBe('kotlin-compose')
    expect(result.violations[0].failingViolationTypes).toContain('MISSING_MOCK')
  })

  it('Test 4: React has MISSING_METHOD + Kotlin has violations returns allPassed true (symmetric — both failing)', () => {
    const result = checkMockParity(
      makeResult({
        allPassed: false,
        platformsScanned: ['swiftui', 'kotlin-compose', 'react'],
        violations: [
          makeViolation({ platform: 'react', type: 'MISSING_METHOD', file: 'MockAuthManager.tsx' }),
          makeViolation({
            platform: 'kotlin-compose',
            type: 'MISSING_MOCK',
            file: 'MockAuthManager.kt',
          }),
        ],
      }),
    )
    // swiftui passes, react and kotlin-compose both fail — parity violations for swift vs react AND swift vs kotlin
    expect(result.allPassed).toBe(false)
    // swiftui is the only passing platform, so 2 violations expected
    const passingViolations = result.violations.filter((v) => v.passingPlatform === 'swiftui')
    expect(passingViolations.length).toBe(2)
  })

  it('Test 4b: React MISSING_METHOD + Kotlin MISSING_MOCK — no swiftui in scan — both failing is symmetric', () => {
    const result = checkMockParity(
      makeResult({
        allPassed: false,
        platformsScanned: ['kotlin-compose', 'react'],
        violations: [
          makeViolation({ platform: 'react', type: 'MISSING_METHOD', file: 'MockAuthManager.tsx' }),
          makeViolation({
            platform: 'kotlin-compose',
            type: 'MISSING_MOCK',
            file: 'MockAuthManager.kt',
          }),
        ],
      }),
    )
    // Both platforms fail — no asymmetry
    expect(result.allPassed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('Test 5: three platforms where only React fails returns 2 violations (swift->react, kotlin->react)', () => {
    const result = checkMockParity(
      makeResult({
        allPassed: false,
        platformsScanned: ['swiftui', 'kotlin-compose', 'react'],
        violations: [
          makeViolation({ platform: 'react', type: 'MISSING_MOCK', file: 'MockDataService.tsx' }),
        ],
      }),
    )
    expect(result.allPassed).toBe(false)
    expect(result.violations).toHaveLength(2)

    const swiftVsReact = result.violations.find(
      (v) => v.passingPlatform === 'swiftui' && v.failingPlatform === 'react',
    )
    expect(swiftVsReact).toBeDefined()

    const kotlinVsReact = result.violations.find(
      (v) => v.passingPlatform === 'kotlin-compose' && v.failingPlatform === 'react',
    )
    expect(kotlinVsReact).toBeDefined()
  })

  it('MockParityViolation has all required fields', () => {
    const result = checkMockParity(
      makeResult({
        allPassed: false,
        platformsScanned: ['swiftui', 'kotlin-compose'],
        violations: [
          makeViolation({
            platform: 'kotlin-compose',
            type: 'MISSING_MOCK',
            file: 'MockAuthManager.kt',
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

  it('platformsCompared reflects the scanned platforms', () => {
    const result = checkMockParity(
      makeResult({ platformsScanned: ['swiftui', 'kotlin-compose', 'react'] }),
    )
    expect(result.platformsCompared).toEqual(['swiftui', 'kotlin-compose', 'react'])
  })
})
