import { describe, it, expect, vi } from 'vitest'
import { runMaestro, runUnitTests, validateAll } from '../src/index.js'
import type { Runner } from '@appifex/core'

function mockRunner(overrides: Partial<{ exec: unknown }> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: { hasMaestro: true, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'linux' },
    ...overrides,
  }
}

const PASSING_JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="3" failures="0">
  <testsuite name="browse-pets" tests="2" failures="0">
    <testcase name="assertVisible_searchBar" time="0.5"/>
    <testcase name="assertVisible_petGrid" time="0.3"/>
  </testsuite>
  <testsuite name="pet-detail" tests="1" failures="0">
    <testcase name="assertVisible_petImage" time="0.4"/>
  </testsuite>
</testsuites>`

const FAILING_JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="3" failures="1">
  <testsuite name="browse-pets" tests="2" failures="1">
    <testcase name="assertVisible_searchBar" time="0.5"/>
    <testcase name="assertVisible_petGrid" time="0.3">
      <failure message="Element not found">petGrid not visible after 5s</failure>
    </testcase>
  </testsuite>
  <testsuite name="pet-detail" tests="1" failures="0">
    <testcase name="assertVisible_petImage" time="0.4"/>
  </testsuite>
</testsuites>`

/** Helper: create a mock exec that handles common maestro/xcode commands */
function maestroExec(overrides: Record<string, { exitCode: number; stdout: string; stderr: string; duration: number }> = {}) {
  return vi.fn().mockImplementation((cmd: string, args?: string[]) => {
    const key = cmd === 'xcrun' && args?.[0] === 'simctl' && args?.[1] === 'list' ? 'simctl-list'
      : cmd === 'xcrun' && args?.[0] === 'simctl' ? 'simctl'
      : cmd
    if (overrides[key]) return Promise.resolve(overrides[key])
    if (cmd === 'which') return Promise.resolve({ exitCode: 0, stdout: '/usr/local/bin/maestro', stderr: '', duration: 10 })
    if (cmd === 'defaults') return Promise.resolve({ exitCode: 0, stdout: 'com.dtc.App', stderr: '', duration: 10 })
    if (cmd === 'mkdir') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 10 })
    if (cmd === 'xcrun' && args?.[0] === 'simctl' && args?.[1] === 'list') {
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [{ name: 'iPhone 15', udid: 'sim-123', isAvailable: true }] } }), stderr: '', duration: 100 })
    }
    if (cmd === 'xcrun' && args?.[0] === 'simctl') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'xcrun') return Promise.resolve({ exitCode: 1, stdout: '', stderr: '', duration: 100 })
    if (cmd === 'maestro') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 5000 })
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 0 })
  })
}

function maestroGlob() {
  return vi.fn().mockImplementation((pattern: string) => {
    if (pattern.includes('.yaml')) return Promise.resolve(['.maestro/home.yaml'])
    if (pattern.includes('.ips')) return Promise.resolve([])
    if (pattern.includes('Debug-iphonesimulator') || pattern.includes('DerivedData')) return Promise.resolve(['/app/build/Build/Products/Debug-iphonesimulator/App.app'])
    if (pattern.includes('.xml')) return Promise.resolve(['/tmp/maestro-report/maestro-results.xml'])
    return Promise.resolve([])
  })
}

describe('runMaestro', () => {
  it('runs maestro test and parses JUNIT results', async () => {
    const runner = mockRunner({ exec: maestroExec() })
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(PASSING_JUNIT)
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(maestroGlob())

    const result = await runMaestro(runner, {
      flowDir: '.maestro/',
      projectDir: '/app',
      reportDir: '/tmp/maestro-report',
    })

    expect(runner.exec).toHaveBeenCalledWith(
      'maestro',
      expect.arrayContaining(['test']),
      expect.anything(),
    )
    expect(result.total).toBe(3)
    expect(result.passed).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.results).toHaveLength(3)
  })

  it('parses failures from JUNIT XML', async () => {
    const runner = mockRunner({
      exec: maestroExec({
        maestro: { exitCode: 1, stdout: '', stderr: '', duration: 5000 },
      }),
    })
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(FAILING_JUNIT)
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(maestroGlob())

    const result = await runMaestro(runner, {
      flowDir: '.maestro/',
      projectDir: '/app',
      reportDir: '/tmp/maestro-report',
    })

    expect(result.total).toBe(3)
    expect(result.passed).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results.find(r => !r.passed)?.error).toContain('petGrid not visible')
  })

  it('returns empty result when no JUNIT files found', async () => {
    const runner = mockRunner({
      exec: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'maestro not found', duration: 100 }),
    })
    ;(runner.glob as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const result = await runMaestro(runner, {
      flowDir: '.maestro/',
      projectDir: '/app',
      reportDir: '/tmp/report',
    })

    expect(result.total).toBe(0)
    expect(result.error).toBeDefined()
  })
})

