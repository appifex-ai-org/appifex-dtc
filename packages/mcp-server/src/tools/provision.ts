import { archiveSwift, bundleKotlin } from '@appifex/build'
import { AscClient, PlayConsoleClient } from '@appifex/provision'
import type { Runner, DtcConfig } from '@appifex/core'

export async function handleProvisionSubmit(
  args: {
    projectDir?: string
    scheme?: string
    ipaPath?: string
    aabPath?: string
    platform?: 'ios' | 'android'
    exportMethod?: 'app-store' | 'ad-hoc' | 'development'
  },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  try {
    // Auto-detect platform
    let platform = args.platform
    if (!platform) {
      if (args.aabPath) {
        platform = 'android'
      } else if (args.ipaPath) {
        platform = 'ios'
      } else if (args.projectDir) {
        const hasGradle = await runner.exists(`${args.projectDir}/app/build.gradle.kts`)
          || await runner.exists(`${args.projectDir}/build.gradle.kts`)
        platform = hasGradle ? 'android' : 'ios'
      } else {
        return { text: 'projectDir, ipaPath, or aabPath is required.', isError: true }
      }
    }

    if (platform === 'android') {
      return await handleAndroidSubmit(args, runner, config)
    }
    return await handleIosSubmit(args, runner, config)
  } catch (err) {
    return {
      text: `Provision failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}

async function handleIosSubmit(
  args: { projectDir?: string; scheme?: string; ipaPath?: string; exportMethod?: 'app-store' | 'ad-hoc' | 'development' },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  if (!config.apple) {
    return { text: 'Apple TestFlight not configured. Run `dtc setup` first.', isError: true }
  }
  if (!config.apple.ascKeyId || !config.apple.ascIssuerId || !config.apple.ascKeyPath) {
    return { text: 'App Store Connect credentials (ascKeyId, ascIssuerId, ascKeyPath) not configured. Run `dtc setup` first.', isError: true }
  }
  if (!config.apple.ascAppId) {
    return { text: 'App Store Connect App ID not configured. Run `dtc setup` to add it.', isError: true }
  }

  const asc = new AscClient(runner, {
    keyId: config.apple.ascKeyId,
    issuerId: config.apple.ascIssuerId,
    keyPath: config.apple.ascKeyPath,
  })

  let ipaPath = args.ipaPath

  if (!ipaPath) {
    if (!args.projectDir) {
      return { text: 'projectDir is required when ipaPath is not provided.', isError: true }
    }
    const archiveResult = await archiveSwift(runner, {
      projectDir: args.projectDir,
      scheme: args.scheme,
      teamId: config.apple.teamId,
      bundleId: config.apple.bundleId,
      exportMethod: args.exportMethod ?? 'app-store',
    })

    if (!archiveResult.success) {
      return {
        text: JSON.stringify({ phase: 'archive', success: false, error: archiveResult.error, commands: archiveResult.commands }, null, 2),
        isError: true,
      }
    }
    ipaPath = archiveResult.ipaPath!
  }

  const submitResult = await asc.submitTestFlight({ appId: config.apple.ascAppId, ipaPath, group: config.apple.ascTestFlightGroup })

  return {
    text: JSON.stringify({
      phase: 'submit',
      platform: 'ios',
      success: submitResult.success,
      ipaPath,
      output: submitResult.output,
      error: submitResult.error,
    }, null, 2),
    isError: !submitResult.success,
  }
}

async function handleAndroidSubmit(
  args: { projectDir?: string; aabPath?: string },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  if (!config.android) {
    return { text: 'Google Play Console not configured. Run `dtc setup` first.', isError: true }
  }
  if (!config.android.serviceAccountKeyPath || !config.android.packageName) {
    return { text: 'Google Play Console credentials incomplete (serviceAccountKeyPath, packageName). Run `dtc setup` first.', isError: true }
  }

  let aabPath = args.aabPath

  if (!aabPath) {
    if (!args.projectDir) {
      return { text: 'projectDir is required when aabPath is not provided.', isError: true }
    }
    if (!config.android.keystorePath) {
      return { text: 'Release keystore not configured. Run `dtc setup` first.', isError: true }
    }
    const bundleResult = await bundleKotlin(runner, {
      projectDir: args.projectDir,
      applicationId: config.android.packageName,
      keystorePath: config.android.keystorePath!,
      keystorePassword: config.android.keystorePassword ?? '',
      keyAlias: config.android.keyAlias ?? 'release',
      keyPassword: config.android.keyPassword ?? '',
    })

    if (!bundleResult.success) {
      return {
        text: JSON.stringify({ phase: 'bundle', success: false, error: bundleResult.error, commands: bundleResult.commands }, null, 2),
        isError: true,
      }
    }
    aabPath = bundleResult.aabPath!
  }

  const track = config.android.playTrack ?? 'internal'
  const playClient = new PlayConsoleClient({ serviceAccountKeyPath: config.android.serviceAccountKeyPath })
  const submitResult = await playClient.submitToTrack({ packageName: config.android.packageName, aabPath, track })

  return {
    text: JSON.stringify({
      phase: 'submit',
      platform: 'android',
      success: submitResult.success,
      aabPath,
      track,
      output: submitResult.output,
      error: submitResult.error,
    }, null, 2),
    isError: !submitResult.success,
  }
}
