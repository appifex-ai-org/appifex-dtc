import { describe, it, expect, vi } from 'vitest'
import { bundleKotlin } from '../src/kotlin.js'
import type { Runner } from '@appifex/core'

function mockRunner(overrides: Partial<Runner> = {}): Runner {
  return {
    exec: vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000, command: 'mock' }),
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

const BUNDLE_OPTS = {
  projectDir: '/tmp/test-app',
  keystorePath: '/keys/release.jks',
  keystorePassword: 'pass123',
  keyAlias: 'release',
  keyPassword: 'keypass',
}

describe('bundleKotlin', () => {
  it('runs gradlew bundleRelease and returns success with aabPath', async () => {
    const exec = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      duration: 5000,
      command: './gradlew bundleRelease --no-daemon',
    })
    const glob = vi
      .fn()
      .mockResolvedValue(['/tmp/test-app/app/build/outputs/bundle/release/app-release.aab'])
    const runner = mockRunner({ exec, glob, exists: vi.fn().mockResolvedValue(true) })

    const result = await bundleKotlin(runner, BUNDLE_OPTS)

    expect(result.success).toBe(true)
    expect(result.aabPath).toBe('/tmp/test-app/app/build/outputs/bundle/release/app-release.aab')
    expect(result.duration).toBeGreaterThanOrEqual(0)
    // Should have called gradlew bundleRelease
    const gradleCall = exec.mock.calls.find((c: unknown[]) => c[1]?.[0] === 'bundleRelease')
    expect(gradleCall).toBeTruthy()
  })

  it('injects signing config into build.gradle.kts when missing', async () => {
    const existingGradle = `plugins {
    id("com.android.application")
}

android {
    namespace = "com.dtc.app"
    compileSdk = 35
}`
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const readFile = vi.fn().mockResolvedValue(existingGradle)
    const exec = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000, command: 'mock' })
    const glob = vi
      .fn()
      .mockResolvedValue(['/tmp/test-app/app/build/outputs/bundle/release/app-release.aab'])
    const runner = mockRunner({
      writeFile,
      readFile,
      exec,
      glob,
      exists: vi.fn().mockResolvedValue(true),
    })

    await bundleKotlin(runner, BUNDLE_OPTS)

    // build.gradle.kts should use property references (no plaintext secrets)
    const signingWrite = writeFile.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('build.gradle.kts') &&
        typeof c[1] === 'string' &&
        c[1].includes('signingConfigs'),
    )
    expect(signingWrite).toBeTruthy()
    expect(signingWrite[1]).toContain('project.property("RELEASE_STORE_FILE")')
    expect(signingWrite[1]).toContain('project.property("RELEASE_KEY_ALIAS")')
    expect(signingWrite[1]).not.toContain('release.jks') // no plaintext secrets

    // gradle.properties should have the actual credentials
    const propsWrite = writeFile.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('gradle.properties') &&
        typeof c[1] === 'string' &&
        c[1].includes('RELEASE_STORE_FILE'),
    )
    expect(propsWrite).toBeTruthy()
    expect(propsWrite[1]).toContain('release.jks')
    expect(propsWrite[1]).toContain('keypass')
  })

  it('does not inject signing config if already present', async () => {
    const existingGradle = `android {
    signingConfigs {
        create("release") { /* already configured */ }
    }
}`
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const readFile = vi.fn().mockResolvedValue(existingGradle)
    const exec = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000, command: 'mock' })
    const glob = vi
      .fn()
      .mockResolvedValue(['/tmp/test-app/app/build/outputs/bundle/release/app-release.aab'])
    const runner = mockRunner({
      writeFile,
      readFile,
      exec,
      glob,
      exists: vi.fn().mockResolvedValue(true),
    })

    await bundleKotlin(runner, BUNDLE_OPTS)

    const signingWrite = writeFile.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('build.gradle.kts') &&
        typeof c[1] === 'string' &&
        c[1].includes('signingConfigs'),
    )
    expect(signingWrite).toBeUndefined()
  })

  it('cleans up secrets after build', async () => {
    const existingGradle = `plugins {
    id("com.android.application")
}

android {
    namespace = "com.dtc.app"
    compileSdk = 35
}`
    const existingProps = 'org.gradle.jvmargs=-Xmx2g\n'
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const readFile = vi.fn().mockImplementation((path: string) => {
      if (path.includes('gradle.properties')) return Promise.resolve(existingProps)
      return Promise.resolve(existingGradle)
    })
    const exec = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000, command: 'mock' })
    const glob = vi
      .fn()
      .mockResolvedValue(['/tmp/test-app/app/build/outputs/bundle/release/app-release.aab'])
    const runner = mockRunner({
      writeFile,
      readFile,
      exec,
      glob,
      exists: vi.fn().mockResolvedValue(true),
    })

    await bundleKotlin(runner, BUNDLE_OPTS)

    // Last write to build.gradle.kts should restore the original (no signingConfigs)
    const gradleWrites = writeFile.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('build.gradle.kts'),
    )
    const lastGradleWrite = gradleWrites[gradleWrites.length - 1]
    expect(lastGradleWrite[1]).toBe(existingGradle)

    // Last write to gradle.properties should restore original (no RELEASE_ keys)
    const propsWrites = writeFile.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('gradle.properties'),
    )
    const lastPropsWrite = propsWrites[propsWrites.length - 1]
    expect(lastPropsWrite[1]).toBe(existingProps)
  })

  it('returns failure on non-zero exit code', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        duration: 100,
        command: 'chmod',
      }) // chmod
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'FAILURE: Build failed',
        duration: 3000,
        command: './gradlew bundleRelease',
      })
    const runner = mockRunner({ exec, exists: vi.fn().mockResolvedValue(true) })

    const result = await bundleKotlin(runner, BUNDLE_OPTS)

    expect(result.success).toBe(false)
    expect(result.error).toContain('FAILURE')
  })

  it('returns failure when no .aab found after build', async () => {
    const exec = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'BUILD SUCCESSFUL',
      stderr: '',
      duration: 5000,
      command: 'mock',
    })
    const glob = vi.fn().mockResolvedValue([]) // no AAB found
    const runner = mockRunner({ exec, glob, exists: vi.fn().mockResolvedValue(true) })

    const result = await bundleKotlin(runner, BUNDLE_OPTS)

    expect(result.success).toBe(false)
    expect(result.error).toContain('no .aab found')
  })
})
