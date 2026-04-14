import type { Runner } from '@appifex/core'
import type { BundleOpts, BundleResult } from './types.js'
import {
  parseKotlinErrors,
  DEFAULT_SETTINGS_GRADLE,
  DEFAULT_ROOT_BUILD_GRADLE,
  buildGradle,
  mainActivity,
} from './kotlin.js'

/**
 * Build a release AAB (Android App Bundle) with signing for Play Console distribution.
 *
 * Flow: ensure Gradle structure → inject signing config → ./gradlew bundleRelease → .aab
 */
export async function bundleKotlin(runner: Runner, opts: BundleOpts): Promise<BundleResult> {
  const startTime = Date.now()
  const projectDir = opts.projectDir
  const appId = opts.applicationId ?? 'com.dtc.app'
  const appIdPath = appId.replace(/\./g, '/')
  const commands: string[] = []

  // Ensure Gradle project structure exists (same scaffolding as buildKotlin)
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

  // Inject signing config into app/build.gradle.kts using property references (no plaintext secrets)
  const appBuildGradle = `${projectDir}/app/build.gradle.kts`
  let originalBuildGradle: string | undefined
  if (await runner.exists(appBuildGradle)) {
    const content = await runner.readFile(appBuildGradle)
    if (!content.includes('signingConfigs')) {
      originalBuildGradle = content
      // Add signingConfigs block inside android {}
      const signingConfigBlock = [
        '    signingConfigs {',
        '        create("release") {',
        '            storeFile = file(project.property("RELEASE_STORE_FILE") as String)',
        '            storePassword = project.property("RELEASE_STORE_PASSWORD") as String',
        '            keyAlias = project.property("RELEASE_KEY_ALIAS") as String',
        '            keyPassword = project.property("RELEASE_KEY_PASSWORD") as String',
        '        }',
        '    }',
      ].join('\n')
      let patched = content.replace(/android\s*\{/, `android {\n${signingConfigBlock}`)

      // Wire signing config into release build type
      if (patched.includes('buildTypes')) {
        // Add signingConfig to existing release block
        patched = patched.replace(
          /release\s*\{/,
          'release {\n            signingConfig = signingConfigs.getByName("release")',
        )
      } else {
        // No buildTypes block — add one
        const buildTypesBlock = [
          '    buildTypes {',
          '        getByName("release") {',
          '            signingConfig = signingConfigs.getByName("release")',
          '            isMinifyEnabled = false',
          '        }',
          '    }',
        ].join('\n')
        patched = patched.replace(signingConfigBlock, signingConfigBlock + '\n' + buildTypesBlock)
      }
      await runner.writeFile(appBuildGradle, patched)
    }
  }

  // Write signing credentials to gradle.properties (temporary, cleaned up after build)
  const gradlePropsPath = `${projectDir}/gradle.properties`
  const existingProps = (await runner.exists(gradlePropsPath))
    ? await runner.readFile(gradlePropsPath)
    : ''
  const signingProps = [
    '',
    '# DTC signing config (temporary — removed after build)',
    `RELEASE_STORE_FILE=${opts.keystorePath}`,
    `RELEASE_STORE_PASSWORD=${opts.keystorePassword}`,
    `RELEASE_KEY_ALIAS=${opts.keyAlias}`,
    `RELEASE_KEY_PASSWORD=${opts.keyPassword || opts.keystorePassword}`,
  ].join('\n')
  await runner.writeFile(gradlePropsPath, existingProps + signingProps)

  // Build release AAB
  const gradlew = (await runner.exists(`${projectDir}/gradlew`)) ? './gradlew' : 'gradle'
  let result: Awaited<ReturnType<typeof runner.exec>> | undefined
  try {
    result = await runner.exec(gradlew, ['bundleRelease', '--no-daemon'], {
      cwd: projectDir,
      timeout: 600_000,
    })
    commands.push(result.command)
  } finally {
    // Always restore — even if exec throws, to avoid leaving credentials on disk
    if (originalBuildGradle) {
      await runner.writeFile(appBuildGradle, originalBuildGradle)
    }
    await runner.writeFile(gradlePropsPath, existingProps)
  }

  if (result!.exitCode !== 0) {
    const errors = parseKotlinErrors(result!.stdout + '\n' + result!.stderr)
    const errorSummary =
      errors.length > 0
        ? errors.map((e) => `${e.file}:${e.line}: ${e.message}`).join('\n')
        : result!.stderr
            .split('\n')
            .filter((l) => l.includes('error:') || l.includes('FAILURE'))
            .join('\n') || result!.stderr.slice(-500)
    return { success: false, error: errorSummary, duration: Date.now() - startTime, commands }
  }

  // Find the output .aab
  const aabs = await runner.glob(`${projectDir}/app/build/outputs/bundle/release/*.aab`)
  if (aabs.length === 0) {
    return {
      success: false,
      error: 'Build succeeded but no .aab found in output',
      duration: Date.now() - startTime,
      commands,
    }
  }

  return { success: true, aabPath: aabs[0], duration: Date.now() - startTime, commands }
}
