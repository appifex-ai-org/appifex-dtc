import { describe, it, expect, vi } from 'vitest'
import { validateAll } from '../src/index.js'
import type { Runner, BaasContext, BaasIntegrationViolation } from '@appifex/core'

// Minimal Swift file with a facade auth pattern (no real Firebase Auth calls)
const DUMMY_AUTH_SWIFT = `
import SwiftUI
class AuthManager {
  var isAuthenticated = true
}
`

// Clean Swift file with real Firebase Auth usage
const CLEAN_AUTH_SWIFT = `
import FirebaseAuth
class AuthManager {
  func check() { Auth.auth().currentUser }
}
`

const PASSING_JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="0">
  <testsuite name="auth-flow" tests="2" failures="0">
    <testcase name="testLogin" time="0.5"/>
    <testcase name="testLogout" time="0.3"/>
  </testsuite>
</testsuites>`

function mockRunnerBase(): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 100 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: true,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'linux',
    },
  }
}

function mockExec() {
  return vi.fn().mockImplementation((cmd: string, args?: string[]) => {
    if (cmd === 'which')
      return Promise.resolve({
        exitCode: 0,
        stdout: '/usr/local/bin/maestro',
        stderr: '',
        duration: 10,
      })
    if (cmd === 'defaults')
      return Promise.resolve({ exitCode: 0, stdout: 'com.dtc.App', stderr: '', duration: 10 })
    if (cmd === 'mkdir')
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 10 })
    if (cmd === 'xcrun' && args?.[0] === 'simctl' && args?.[1] === 'list') {
      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
              { name: 'iPhone 15', udid: 'sim-123', isAvailable: true },
            ],
          },
        }),
        stderr: '',
        duration: 100,
      })
    }
    if (cmd === 'xcrun' && args?.[0] === 'simctl')
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'xcrun')
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'maestro')
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 500 })
    if (cmd === 'xcodebuild')
      return Promise.resolve({
        exitCode: 0,
        stdout: "Test Case '-[AppTests.T testA]' passed (0.1 seconds).",
        stderr: '',
        duration: 1000,
      })
    if (cmd === 'xcodegen')
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'rm') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 10 })
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 0 })
  })
}

function mockGlob(swiftFile?: string) {
  return vi.fn().mockImplementation((pattern: string) => {
    if (pattern.includes('**/*.swift')) return Promise.resolve(swiftFile ? [swiftFile] : [])
    if (pattern.includes('**/*.kt')) return Promise.resolve([])
    if (pattern.includes('.yaml')) return Promise.resolve(['.maestro/home.yaml'])
    if (pattern.includes('.ips')) return Promise.resolve([])
    if (pattern.includes('Debug-iphonesimulator') || pattern.includes('DerivedData'))
      return Promise.resolve(['/app/build/Build/Products/Debug-iphonesimulator/App.app'])
    if (pattern.includes('.xml')) return Promise.resolve(['/tmp/report/maestro-results.xml'])
    if (pattern.includes('.swift')) return Promise.resolve(['Tests/Test.swift'])
    if (pattern.includes('.xcodeproj')) return Promise.resolve(['/app/App.xcodeproj'])
    return Promise.resolve([])
  })
}

const baasContext: BaasContext = {
  provider: 'firebase',
  recommendation: { tier: 'appropriate', summary: 'Firebase is appropriate', services: [] },
  authConfig: { provider: 'firebase' },
}

describe('validateAll BaaS integration', () => {
  it('PIPE-01: returns allPassed:false and baasIntegration.violations when dummy-auth Swift file present', async () => {
    const runner = mockRunnerBase()
    runner.exec = mockExec()
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(mockGlob('ios/AuthManager.swift'))
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === 'ios/AuthManager.swift') return Promise.resolve(DUMMY_AUTH_SWIFT)
      return Promise.resolve(PASSING_JUNIT)
    })
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
      baasContext,
    })

    expect(result.baasIntegration).toBeDefined()
    expect(result.baasIntegration!.allPassed).toBe(false)
    expect(result.baasIntegration!.violations.length).toBeGreaterThan(0)
    expect(result.allPassed).toBe(false)
  })

  it('PIPE-01: returns allPassed:true and baasIntegration.allPassed:true when clean Swift file present', async () => {
    const runner = mockRunnerBase()
    runner.exec = mockExec()
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(mockGlob('ios/AuthManager.swift'))
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === 'ios/AuthManager.swift') return Promise.resolve(CLEAN_AUTH_SWIFT)
      return Promise.resolve(PASSING_JUNIT)
    })
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
      baasContext,
    })

    expect(result.baasIntegration).toBeDefined()
    expect(result.baasIntegration!.allPassed).toBe(true)
    expect(result.baasIntegration!.violations).toHaveLength(0)
  })

  it('PIPE-01 backward-compat: returns no baasIntegration field when baasContext is absent', async () => {
    const runner = mockRunnerBase()
    runner.exec = mockExec()
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(mockGlob())
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(PASSING_JUNIT)
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
      // no baasContext
    })

    expect(result.baasIntegration).toBeUndefined()
    expect(result.baasParity).toBeUndefined()
  })

  it('PIPE-03: BaaS validation completes in under 2000ms', async () => {
    const runner = mockRunnerBase()
    runner.exec = mockExec()
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(mockGlob('ios/AuthManager.swift'))
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === 'ios/AuthManager.swift') return Promise.resolve(DUMMY_AUTH_SWIFT)
      return Promise.resolve(PASSING_JUNIT)
    })
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
      baasContext,
    })

    expect(result.baasIntegration).toBeDefined()
    expect(result.baasIntegration!.duration).toBeLessThan(2000)
  })
})
