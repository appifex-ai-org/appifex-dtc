// Phase 5 (TF-01 D-01, TF-03): xcode_archive phase orchestrator.
// Composes: ASC idempotent pre-check (D-16) → computeNextBuildNumber (D-06) →
// read package.json version (D-07) → archiveSwift → return artifact metadata.
// Thrown errors: ArchiveError (FOUND-04 / D-05). Never process.exit.

import type { Runner, DtcConfig, AscJwtArgs } from '@appifex/core'
import { ArchiveError } from '@appifex/core'
import { computeNextBuildNumber, findBuildByVersion } from '@appifex/provision'
import type { AscRestOpts } from '@appifex/provision'
import { archiveSwift } from './swift-archive.js'
import type { ArchiveResult } from './types.js'

export interface XcodeArchivePhaseOpts {
  runner: Runner
  config: DtcConfig
  projectDir: string
  scheme: string
  /** Optional — defaults to globalThis.fetch; injectable for testing. */
  fetchImpl?: typeof globalThis.fetch
}

export type XcodeArchivePhaseResult =
  | {
      skipped: true
      reason: string
      buildId?: string
    }
  | (ArchiveResult & {
      skipped: false
      bundleId: string
    })

export async function runXcodeArchivePhase(
  opts: XcodeArchivePhaseOpts,
): Promise<XcodeArchivePhaseResult> {
  // Phase 5 (D-05): typed-error remediation for each missing field.
  const apple = opts.config.apple
  if (!apple?.ascAppId) {
    throw new ArchiveError(
      'xcode_archive: missing apple.ascAppId in ~/.dtc/config.json — run `dtc setup apple`.',
    )
  }
  if (!apple.ascKeyId) {
    throw new ArchiveError('xcode_archive: missing apple.ascKeyId — run `dtc setup apple`.')
  }
  if (!apple.ascIssuerId) {
    throw new ArchiveError('xcode_archive: missing apple.ascIssuerId — run `dtc setup apple`.')
  }
  if (!apple.ascKeyPath) {
    throw new ArchiveError('xcode_archive: missing apple.ascKeyPath — run `dtc setup apple`.')
  }
  if (!apple.bundleId) {
    throw new ArchiveError('xcode_archive: missing apple.bundleId — run `dtc setup apple`.')
  }

  const creds: AscJwtArgs = {
    keyPath: apple.ascKeyPath,
    keyId: apple.ascKeyId,
    issuerId: apple.ascIssuerId,
  }
  const ascOpts: AscRestOpts = { creds, fetchImpl: opts.fetchImpl }

  // Phase 5 (D-06): compute next build number from ASC max + 1.
  const nextBuildNumber = await computeNextBuildNumber(ascOpts, apple.ascAppId)

  // Phase 5 (D-16): idempotent pre-check. If a build with {appId, version=nextBuildNumber}
  // is already VALID in ASC, skip archive — jump to the assignment step (Plan 05 consumes buildId).
  const existing = await findBuildByVersion(ascOpts, apple.ascAppId, nextBuildNumber)
  if (existing && existing.attributes.processingState === 'VALID') {
    return {
      skipped: true,
      reason: `build ${nextBuildNumber} already VALID in ASC (D-16 idempotent skip)`,
      buildId: existing.id,
    }
  }

  // Phase 5 (D-07): read marketing version from generated app's package.json; fall back 1.0.0.
  const marketingVersion = await readMarketingVersion(opts.runner, opts.projectDir)

  // Phase 5 (TF-03): invoke archiveSwift with version metadata. Plan 02's rewrite applies
  // all release-hygiene injections (ITSAppUsesNonExemptEncryption, DEBUG_INFORMATION_FORMAT,
  // MARKETING_VERSION, CURRENT_PROJECT_VERSION) via the shared project-yml helpers.
  const result = await archiveSwift(opts.runner, {
    projectDir: opts.projectDir,
    scheme: opts.scheme,
    teamId: apple.teamId,
    bundleId: apple.bundleId,
    marketingVersion,
    buildNumber: nextBuildNumber,
  } as any)

  return {
    skipped: false,
    ...result,
    bundleId: apple.bundleId,
  }
}

async function readMarketingVersion(runner: Runner, projectDir: string): Promise<string> {
  try {
    const raw = await runner.readFile(`${projectDir}/package.json`)
    const pkg = JSON.parse(raw) as { version?: string }
    if (typeof pkg.version === 'string' && pkg.version.length > 0) return pkg.version
  } catch {
    // File missing or unreadable — fall back.
  }
  // Phase 5 (D-07): deterministic fallback when the generated app has no package.json / version.
  return '1.0.0'
}
