import { describe, it, expect, vi } from 'vitest'
import { buildKotlin } from '../src/kotlin.js'
import type { Runner } from '@appifex/core'

function mockRunner(overrides: Partial<Runner> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'linux',
    },
    ...overrides,
  }
}

describe('buildKotlin', () => {
  it('runs gradlew assembleDebug and returns success', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: 'BUILD SUCCESSFUL', stderr: '', duration: 5000 })
    const runner = mockRunner({ exec, exists: vi.fn().mockResolvedValue(true) })

    const result = await buildKotlin(runner, { projectDir: '/tmp/test-app' })

    expect(result.success).toBe(true)
    expect(result.duration).toBeGreaterThanOrEqual(0)
    // Should have called gradlew
    const gradleCall = exec.mock.calls.find(
      (c: string[]) => c[0] === './gradlew' || c[1]?.[0] === 'assembleDebug',
    )
    expect(gradleCall).toBeTruthy()
  })

  it('returns failure with parsed errors when build fails', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 100 }) // chmod
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout:
          'app/src/main/java/com/dtc/app/HomeScreen.kt:42:5: error: Unresolved reference: LazyColumn',
        stderr: 'FAILURE',
        duration: 3000,
      })
    const runner = mockRunner({ exec, exists: vi.fn().mockResolvedValue(true) })

    const result = await buildKotlin(runner, { projectDir: '/tmp/test-app' })

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
    expect(result.errors![0].message).toContain('Unresolved reference')
  })

  it('creates build.gradle.kts when missing', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const exists = vi
      .fn()
      .mockResolvedValueOnce(false) // build.gradle.kts
      .mockResolvedValueOnce(false) // MainActivity.kt
      .mockResolvedValueOnce(true) // gradlew
      .mockResolvedValueOnce(true) // gradlew again for exec
    const runner = mockRunner({ exists, writeFile })

    await buildKotlin(runner, { projectDir: '/tmp/test-app' })

    // Should have written build.gradle.kts
    const buildGradleWrite = writeFile.mock.calls.find((c: string[]) =>
      c[0].includes('build.gradle.kts'),
    )
    expect(buildGradleWrite).toBeTruthy()
    expect(buildGradleWrite[1]).toContain('com.android.application')
  })
})
