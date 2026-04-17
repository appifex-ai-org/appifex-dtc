import type { Runner } from '@appifex/core'
import type { ArchiveOpts, ArchiveResult } from './types.js'
import { DEFAULT_PROJECT_YML, DEFAULT_APP_ENTRY } from './swift.js'

/**
 * Archive a SwiftUI project and export a signed .ipa for TestFlight/App Store distribution.
 *
 * Flow: xcodegen → xcodebuild archive → xcodebuild -exportArchive → .ipa
 */
export async function archiveSwift(runner: Runner, opts: ArchiveOpts): Promise<ArchiveResult> {
  const projectDir = opts.projectDir
  const scheme = opts.scheme ?? 'App'
  const exportMethod = opts.exportMethod ?? 'app-store'
  const commands: string[] = []
  const startTime = Date.now()

  // Ensure Sources directory exists (same as buildSwift)
  const hasSourcesDir = await runner.exists(`${projectDir}/Sources`)
  if (!hasSourcesDir) {
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

  // Ensure AppIcon asset catalog exists (required for App Store submission)
  const appIconDir = `${projectDir}/Sources/Assets.xcassets/AppIcon.appiconset`
  const hasAppIcon = await runner.exists(`${appIconDir}/Contents.json`)
  if (!hasAppIcon) {
    // Generate a 1024x1024 placeholder icon using sips (built into macOS)
    const iconPath = `${appIconDir}/appicon.png`
    const contentsJson = JSON.stringify(
      {
        images: [
          { filename: 'appicon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    )
    await runner.writeFile(`${appIconDir}/Contents.json`, contentsJson)

    // Create a simple solid-color PNG icon using sips + built-in macOS tools
    const iconExists = await runner.exists(iconPath)
    if (!iconExists) {
      // Use Python (always available on macOS) to generate a minimal valid PNG
      await runner.exec(
        'python3',
        [
          '-c',
          `
import struct, zlib
w, h = 1024, 1024
raw = b''
for y in range(h):
    raw += b'\\x00' + b'\\x1a\\x8c\\xff' * w  # blue-ish color, no filter byte prefix
def chunk(ctype, data):
    c = ctype + data
    return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
sig = b'\\x89PNG\\r\\n\\x1a\\n'
ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
with open('${iconPath}', 'wb') as f:
    f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
`,
        ],
        { cwd: projectDir },
      )
    }

    // Ensure top-level Assets.xcassets/Contents.json exists
    const assetsContents = `${projectDir}/Sources/Assets.xcassets/Contents.json`
    const hasAssetsContents = await runner.exists(assetsContents)
    if (!hasAssetsContents) {
      await runner.writeFile(
        assetsContents,
        JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2),
      )
    }
  }

  // Inject signing config into project.yml
  const hasProjectYml = await runner.exists(`${projectDir}/project.yml`)
  if (!hasProjectYml) {
    const yml = DEFAULT_PROJECT_YML.replace(/\bApp\b/g, scheme).replace(
      /\bAppTests\b/g,
      `${scheme}Tests`,
    )
    await runner.writeFile(`${projectDir}/project.yml`, yml)
  }

  // Patch project.yml with signing settings
  const projectYml = await runner.readFile(`${projectDir}/project.yml`)
  if (!projectYml.includes('DEVELOPMENT_TEAM')) {
    const signingSettings = [
      `      DEVELOPMENT_TEAM: "${opts.teamId}"`,
      `      PRODUCT_BUNDLE_IDENTIFIER: "${opts.bundleId}"`,
      `      CODE_SIGN_STYLE: Automatic`,
    ].join('\n')

    // Insert signing settings after the target's settings block
    const targetSettingsMatch = projectYml.match(
      /(targets:\s*\n\s+\w+:\s*\n[\s\S]*?settings:\s*\n)/m,
    )
    if (targetSettingsMatch) {
      const insertIdx = targetSettingsMatch.index! + targetSettingsMatch[0].length
      const patched =
        projectYml.slice(0, insertIdx) + signingSettings + '\n' + projectYml.slice(insertIdx)
      await runner.writeFile(`${projectDir}/project.yml`, patched)
    }
  }

  // Patch project.yml with App Store required Info.plist keys (iPad orientations, launch screen, app icon)
  const currentYml = await runner.readFile(`${projectDir}/project.yml`)
  const requiredSettings: Record<string, string> = {
    INFOPLIST_KEY_UIApplicationSceneManifest_Generation: 'YES',
    INFOPLIST_KEY_UILaunchScreen_Generation: 'YES',
    INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad:
      '"UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"',
    INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone:
      '"UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"',
    INFOPLIST_KEY_CFBundleIconName: 'AppIcon',
    ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
  }
  const missingSettings: string[] = []
  for (const [key, value] of Object.entries(requiredSettings)) {
    if (!currentYml.includes(key)) {
      missingSettings.push(`      ${key}: ${value}`)
    }
  }
  if (missingSettings.length > 0) {
    // Find the first target's settings block and append
    const settingsMatch = currentYml.match(
      /(targets:\s*\n\s+\w+:\s*\n[\s\S]*?settings:\s*\n([\s\S]*?)(?=\n\s+\w+:|schemes:|$))/m,
    )
    if (settingsMatch) {
      const settingsEnd = settingsMatch.index! + settingsMatch[1].length
      // Find the end of the settings entries (last indented line before next section)
      const lines = currentYml.slice(0, settingsEnd).split('\n')
      let insertLine = lines.length - 1
      while (insertLine > 0 && lines[insertLine].trim() === '') insertLine--
      const before = lines.slice(0, insertLine + 1).join('\n')
      const after = currentYml.slice(before.length)
      await runner.writeFile(
        `${projectDir}/project.yml`,
        before + '\n' + missingSettings.join('\n') + after,
      )
    }
  }

  // Read the actual project name from project.yml (may differ from scheme arg)
  const projectYmlContent = await runner.readFile(`${projectDir}/project.yml`)
  const projectNameMatch = projectYmlContent.match(/^name:\s*(.+)$/m)
  const projectName = projectNameMatch?.[1]?.trim() ?? scheme

  // Generate .xcodeproj
  const genResult = await runner.exec('xcodegen', ['generate', '--spec', 'project.yml'], {
    cwd: projectDir,
  })
  commands.push(genResult.command)
  if (genResult.exitCode !== 0) {
    return {
      success: false,
      error: `xcodegen failed: ${genResult.stderr}`,
      duration: Date.now() - startTime,
      commands,
      marketingVersion: opts.marketingVersion,
      buildNumber: opts.buildNumber,
    }
  }

  // Find the .xcodeproj (xcodegen names it from project.yml's `name:` field)
  const projs = await runner.glob(`${projectDir}/*.xcodeproj`)
  if (projs.length === 0) {
    return {
      success: false,
      error: 'No .xcodeproj found after xcodegen',
      duration: Date.now() - startTime,
      commands,
      marketingVersion: opts.marketingVersion,
      buildNumber: opts.buildNumber,
    }
  }
  const projFile = projs[0].split('/').pop()!
  const defaultScheme = projFile.replace('.xcodeproj', '')
  const schemeForBuild = opts.scheme ?? defaultScheme

  const archivePath = `${projectDir}/build/${schemeForBuild}.xcarchive`
  const exportPath = `${projectDir}/build/export`

  // xcodebuild archive
  const archiveArgs = [
    '-project',
    projFile,
    '-scheme',
    schemeForBuild,
    '-destination',
    'generic/platform=iOS',
    '-archivePath',
    archivePath,
    '-allowProvisioningUpdates',
    `DEVELOPMENT_TEAM=${opts.teamId}`,
    `PRODUCT_BUNDLE_IDENTIFIER=${opts.bundleId}`,
    'archive',
  ]

  const archiveResult = await runner.exec('xcodebuild', archiveArgs, {
    cwd: projectDir,
    timeout: 600_000,
  })
  commands.push(archiveResult.command)
  if (archiveResult.exitCode !== 0) {
    const output = archiveResult.stdout + '\n' + archiveResult.stderr
    const errorLines = output
      .split('\n')
      .filter((l) => l.includes('error:'))
      .join('\n')
    return {
      success: false,
      error: errorLines || archiveResult.stderr,
      duration: Date.now() - startTime,
      commands,
      marketingVersion: opts.marketingVersion,
      buildNumber: opts.buildNumber,
    }
  }

  // Write ExportOptions.plist for exportArchive
  const exportOptionsPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${exportMethod}</string>
  <key>teamID</key>
  <string>${opts.teamId}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>`

  const exportOptionsPlistPath = `${projectDir}/build/ExportOptions.plist`
  await runner.writeFile(exportOptionsPlistPath, exportOptionsPlist)

  // xcodebuild -exportArchive
  const exportArgs = [
    '-exportArchive',
    '-archivePath',
    archivePath,
    '-exportPath',
    exportPath,
    '-exportOptionsPlist',
    exportOptionsPlistPath,
    '-allowProvisioningUpdates',
  ]

  const exportResult = await runner.exec('xcodebuild', exportArgs, {
    cwd: projectDir,
    timeout: 300_000,
  })
  commands.push(exportResult.command)
  if (exportResult.exitCode !== 0) {
    return {
      success: false,
      error: `Export failed: ${exportResult.stderr}`,
      archivePath,
      duration: Date.now() - startTime,
      commands,
      marketingVersion: opts.marketingVersion,
      buildNumber: opts.buildNumber,
    }
  }

  // Find the exported .ipa
  const ipas = await runner.glob(`${exportPath}/*.ipa`)
  if (ipas.length === 0) {
    return {
      success: false,
      error: 'Export succeeded but no .ipa found in output',
      archivePath,
      duration: Date.now() - startTime,
      commands,
      marketingVersion: opts.marketingVersion,
      buildNumber: opts.buildNumber,
    }
  }

  return {
    success: true,
    ipaPath: ipas[0],
    archivePath,
    duration: Date.now() - startTime,
    commands,
    marketingVersion: opts.marketingVersion,
    buildNumber: opts.buildNumber,
  }
}