describe('runUnitTests', () => {
  it('runs xcodebuild test for swiftui', async () => {
    const exec = vi.fn().mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === 'xcrun' && args?.[0] === 'simctl' && args?.[1] === 'list') {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [{ name: 'iPhone 15', udid: 'sim-123', isAvailable: true }] } }), stderr: '', duration: 100 })
      }
      if (cmd === 'xcodegen') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
      if (cmd === 'rm') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 100 })
      if (cmd === 'xcodebuild') return Promise.resolve({ exitCode: 0, stdout: "Test Case '-[AppTests.T testA]' passed (0.1 seconds).\nTest Case '-[AppTests.T testB]' passed (0.1 seconds).\nTest Case '-[AppTests.T testC]' passed (0.1 seconds).", stderr: '', duration: 5000 })
      if (cmd === 'xcrun') return Promise.resolve({ exitCode: 1, stdout: '', stderr: '', duration: 100 })
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 0 })
    })
    const runner = mockRunner({ exec })
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation((pattern: string) => {
      if (pattern.includes('.swift')) return Promise.resolve(['Tests/TestA.swift'])
      if (pattern.includes('.xcodeproj')) return Promise.resolve(['/app/App.xcodeproj'])
      return Promise.resolve([])
    })
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await runUnitTests(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      testDir: 'Tests/',
      scheme: 'AppTests',
    })

    expect(runner.exec).toHaveBeenCalledWith(
      'xcodebuild',
      expect.arrayContaining(['test']),
      expect.anything(),
    )
    expect(result.total).toBe(3)
    expect(result.passed).toBe(3)
  })
})

describe('validateAll', () => {
  function validateAllGlob() {
    return vi.fn().mockImplementation((pattern: string) => {
      if (pattern.includes('.yaml')) return Promise.resolve(['.maestro/home.yaml'])
      if (pattern.includes('.ips')) return Promise.resolve([])
      if (pattern.includes('Debug-iphonesimulator') || pattern.includes('DerivedData')) return Promise.resolve(['/app/build/Build/Products/Debug-iphonesimulator/App.app'])
      if (pattern.includes('.xml')) return Promise.resolve(['/tmp/report/maestro-results.xml'])
      if (pattern.includes('.swift')) return Promise.resolve(['Tests/Test.swift'])
      if (pattern.includes('.xcodeproj')) return Promise.resolve(['/app/App.xcodeproj'])
      return Promise.resolve([])
    })
  }

  it('combines UI and unit test results', async () => {
    const exec = maestroExec({
      xcodebuild: { exitCode: 0, stdout: "Test Case '-[AppTests.T testA]' passed (0.1 seconds).\nTest Case '-[AppTests.T testB]' passed (0.1 seconds).", stderr: '', duration: 5000 },
    })
    const runner = mockRunner({ exec })
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(PASSING_JUNIT)
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(validateAllGlob())
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
    })

    expect(result.ui.total).toBe(3)
    expect(result.unit.total).toBe(2)
    expect(result.allPassed).toBe(true)
  })

  it('allPassed is false when any test fails', async () => {
    const exec = maestroExec({
      maestro: { exitCode: 1, stdout: '', stderr: '', duration: 5000 },
      xcodebuild: { exitCode: 0, stdout: "Test Case '-[AppTests.T testA]' passed (0.1 seconds).", stderr: '', duration: 5000 },
    })
    const runner = mockRunner({ exec })
    ;(runner.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(FAILING_JUNIT)
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(validateAllGlob())
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
    })

    expect(result.allPassed).toBe(false)
    expect(result.ui.failed).toBe(1)
  })
})
