import type { Runner, BaasProvider } from '@appifex/core'
import type { BuildOpts, BuildResult, BuildError } from './types.js'

export interface KotlinBuildOpts extends BuildOpts {
  /** Application ID (defaults to com.dtc.app) */
  applicationId?: string
}

export const DEFAULT_SETTINGS_GRADLE = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    @Suppress("UnstableApiUsage")
    repositoriesMode.set(org.gradle.api.initialization.resolve.RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "dtc-app"
include(":app")
`

export const DEFAULT_ROOT_BUILD_GRADLE = `plugins {
    id("com.android.application") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.20" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
}
`

export function buildGradle(appId: string) {
  return `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${appId}"
    compileSdk = 35
    defaultConfig {
        applicationId = "${appId}"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { compose = true }
    kotlinOptions { jvmTarget = "17" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.01.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.navigation:navigation-compose:2.9.7")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
`
}

export function mainActivity(appId: string) {
  return `package ${appId}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier.semantics { testTagsAsResourceId = true }
            ) {
                MainScreen()
            }
        }
    }
}
`
}

export async function patchBuildGradle(
  runner: Runner,
  projectDir: string,
  provider: BaasProvider,
): Promise<void> {
  // 1. Patch root build.gradle.kts — add google-services plugin for Firebase
  const rootGradlePath = `${projectDir}/build.gradle.kts`
  if (await runner.exists(rootGradlePath)) {
    const rootGradle = await runner.readFile(rootGradlePath)
    if (provider === 'firebase' && !rootGradle.includes('google-services')) {
      const patched = rootGradle.replace(
        /(id\("org\.jetbrains\.kotlin\.plugin\.compose"\)[^\n]*\n)/,
        `$1    id("com.google.gms.google-services") version "4.4.2" apply false\n`,
      )
      await runner.writeFile(rootGradlePath, patched)
    }
  }

  // 2. Patch app/build.gradle.kts — add BaaS dependencies
  const appGradlePath = `${projectDir}/app/build.gradle.kts`
  if (!(await runner.exists(appGradlePath))) return

  let appGradle = await runner.readFile(appGradlePath)

  if (provider === 'firebase') {
    if (appGradle.includes('firebase-bom')) return // idempotency guard

    // Add google-services plugin to app plugins block
    if (!appGradle.includes('google-services')) {
      appGradle = appGradle.replace(
        /(id\("org\.jetbrains\.kotlin\.plugin\.compose"\)\s*\n)/,
        `$1    id("com.google.gms.google-services")\n`,
      )
    }

    // Add Firebase BOM + deps inside dependencies block
    const firebaseDeps = `    implementation(platform("com.google.firebase:firebase-bom:34.0.0"))
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-auth")`

    appGradle = appGradle.replace(
      /(dependencies\s*\{)([\s\S]*?)(\n\})/m,
      `$1$2\n${firebaseDeps}\n$3`,
    )
  } else {
    if (appGradle.includes('supabase:bom')) return // idempotency guard

    const supabaseDeps = `    implementation(platform("io.github.jan-tennert.supabase:bom:3.0.0"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:auth-kt")`

    appGradle = appGradle.replace(
      /(dependencies\s*\{)([\s\S]*?)(\n\})/m,
      `$1$2\n${supabaseDeps}\n$3`,
    )
  }

  await runner.writeFile(appGradlePath, appGradle)
}

export async function buildKotlin(runner: Runner, opts: KotlinBuildOpts): Promise<BuildResult> {
  const startTime = Date.now()
  const projectDir = opts.projectDir
  const appId = opts.applicationId ?? 'com.dtc.app'
  const appIdPath = appId.replace(/\./g, '/')

  // Ensure Gradle project structure exists
  if (!(await runner.exists(`${projectDir}/settings.gradle.kts`))) {
    await runner.writeFile(`${projectDir}/settings.gradle.kts`, DEFAULT_SETTINGS_GRADLE)
  }
  if (!(await runner.exists(`${projectDir}/build.gradle.kts`))) {
    await runner.writeFile(`${projectDir}/build.gradle.kts`, DEFAULT_ROOT_BUILD_GRADLE)
  }
  if (!(await runner.exists(`${projectDir}/app/build.gradle.kts`))) {
    const { mkdir } = await import('node:fs/promises')
    try {
      await mkdir(`${projectDir}/app`, { recursive: true })
    } catch {
      /* may exist */
    }
    await runner.writeFile(`${projectDir}/app/build.gradle.kts`, buildGradle(appId))
  }

  // Ensure MainActivity exists (check anywhere in source tree, not just applicationId path)
  const existingActivities = await runner.glob(`${projectDir}/app/src/main/java/**/MainActivity.kt`)
  if (existingActivities.length === 0) {
    const mainActivityPath = `${projectDir}/app/src/main/java/${appIdPath}/MainActivity.kt`
    const { mkdir: mkdirFs } = await import('node:fs/promises')
    try {
      await mkdirFs(`${projectDir}/app/src/main/java/${appIdPath}`, { recursive: true })
    } catch {
      /* may exist */
    }
    await runner.writeFile(mainActivityPath, mainActivity(appId))
  }

  // Ensure gradlew is executable
  if (await runner.exists(`${projectDir}/gradlew`)) {
    await runner.exec('chmod', ['+x', `${projectDir}/gradlew`])
  }

  // Run Gradle assembleDebug
  const gradlew = (await runner.exists(`${projectDir}/gradlew`)) ? './gradlew' : 'gradle'
  const result = await runner.exec(gradlew, ['assembleDebug', '--no-daemon'], {
    cwd: projectDir,
    timeout: 300_000, // 5 minutes
  })

  if (result.exitCode !== 0) {
    const errors = parseKotlinErrors(result.stdout + '\n' + result.stderr)
    const errorSummary =
      errors.length > 0
        ? errors.map((e) => `${e.file}:${e.line}: ${e.message}`).join('\n')
        : result.stderr
            .split('\n')
            .filter((l) => l.includes('error:') || l.includes('FAILURE'))
            .join('\n') || result.stderr.slice(-500)

    return { success: false, error: errorSummary, errors, duration: Date.now() - startTime }
  }

  return { success: true, duration: Date.now() - startTime }
}

export function parseKotlinErrors(output: string): BuildError[] {
  const errors: BuildError[] = []
  const regex = /(.+\.kt):(\d+):\d+: error: (.+)/g
  let match
  while ((match = regex.exec(output)) !== null) {
    errors.push({ file: match[1], line: parseInt(match[2], 10), message: match[3] })
  }
  return errors
}

export { bundleKotlin } from './kotlin-bundle.js'
