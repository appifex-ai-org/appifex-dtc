import { describe, it, expect, vi } from 'vitest'
import { validateAll } from '../src/index.js'
import type { Runner } from '@appifex/core'

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
    readFile: vi.fn().mockResolvedValue(PASSING_JUNIT),
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

describe('validateAll mock-check integration', () => {
  it('PIPE-04: calls checkMockLayer when mockContext is present', async () => {
    const runner = mockRunnerBase()
    runner.exec = mockExec()
    ;(runner.glob as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
      mockContext: {},
    })
    expect(result.mockLayer).toBeDefined()
    expect(result.mockParity).toBeDefined()
  })

  it('PIPE-04 backward-compat: no mockLayer field when mockContext absent', async () => {
    const runner = mockRunnerBase()
    runner.exec = mockExec()
    ;(runner.glob as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(runner.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await validateAll(runner, {
      platform: 'swiftui',
      projectDir: '/app',
      flowDir: '.maestro/',
      testDir: 'Tests/',
      reportDir: '/tmp/report',
      // no mockContext
    })
    expect(result.mockLayer).toBeUndefined()
    expect(result.mockParity).toBeUndefined()
  })
})
