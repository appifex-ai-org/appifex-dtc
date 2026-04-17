// Phase 5 Plan 06 (TF-01 D-03): AscClient removed — wire through the orchestrators.
import { bundleKotlin, runXcodeArchivePhase } from '@appifex/build'
import { PlayConsoleClient, runTestFlightUploadPhase } from '@appifex/provision'
import { ProgressEmitter } from '@appifex/core'
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
        const hasGradle =
          (await runner.exists(`${args.projectDir}/app/build.gradle.kts`)) ||
          (await runner.exists(`${args.projectDir}/build.gradle.kts`))
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
  args: {
    projectDir?: string
    scheme?: string
    ipaPath?: string
    exportMethod?: 'app-store' | 'ad-hoc' | 'development'
    marketingVersion?: string
    buildNumber?: string
  },
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  if (!config.apple) {
    return { text: 'Apple TestFlight not configured. Run `dtc setup` first.', isError: true }
  }
  if (!config.apple.ascKeyId || !config.apple.ascIssuerId || !config.apple.ascKeyPath) {
    return {
      text: 'App Store Connect credentials (ascKeyId, ascIssuerId, ascKeyPath) not configured. Run `dtc setup` first.',
      isError: true,
    }
  }
  if (!config.apple.ascAppId) {
    return {
      text: 'App Store Connect App ID not configured. Run `dtc setup` to add it.',
      isError: true,
    }
  }

  const emitter = new ProgressEmitter()

  // Fresh-archive path: archive via runXcodeArchivePhase (pulls version from package.json,
  // computes next build number via ASC REST, short-circuits when build is already VALID).
  if (!args.ipaPath) {
    if (!args.projectDir) {
      return { text: 'projectDir is required when ipaPath is not provided.', isError: true }
    }
    try {
      const archive = await runXcodeArchivePhase({
        runner,
        config,
        projectDir: args.projectDir,
        scheme: args.scheme ?? 'App',
      })
      if (archive.skipped) {
        return {
          text: JSON.stringify(
            {
              phase: 'archive',
              success: true,
              skipped: true,
              reason: archive.reason,
              buildId: archive.buildId,
            },
            null,
            2,
          ),
          isError: false,
        }
      }
      if (!archive.ipaPath) {
        return {
          text: JSON.stringify(
            {
              phase: 'archive',
              success: false,
              error: 'archive reported success but produced no .ipa path',
            },
            null,
            2,
          ),
          isError: true,
        }
      }
      const upload = await runTestFlightUploadPhase({
        runner,
        config,
        emitter,
        ipaPath: archive.ipaPath,
        buildNumber: archive.buildNumber,
        marketingVersion: archive.marketingVersion,
      })
      return {
        text: JSON.stringify(
          {
            phase: 'submit',
            platform: 'ios',
            success: true,
            ipaPath: archive.ipaPath,
            buildId: upload.status === 'completed' ? upload.buildId : upload.buildId,
            status: upload.status,
            warnings: upload.status === 'completed_with_warnings' ? upload.warnings : [],
          },
          null,
          2,
        ),
        isError: false,
      }
    } catch (err) {
      return {
        text: JSON.stringify(
          {
            phase: 'archive-or-submit',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          null,
          2,
        ),
        isError: true,
      }
    }
  }

  // Pre-built-IPA path: caller must supply marketingVersion + buildNumber (we cannot infer them
  // from an opaque .ipa file without unzipping it — keep the CLI-facing contract explicit).
  const marketingVersion = args.marketingVersion ?? '1.0.0'
  const buildNumber = args.buildNumber ?? '1'
  try {
    const upload = await runTestFlightUploadPhase({
      runner,
      config,
      emitter,
      ipaPath: args.ipaPath,
      buildNumber,
      marketingVersion,
    })
    return {
      text: JSON.stringify(
        {
          phase: 'submit',
          platform: 'ios',
          success: true,
          ipaPath: args.ipaPath,
          buildId: upload.buildId,
          status: upload.status,
          warnings: upload.status === 'completed_with_warnings' ? upload.warnings : [],
        },
        null,
        2,
      ),
      isError: false,
    }
  } catch (err) {
    return {
      text: JSON.stringify(
        {
          phase: 'submit',
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
        null,
        2,
      ),
      isError: true,
    }
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
    return {
      text: 'Google Play Console credentials incomplete (serviceAccountKeyPath, packageName). Run `dtc setup` first.',
      isError: true,
    }
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
        text: JSON.stringify(
          {
            phase: 'bundle',
            success: false,
            error: bundleResult.error,
            commands: bundleResult.commands,
          },
          null,
          2,
        ),
        isError: true,
      }
    }
    aabPath = bundleResult.aabPath!
  }

  const track = config.android.playTrack ?? 'internal'
  const playClient = new PlayConsoleClient({
    serviceAccountKeyPath: config.android.serviceAccountKeyPath,
  })
  const submitResult = await playClient.submitToTrack({
    packageName: config.android.packageName,
    aabPath,
    track,
  })

  return {
    text: JSON.stringify(
      {
        phase: 'submit',
        platform: 'android',
        success: submitResult.success,
        aabPath,
        track,
        output: submitResult.output,
        error: submitResult.error,
      },
      null,
      2,
    ),
    isError: !submitResult.success,
  }
}
