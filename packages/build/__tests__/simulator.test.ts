import { describe, it, expect, vi } from 'vitest'
import { findBestSimulator, findOrBootBestSimulator } from '../src/simulator.js'
import type { Runner, ExecResult } from '@appifex/core'

function mockRunner(simctlOutput: object): Runner {
  return {
    exec: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('booted')) {
        return Promise.resolve({
          exitCode: 0, stdout: JSON.stringify({ devices: {} }), stderr: '', duration: 50,
        } as ExecResult)
      }
      if (args.includes('available')) {
        return Promise.resolve({
          exitCode: 0, stdout: JSON.stringify(simctlOutput), stderr: '', duration: 50,
        } as ExecResult)
      }
      // boot command
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', duration: 50 } as ExecResult)
    }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: { hasMaestro: false, hasXcode: true, hasNode: true, hasSemgrep: false, platform: 'darwin' },
  }
}

const MULTI_RUNTIME_DEVICES = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
      { name: 'iPhone 15 Pro', udid: 'uuid-15pro', isAvailable: true },
      { name: 'iPhone 15', udid: 'uuid-15', isAvailable: true },
      { name: 'iPhone SE (3rd generation)', udid: 'uuid-se', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-18-1': [
      { name: 'iPhone 16 Pro', udid: 'uuid-16pro', isAvailable: true },
      { name: 'iPhone 16 Pro Max', udid: 'uuid-16promax', isAvailable: true },
      { name: 'iPhone 16', udid: 'uuid-16', isAvailable: true },
      { name: 'iPhone SE (3rd generation)', udid: 'uuid-se18', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [
      { name: 'iPhone 17 Pro', udid: 'uuid-17pro', isAvailable: true },
      { name: 'iPhone 17 Pro Max', udid: 'uuid-17promax', isAvailable: true },
      { name: 'iPhone 17', udid: 'uuid-17', isAvailable: true },
      { name: 'iPhone Air', udid: 'uuid-air', isAvailable: true },
      { name: 'iPhone 16e', udid: 'uuid-16e', isAvailable: true },
    ],
    'com.apple.CoreSimulator.SimRuntime.tvOS-18-0': [
      { name: 'Apple TV', udid: 'uuid-tv', isAvailable: true },
    ],
  },
}

describe('findBestSimulator', () => {
  it('picks the latest iOS runtime and best iPhone model', async () => {
    const runner = mockRunner(MULTI_RUNTIME_DEVICES)
    const result = await findBestSimulator(runner)

    expect(result).not.toBeNull()
    expect(result!.runtime).toContain('iOS-26-2')
    expect(result!.name).toBe('iPhone 17 Pro')
    expect(result!.udid).toBe('uuid-17pro')
  })

  it('prefers Pro over Pro Max (standard screen size)', async () => {
    const runner = mockRunner({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-1': [
          { name: 'iPhone 16 Pro Max', udid: 'uuid-promax', isAvailable: true },
          { name: 'iPhone 16 Pro', udid: 'uuid-pro', isAvailable: true },
        ],
      },
    })

    const result = await findBestSimulator(runner)
    expect(result!.name).toBe('iPhone 16 Pro')
  })

  it('prefers regular over SE', async () => {
    const runner = mockRunner({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-1': [
          { name: 'iPhone SE (3rd generation)', udid: 'uuid-se', isAvailable: true },
          { name: 'iPhone 16', udid: 'uuid-16', isAvailable: true },
        ],
      },
    })

    const result = await findBestSimulator(runner)
    expect(result!.name).toBe('iPhone 16')
  })

  it('skips non-iOS runtimes', async () => {
    const runner = mockRunner({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.tvOS-18-0': [
          { name: 'Apple TV', udid: 'uuid-tv', isAvailable: true },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-18-1': [
          { name: 'iPhone 16', udid: 'uuid-16', isAvailable: true },
        ],
      },
    })

    const result = await findBestSimulator(runner)
    expect(result!.name).toBe('iPhone 16')
    expect(result!.runtime).toContain('iOS')
  })

  it('skips unavailable devices', async () => {
    const runner = mockRunner({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-1': [
          { name: 'iPhone 16 Pro', udid: 'uuid-16pro', isAvailable: false },
          { name: 'iPhone 16', udid: 'uuid-16', isAvailable: true },
        ],
      },
    })

    const result = await findBestSimulator(runner)
    expect(result!.name).toBe('iPhone 16')
  })

  it('returns null when no simulators available', async () => {
    const runner = mockRunner({ devices: {} })
    const result = await findBestSimulator(runner)
    expect(result).toBeNull()
  })
})

describe('findOrBootBestSimulator', () => {
  it('returns already-booted simulator if available', async () => {
    const runner = {
      ...mockRunner(MULTI_RUNTIME_DEVICES),
      exec: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
        if (args.includes('booted')) {
          return Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({
              devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [
                  { name: 'iPhone 17 Pro', udid: 'uuid-17pro-booted', isAvailable: true, state: 'Booted' },
                ],
              },
            }),
            stderr: '', duration: 50,
          } as ExecResult)
        }
        return Promise.resolve({ exitCode: 0, stdout: '{}', stderr: '', duration: 50 } as ExecResult)
      }),
    } as unknown as Runner

    const result = await findOrBootBestSimulator(runner)
    expect(result).toBe('uuid-17pro-booted')
  })

  it('boots best simulator when none are booted', async () => {
    const runner = mockRunner(MULTI_RUNTIME_DEVICES)
    const result = await findOrBootBestSimulator(runner)

    expect(result).toBe('uuid-17pro')
    // Should have called boot
    expect(runner.exec).toHaveBeenCalledWith('xcrun', ['simctl', 'boot', 'uuid-17pro'])
  })
})
