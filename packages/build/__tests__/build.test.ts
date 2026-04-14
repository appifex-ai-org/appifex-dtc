import { describe, it, expect, vi } from 'vitest'
import { buildSwift, type BuildResult } from '../src/index.js'
import type { Runner, ExecResult } from '@appifex/core'

function mockRunner(overrides: Partial<{ exec: unknown }> = {}): Runner {
  return {
    exec: vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'BUILD SUCCEEDED', stderr: '', duration: 5000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: true,
      hasXcode: true,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
    ...overrides,
  }
}

describe('buildSwift', () => {
  function swiftRunner(
    xcodebuildResult: Partial<{ exitCode: number; stdout: string; stderr: string }> = {},
  ) {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: '',
        duration: 50,
        command: 'xcrun simctl list',
      }) // findBestSimulator → xcrun simctl (fail = use fallback)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        duration: 50,
        command: 'rm -rf',
      }) // clean intermediates
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        duration: 500,
        command: 'xcodegen',
      }) // xcodegen
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'BUILD SUCCEEDED',
        stderr: '',
        duration: 10000,
        command: 'xcodebuild',
        ...xcodebuildResult,
      }) // xcodebuild
    const runner = mockRunner({ exec })
    // Sources exists, app entry exists, no project.yml
    ;(runner.exists as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
      if (path.includes('project.yml')) return false
      return true
    })
    // glob: xcodeproj always found (after xcodegen), app entry found, no test files
    ;(runner.glob as ReturnType<typeof vi.fn>).mockImplementation(async (pattern: string) => {
      if (pattern.includes('xcodeproj')) return ['/app/App.xcodeproj']
      if (pattern.includes('*App*')) return ['/app/Sources/AppEntry.swift']
      return []
    })
    return { runner, exec }
  }

  it('runs xcodegen then xcodebuild for the project', async () => {
    const { runner, exec } = swiftRunner()

    const result = await buildSwift(runner, { projectDir: '/app', scheme: 'PetApp' })

    expect(result.success).toBe(true)
    const cmds = exec.mock.calls.map((c: unknown[]) => c[0])
    expect(cmds).toContain('xcodegen')
    expect(cmds).toContain('xcodebuild')
    const xcodebuildCall = exec.mock.calls.find((c: unknown[]) => c[0] === 'xcodebuild')
    expect(xcodebuildCall[1]).toEqual(expect.arrayContaining(['-scheme', 'PetApp']))
  })

  it('uses simulator destination by default', async () => {
    const { runner, exec } = swiftRunner()

    await buildSwift(runner, { projectDir: '/app', scheme: 'App' })

    const xcodebuildCall = exec.mock.calls.find((c: unknown[]) => c[0] === 'xcodebuild')
    const args = xcodebuildCall[1] as string[]
    expect(args.join(' ')).toContain('platform=iOS Simulator')
  })

  it('returns failure when xcodebuild fails', async () => {
    const { runner } = swiftRunner({ exitCode: 65, stderr: 'CompileError' })

    const result = await buildSwift(runner, { projectDir: '/app', scheme: 'App' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('CompileError')
  })
})
