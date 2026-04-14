import type { Runner, BaasProvider } from '@appifex/core'
import type { SwiftBuildOpts, BuildResult, BuildError } from './types.js'

/** Derive a PascalCase app name from a user prompt. e.g. "Todo app" → "TodoApp", "pet adoption" → "PetAdoption" */
export function deriveAppName(prompt: string): string {
  const cleaned = prompt
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.toLowerCase() !== 'app' && w.toLowerCase() !== 'application')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  if (!cleaned) return 'App'
  // Append "App" if the name doesn't already end with it
  return cleaned.endsWith('App') ? cleaned : cleaned + 'App'
}

export const DEFAULT_PROJECT_YML = `name: App
options:
  bundleIdPrefix: com.dtc
  deploymentTarget:
    iOS: "17.0"
  xcodeVersion: "16.0"
settings:
  SWIFT_VERSION: "6.0"
  GENERATE_INFOPLIST_FILE: YES
  MARKETING_VERSION: "1.0.0"
  CURRENT_PROJECT_VERSION: 1
targets:
  App:
    type: application
    platform: iOS
    sources:
      - path: Sources
        type: group
    settings:
      INFOPLIST_KEY_UIApplicationSceneManifest_Generation: YES
      INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents: YES
      INFOPLIST_KEY_UILaunchScreen_Generation: YES
      INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad: "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"
      INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone: "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"
      INFOPLIST_KEY_CFBundleIconName: AppIcon
      ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
  AppTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: Tests
        type: group
    dependencies:
      - target: App
    settings:
      GENERATE_INFOPLIST_FILE: YES
schemes:
  App:
    build:
      targets:
        App: all
        AppTests: [test]
    test:
      targets:
        - AppTests
`

export const DEFAULT_APP_ENTRY = `import SwiftUI

@main
struct AppEntry: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`

export async function patchProjectDependencies(
  runner: Runner,
  projectDir: string,
  provider: BaasProvider,
): Promise<void> {
  const ymlPath = `${projectDir}/project.yml`
  const yml = await runner.readFile(ymlPath)
  if (yml.includes('packages:')) return // idempotency guard (D-06)

  let packagesBlock: string
  let targetDeps: string

  if (provider === 'firebase') {
    packagesBlock = `packages:
  Firebase:
    url: https://github.com/firebase/firebase-ios-sdk.git
    from: 11.0.0
`
    targetDeps = `      - package: Firebase
        product: FirebaseFirestore
      - package: Firebase
        product: FirebaseAuth`
  } else {
    packagesBlock = `packages:
  Supabase:
    url: https://github.com/supabase/supabase-swift.git
    from: 2.0.0
`
    targetDeps = `      - package: Supabase
        product: Auth
      - package: Supabase
        product: PostgREST`
  }

  // Insert packages block before targets: section
  let patched = yml.replace(/(targets:)/m, packagesBlock + '$1')

  // Insert target dependencies into the first (app) target.
  // Strategy: insert a dependencies block before the *Tests target (always 2-space indented sibling).
  // This works whether or not the app target already has a dependencies key.
  const depsBlock = `    dependencies:\n${targetDeps}`
  patched = patched.replace(/(\n {2}\w+Tests:)/m, `\n${depsBlock}\n$1`)

  await runner.writeFile(ymlPath, patched)
}

async function detectSimulator(runner: Runner): Promise<string> {
  const { findBestSimulator } = await import('./simulator.js')
  const best = await findBestSimulator(runner)
  if (best) return `platform=iOS Simulator,id=${best.udid}`
  // Fallback: generic destination that lets Xcode pick
  return 'generic/platform=iOS Simulator'
}

