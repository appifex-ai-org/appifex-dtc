import { describe, it, expect, vi } from 'vitest'
import type { Runner } from '@appifex/core'
import { patchProjectDependencies, patchBuildGradle } from '../src/index.js'

// ── Minimal mock Runner ──

function createMockRunner(files: Record<string, string> = {}): Runner & {
  _files: Record<string, string>
} {
  const fs: Record<string, string> = { ...files }
  return {
    _files: fs,
    readFile: vi.fn(async (path: string) => {
      if (!(path in fs)) throw new Error(`File not found: ${path}`)
      return fs[path]
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      fs[path] = content
    }),
    exists: vi.fn(async (path: string) => path in fs),
    exec: vi.fn(),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  }
}

// Minimal project.yml for testing (matches DEFAULT_PROJECT_YML structure)
const MINIMAL_PROJECT_YML = `name: App
options:
  bundleIdPrefix: com.dtc
  deploymentTarget:
    iOS: "17.0"
  xcodeVersion: "16.0"
settings:
  SWIFT_VERSION: "6.0"
targets:
  App:
    type: application
    platform: iOS
    sources:
      - path: Sources
    settings:
      INFOPLIST_KEY_UIApplicationSceneManifest_Generation: YES
  AppTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: Tests
    dependencies:
      - target: App
`

// Minimal app/build.gradle.kts for testing
const MINIMAL_APP_GRADLE = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.dtc.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.dtc.app"
        minSdk = 26
        targetSdk = 35
    }
    buildFeatures { compose = true }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.01.01"))
    implementation("androidx.compose.material3:material3")
}
`

// Minimal root build.gradle.kts for testing
const MINIMAL_ROOT_GRADLE = `plugins {
    id("com.android.application") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
}
`

// ── patchProjectDependencies tests ──

describe('patchProjectDependencies', () => {
  it('Test 1: inserts firebase-ios-sdk URL into project.yml for firebase provider', async () => {
    const runner = createMockRunner({
      '/proj/project.yml': MINIMAL_PROJECT_YML,
    })

    await patchProjectDependencies(runner, '/proj', 'firebase')

    const written = runner._files['/proj/project.yml']
    expect(written).toContain('packages:')
    expect(written).toContain('https://github.com/firebase/firebase-ios-sdk.git')
  })

  it('Test 2: inserts FirebaseFirestore and FirebaseAuth as target dependencies for firebase', async () => {
    const runner = createMockRunner({
      '/proj/project.yml': MINIMAL_PROJECT_YML,
    })

    await patchProjectDependencies(runner, '/proj', 'firebase')

    const written = runner._files['/proj/project.yml']
    expect(written).toContain('FirebaseFirestore')
    expect(written).toContain('FirebaseAuth')
  })

  it('Test 3: inserts supabase-swift URL for supabase provider', async () => {
    const runner = createMockRunner({
      '/proj/project.yml': MINIMAL_PROJECT_YML,
    })

    await patchProjectDependencies(runner, '/proj', 'supabase')

    const written = runner._files['/proj/project.yml']
    expect(written).toContain('packages:')
    expect(written).toContain('https://github.com/supabase/supabase-swift.git')
  })

  it('Test 4: is idempotent — calling twice does not double-insert packages: block', async () => {
    const runner = createMockRunner({
      '/proj/project.yml': MINIMAL_PROJECT_YML,
    })

    await patchProjectDependencies(runner, '/proj', 'firebase')
    const afterFirst = runner._files['/proj/project.yml']
    const firstCount = (afterFirst.match(/packages:/g) ?? []).length

    await patchProjectDependencies(runner, '/proj', 'firebase')
    const afterSecond = runner._files['/proj/project.yml']
    const secondCount = (afterSecond.match(/packages:/g) ?? []).length

    expect(firstCount).toBe(1)
    expect(secondCount).toBe(1)
  })

  it('Test 5: preserves existing project.yml content (name, options, targets)', async () => {
    const runner = createMockRunner({
      '/proj/project.yml': MINIMAL_PROJECT_YML,
    })

    await patchProjectDependencies(runner, '/proj', 'firebase')

    const written = runner._files['/proj/project.yml']
    expect(written).toContain('name: App')
    expect(written).toContain('bundleIdPrefix: com.dtc')
    expect(written).toContain('targets:')
    expect(written).toContain('AppTests:')
  })
})

// ── patchBuildGradle tests ──

describe('patchBuildGradle', () => {
  it('Test 6: inserts firebase-bom platform dependency for firebase provider', async () => {
    const runner = createMockRunner({
      '/proj/build.gradle.kts': MINIMAL_ROOT_GRADLE,
      '/proj/app/build.gradle.kts': MINIMAL_APP_GRADLE,
    })

    await patchBuildGradle(runner, '/proj', 'firebase')

    const written = runner._files['/proj/app/build.gradle.kts']
    expect(written).toContain('firebase-bom')
    expect(written).toContain('firebase-firestore')
    expect(written).toContain('firebase-auth')
  })

  it('Test 7: adds google-services plugin to root build.gradle.kts for firebase', async () => {
    const runner = createMockRunner({
      '/proj/build.gradle.kts': MINIMAL_ROOT_GRADLE,
      '/proj/app/build.gradle.kts': MINIMAL_APP_GRADLE,
    })

    await patchBuildGradle(runner, '/proj', 'firebase')

    const rootWritten = runner._files['/proj/build.gradle.kts']
    expect(rootWritten).toContain('google-services')
  })

  it('Test 8: is idempotent — calling twice does not double-insert firebase-bom', async () => {
    const runner = createMockRunner({
      '/proj/build.gradle.kts': MINIMAL_ROOT_GRADLE,
      '/proj/app/build.gradle.kts': MINIMAL_APP_GRADLE,
    })

    await patchBuildGradle(runner, '/proj', 'firebase')
    const afterFirst = runner._files['/proj/app/build.gradle.kts']
    const firstCount = (afterFirst.match(/firebase-bom/g) ?? []).length

    await patchBuildGradle(runner, '/proj', 'firebase')
    const afterSecond = runner._files['/proj/app/build.gradle.kts']
    const secondCount = (afterSecond.match(/firebase-bom/g) ?? []).length

    expect(firstCount).toBe(1)
    expect(secondCount).toBe(1)
  })
})
