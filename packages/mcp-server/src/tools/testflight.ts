/**
 * Phase 7 (MCP-01 D-05 D-07 D-08): handleTestflightUpload MCP handler.
 *
 * Extracted iOS branch of packages/mcp-server/src/tools/provision.ts::handleIosSubmit.
 * - `projectDir` is now required (no pre-built-IPA fallback).
 * - Android branch stays in handleAndroidSubmit under dtc_provision_submit.
 */
import { runXcodeArchivePhase } from '@appifex/build'
import { runTestFlightUploadPhase } from '@appifex/provision'
import { ProgressEmitter } from '@appifex/core'
import type { Runner, DtcConfig } from '@appifex/core'

export interface HandleTestflightUploadArgs {
  projectDir: string
  scheme?: string
  marketingVersion?: string
  buildNumber?: string
  configDir?: string
}

export async function handleTestflightUpload(
  args: HandleTestflightUploadArgs,
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  if (!config.apple) {
    return {
      text: 'Apple TestFlight not configured. Run `dtc setup apple` first.',
      isError: true,
    }
  }
  const emitter = new ProgressEmitter()
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

    const upload = await runTestFlightUploadPhase({
      runner,
      config,
      emitter,
      ipaPath: archive.ipaPath ?? '',
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
          buildId: upload.buildId,
          status: upload.status,
          warnings: upload.status === 'completed_with_warnings' ? upload.warnings ?? [] : [],
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
