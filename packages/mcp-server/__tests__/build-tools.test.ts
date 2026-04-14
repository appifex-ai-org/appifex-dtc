import { describe, it, expect, vi } from 'vitest'
import { handleBuild } from '../src/tools/build.js'
import type { Runner } from '@appifex/core'

function mockRunner(overrides: Partial<Runner> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: false,
      hasXcode: true,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
    ...overrides,
  }
}

describe('dtc_build handler', () => {
  it('calls buildSwift for swiftui platform', async () => {
    const runner = mockRunner()
    const result = await handleBuild(
      {
        platform: 'swiftui',
        projectDir: '/tmp/test-app',
        scheme: 'TestApp',
      },
      runner,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed).toHaveProperty('success')
    expect(parsed).toHaveProperty('duration')
  })

  it('calls buildKotlin for kotlin-compose platform', async () => {
    const runner = mockRunner()
    const result = await handleBuild(
      {
        platform: 'kotlin-compose',
        projectDir: '/tmp/test-app',
      },
      runner,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed).toHaveProperty('success')
    expect(parsed).toHaveProperty('duration')
  })

  it('returns isError true when build fails', async () => {
    const runner = mockRunner({
      exec: vi
        .fn()
        .mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'build error', duration: 500 }),
    })
    const result = await handleBuild(
      {
        platform: 'kotlin-compose',
        projectDir: '/tmp/test-app',
      },
      runner,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed.success).toBe(false)
    expect(result.isError).toBe(true)
  })
})
