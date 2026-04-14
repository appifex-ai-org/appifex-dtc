import { describe, it, expect, vi } from 'vitest'
import { validateAll } from '../src/index.js'
import type { Runner, BaasContext } from '@appifex/core'

// ── Inline fixture constants (D-03) ────────────────────────────────────────

const DUMMY_IOS_SWIFT = `
import SwiftUI
class AuthManager: ObservableObject {
  var isAuthenticated = true
  func signOut() {}
}
`

const CLEAN_IOS_SWIFT = `
import FirebaseAuth
import SwiftUI
class AuthManager: ObservableObject {
  func checkAuth() -> Bool { return Auth.auth().currentUser != nil }
}
`

const ANDROID_KOTLIN = `
import com.google.firebase.auth.FirebaseAuth
class AuthViewModel {
    val auth = FirebaseAuth.getInstance()
    fun isSignedIn() = auth.currentUser != null
}
`

const PASSING_JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="0">
  <testsuite name="auth-flow" tests="2" failures="0">
    <testcase name="testLogin" time="0.5"/>
    <testcase name="testLogout" time="0.3"/>
  </testsuite>
</testsuites>`

// ── BaasContext (canonical shape from types.ts) ────────────────────────────

const firebaseBaasContext: BaasContext = {
  provider: 'firebase',
  recommendation: { tier: 'appropriate', reason: 'E2E test' },
}

// ── Fixture paths ──────────────────────────────────────────────────────────

const IOS_PATH = '/project/ios/AuthManager.swift'
const ANDROID_PATH = '/project/android/AuthViewModel.kt'

// ── Mock helpers (pattern from validate-baas.test.ts) ──────────────────────

function mockExec() {
  return vi.fn().mockImplementation((cmd: string, args?: string[]) => {
    if (cmd === 'which') return Promise.resolve({ exitCode: 0, stdout: '/usr/local/bin/maestro', stderr: '', duration: 10 })
    if (cmd === 'defaults') return Promise.resolve({ exitCode: 0, stdout: 'com.dtc.App', stderr: '', duration: 10 })
    if (cmd === 'mkdir') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 10 })
    if (cmd === 'xcrun' && args?.[0] === 'simctl' && args?.[1] === 'list') {
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [{ name: 'iPhone 15', udid: 'sim-123', isAvailable: true }] } }), stderr: '', duration: 100 })
    }
    if (cmd === 'xcrun' && args?.[0] === 'simctl') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'xcrun') return Promise.resolve({ exitCode: 1, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'maestro') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 500 })
    if (cmd === 'xcodebuild') return Promise.resolve({ exitCode: 0, stdout: "Test Case '-[AppTests.T testA]' passed (0.1 seconds).", stderr: '', duration: 1000 })
    if (cmd === 'xcodegen') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'rm') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 10 })
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 0 })
  })
}

function mockGlob(opts: { hasIos: boolean; hasKt: boolean }) {
  return vi.fn().mockImplementation((pattern: string) => {
    // BaaS detection globs — use endsWith for reliable matching (Pitfall 1)
    if (pattern.endsWith('.swift')) return Promise.resolve(opts.hasIos ? [IOS_PATH] : [])
    if (pattern.endsWith('.kt')) return Promise.resolve(opts.hasKt ? [ANDROID_PATH] : [])
    // Maestro / xcodebuild / unit-test globs
    if (pattern.includes('.yaml')) return Promise.resolve(['.maestro/home.yaml'])
    if (pattern.includes('.ips')) return Promise.resolve([])
    if (pattern.includes('Debug-iphonesimulator') || pattern.includes('DerivedData'))
      return Promise.resolve(['/app/build/Build/Products/Debug-iphonesimulator/App.app'])
    if (pattern.includes('.xml')) return Promise.resolve(['/tmp/report/maestro-results.xml'])
    if (pattern.includes('.xcodeproj')) return Promise.resolve(['/app/App.xcodeproj'])
    return Promise.resolve([])
  })
}

// ── Runner factory ─────────────────────────────────────────────────────────

function makeRunner(opts: { iosContent?: string; ktContent?: string }): Runner {
  return {
    exec: mockExec(),
    readFile: vi.fn().mockImplementation((path: string) => {
      if (path === IOS_PATH && opts.iosContent != null) return Promise.resolve(opts.iosContent)
      if (path === ANDROID_PATH && opts.ktContent != null) return Promise.resolve(opts.ktContent)
      // Default: return passing JUNIT XML for any other path (maestro results, unit test results)
      return Promise.resolve(PASSING_JUNIT)
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: mockGlob({ hasIos: opts.iosContent != null, hasKt: opts.ktContent != null }),
    capabilities: { hasMaestro: true, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'linux' },
  }
}

// ── ValidateAllOpts ────────────────────────────────────────────────────────

const baseOpts = {
  platform: 'swiftui' as const,
  projectDir: '/project',
  flowDir: '.maestro/',
  testDir: 'Tests/',
  reportDir: '/tmp/report',
  baasContext: firebaseBaasContext,
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('E2E BaaS validation chain', () => {
  it('Pass 1: dummy iOS + real Android triggers violations and parity mismatch', async () => {
    const runner = makeRunner({ iosContent: DUMMY_IOS_SWIFT, ktContent: ANDROID_KOTLIN })
    const result = await validateAll(runner, baseOpts)

    // PIPE-01: baasIntegration and baasParity fields present on result
    expect(result.baasIntegration).toBeDefined()
    expect(result.baasParity).toBeDefined()

    // DET-01 + DET-02: violations detected on dummy iOS fixture
    expect(result.baasIntegration!.allPassed).toBe(false)
    expect(result.baasIntegration!.violations.length).toBeGreaterThan(0)

    // DET-01: missing_import violation for Swift
    const missingImport = result.baasIntegration!.violations.find(v => v.type === 'missing_import')
    expect(missingImport).toBeDefined()
    expect(missingImport!.platform).toBe('swiftui')

    // DET-02: facade_auth violation for Swift
    const facadeAuth = result.baasIntegration!.violations.find(v => v.type === 'facade_auth')
    expect(facadeAuth).toBeDefined()
    expect(facadeAuth!.platform).toBe('swiftui')

    // PIPE-02: each violation has non-empty file, expected, remediation
    for (const v of result.baasIntegration!.violations) {
      expect(v.file).toBeTruthy()
      expect(v.expected).toBeTruthy()
      expect(v.remediation).toBeTruthy()
    }

    // PAR-01: parity mismatch — Android passes, iOS fails
    expect(result.baasParity!.allPassed).toBe(false)
    expect(result.baasParity!.violations.length).toBeGreaterThan(0)
    expect(result.baasParity!.violations[0].passingPlatform).toBe('kotlin-compose')
    expect(result.baasParity!.violations[0].failingPlatform).toBe('swiftui')

    // Overall result
    expect(result.allPassed).toBe(false)
  })

  it('Pass 2: corrected iOS + real Android clears all violations', async () => {
    const runner = makeRunner({ iosContent: CLEAN_IOS_SWIFT, ktContent: ANDROID_KOTLIN })
    const result = await validateAll(runner, baseOpts)

    // DET-03: corrected file clears all violations
    expect(result.baasIntegration).toBeDefined()
    expect(result.baasIntegration!.allPassed).toBe(true)
    expect(result.baasIntegration!.violations).toHaveLength(0)

    // Parity: both platforms pass
    expect(result.baasParity).toBeDefined()
    expect(result.baasParity!.allPassed).toBe(true)
    expect(result.baasParity!.violations).toHaveLength(0)

    expect(result.allPassed).toBe(true)
  })

  it('Android Kotlin fixture passes without regressions (no iOS files)', async () => {
    const runner = makeRunner({ ktContent: ANDROID_KOTLIN })
    const result = await validateAll(runner, baseOpts)

    // DET-04: Android-only produces no violations
    expect(result.baasIntegration).toBeDefined()
    expect(result.baasIntegration!.allPassed).toBe(true)
    expect(result.baasIntegration!.violations).toHaveLength(0)
  })

  it('BaaS detection completes in under 2000ms', async () => {
    const runner = makeRunner({ iosContent: DUMMY_IOS_SWIFT, ktContent: ANDROID_KOTLIN })
    const result = await validateAll(runner, baseOpts)

    // PIPE-03: performance budget
    expect(result.baasIntegration).toBeDefined()
    expect(result.baasIntegration!.duration).toBeLessThan(2000)
  })
})