export async function buildSwift(runner: Runner, opts: SwiftBuildOpts): Promise<BuildResult> {
  const destination = opts.destination ?? (await detectSimulator(runner))
  const projectDir = opts.projectDir

  // Ensure Sources directory exists and has an app entry point
  const hasSourcesDir = await runner.exists(`${projectDir}/Sources`)
  if (!hasSourcesDir) {
    // Move any .swift files into Sources/
    const swiftFiles = await runner.glob(`${projectDir}/*.swift`)
    for (const file of swiftFiles) {
      const name = file.split('/').pop()!
      const content = await runner.readFile(file)
      await runner.writeFile(`${projectDir}/Sources/${name}`, content)
    }
  }

  // Ensure app entry point exists
  const hasAppEntry = await runner.exists(`${projectDir}/Sources/AppEntry.swift`)
  const hasApp = (await runner.glob(`${projectDir}/Sources/*App*.swift`)).length > 0
  if (!hasAppEntry && !hasApp) {
    await runner.writeFile(`${projectDir}/Sources/AppEntry.swift`, DEFAULT_APP_ENTRY)
  }

  // Move test files from __tests__/ to Tests/ (xcodegen convention)
  const testFiles = await runner.glob(`${projectDir}/__tests__/*.swift`)
  if (testFiles.length > 0) {
    for (const file of testFiles) {
      const name = file.split('/').pop()!
      const content = await runner.readFile(file)
      await runner.writeFile(`${projectDir}/Tests/${name}`, content)
    }
  }

  // Generate project.yml if missing, or update if scheme name doesn't match
  const appName = opts.scheme ?? 'App'
  const hasProjectYml = await runner.exists(`${projectDir}/project.yml`)
  if (!hasProjectYml) {
    const yml = DEFAULT_PROJECT_YML.replace(/\bApp\b/g, appName).replace(
      /\bAppTests\b/g,
      `${appName}Tests`,
    )
    await runner.writeFile(`${projectDir}/project.yml`, yml)
  } else if (appName !== 'App') {
    // Update existing project.yml to use the proper app name
    const existing = await runner.readFile(`${projectDir}/project.yml`)
    if (existing.includes('name: App')) {
      const updated = existing
        .replace(/\bApp\b/g, appName)
        .replace(/\bAppTests\b/g, `${appName}Tests`)
      await runner.writeFile(`${projectDir}/project.yml`, updated)
    }
  }

  const commands: string[] = []

  // Clean stale build intermediates so xcodebuild does a fresh compile
  const cleanResult = await runner.exec('rm', [
    '-rf',
    `${projectDir}/build/Build/Intermediates.noindex`,
  ])
  commands.push(cleanResult.command)

  // Always regenerate .xcodeproj from project.yml to pick up source file changes
  const genResult = await runner.exec('xcodegen', ['generate', '--spec', 'project.yml'], {
    cwd: projectDir,
  })
  commands.push(genResult.command)
  if (genResult.exitCode !== 0) {
    return {
      success: false,
      error: `xcodegen failed: ${genResult.stderr}`,
      duration: genResult.duration,
      commands,
    }
  }

  // Find the .xcodeproj
  const projs = await runner.glob(`${projectDir}/*.xcodeproj`)
  if (projs.length === 0) {
    return { success: false, error: 'No .xcodeproj found after xcodegen', duration: 0 }
  }
  const projName = projs[0].split('/').pop()!

  const scheme = opts.scheme ?? projName.replace('.xcodeproj', '')
  const buildDir = `${projectDir}/build/Build/Products`

  const args = [
    '-project',
    projName,
    '-scheme',
    scheme,
    '-destination',
    destination,
    '-derivedDataPath',
    'build',
    '-allowProvisioningUpdates',
    'CONFIGURATION_BUILD_DIR=' + buildDir + '/Debug-iphonesimulator',
    'build',
  ]

  const result = await runner.exec('xcodebuild', args, { cwd: projectDir })
  commands.push(result.command)

  if (result.exitCode !== 0) {
    // Parse structured errors from xcodebuild output
    const errors: BuildError[] = []
    const output = result.stdout + '\n' + result.stderr
    const errorRegex = /(.+\.swift):(\d+):\d+: error: (.+)/g
    let errMatch: RegExpExecArray | null
    while ((errMatch = errorRegex.exec(output)) !== null) {
      errors.push({ file: errMatch[1], line: parseInt(errMatch[2]), message: errMatch[3] })
    }

    // Build a concise error summary instead of dumping raw stderr
    const errorSummary =
      errors.length > 0
        ? errors
            .map((e) => `${e.file.split('/').slice(-2).join('/')}:${e.line}: ${e.message}`)
            .join('\n')
        : result.stderr
            .split('\n')
            .filter((l) => l.includes('error:'))
            .join('\n') || result.stderr

    return { success: false, error: errorSummary, errors, duration: result.duration, commands }
  }

  return { success: true, duration: result.duration, commands }
}

export { archiveSwift } from './swift-archive.js'
