// Phase 5 Plan 05 (TF-01 D-01, TF-04): testflight_upload phase orchestrator.
//
// Composes: altool upload → D-09 retry-once on duplicate → D-15 polling (45m cap) →
// D-19 internal-group ensure → D-20 tester reconciliation → D-17 soft-fail
// (completed_with_warnings) on any post-upload assignment failure.
//
// Invariants:
//  - Credentials: missing apple.ascAppId | ascKeyId | ascIssuerId | ascKeyPath | bundleId
//    throws TestFlightError before any subprocess is invoked (FOUND-04 typed error).
//  - D-09 retry budget is ONE. Second duplicate after a fresh computeNextBuildNumber +1
//    is a hard-fail (TestFlightError) — it means a concurrent dtc run beat us, and the
//    user should re-run dtc to pick up the next free build number.
//  - D-15 45-min TIMEOUT is a SOFT fail (status='completed_with_warnings'), because the
//    build IS uploaded — Apple just hasn't finished processing. Re-running dtc resumes
//    at tester-assignment without a fresh upload.
//  - D-17 soft-fail also covers: findOrCreateInternalGroup throws, reconcileTesters
//    throws, or reconcileTesters returns non-empty warnings[]. Exit code 0 in all cases.

import type { Runner, DtcConfig, ProgressEmitter, AscJwtArgs } from '@appifex/core'
import { TestFlightError } from '@appifex/core'
import type { AscRestOpts } from './asc-rest.js'
import {
  findOrCreateInternalGroup,
  reconcileTesters,
  findBuildByVersion,
  computeNextBuildNumber,
  isDuplicateVersionError,
} from './asc-rest.js'
import { uploadIpa } from './altool.js'
import { pollUntilProcessed } from './testflight-polling.js'

export interface TestFlightUploadPhaseOpts {
  runner: Runner
  config: DtcConfig
  emitter: ProgressEmitter
  ipaPath: string
  buildNumber: string
  marketingVersion: string
  fetchImpl?: typeof globalThis.fetch
}

export type TestFlightUploadPhaseResult =
  | { status: 'completed'; buildId: string; groupId: string; testersAdded: string[] }
  | { status: 'completed_with_warnings'; buildId: string; warnings: string[] }

export async function runTestFlightUploadPhase(
  opts: TestFlightUploadPhaseOpts,
): Promise<TestFlightUploadPhaseResult> {
  const apple = opts.config.apple
  if (
    !apple?.ascAppId ||
    !apple.ascKeyId ||
    !apple.ascIssuerId ||
    !apple.ascKeyPath ||
    !apple.bundleId
  ) {
    throw new TestFlightError(
      'testflight_upload: missing one or more apple.* credentials — run `dtc setup apple`.',
    )
  }

  const creds: AscJwtArgs = {
    keyPath: apple.ascKeyPath,
    keyId: apple.ascKeyId,
    issuerId: apple.ascIssuerId,
  }
  const ascOpts: AscRestOpts = { creds, fetchImpl: opts.fetchImpl }

  // ── Phase 5 (D-09): upload with retry-once on duplicate-version. ─────────
  let currentBuildNumber = opts.buildNumber
  let upload = await uploadIpa({
    runner: opts.runner,
    ipaPath: opts.ipaPath,
    ascAppId: apple.ascAppId,
    bundleId: apple.bundleId,
    buildNumber: currentBuildNumber,
    marketingVersion: opts.marketingVersion,
    keyId: apple.ascKeyId,
    issuerId: apple.ascIssuerId,
    keyPath: apple.ascKeyPath,
  })

  if (!upload.success && upload.errors.some((e) => isDuplicateVersionError(e.itmsCode ?? null))) {
    // Duplicate-version → re-query ASC max, bump +1, retry once.
    const freshNext = await computeNextBuildNumber(ascOpts, apple.ascAppId)
    currentBuildNumber = freshNext
    upload = await uploadIpa({
      runner: opts.runner,
      ipaPath: opts.ipaPath,
      ascAppId: apple.ascAppId,
      bundleId: apple.bundleId,
      buildNumber: currentBuildNumber,
      marketingVersion: opts.marketingVersion,
      keyId: apple.ascKeyId,
      issuerId: apple.ascIssuerId,
      keyPath: apple.ascKeyPath,
    })
    if (!upload.success && upload.errors.some((e) => isDuplicateVersionError(e.itmsCode ?? null))) {
      // Second conflict — hard-fail per D-09.
      throw new TestFlightError(
        `altool upload failed twice with duplicate-version: another dtc run may have uploaded build ${currentBuildNumber}. Re-run dtc to continue.`,
        upload.errors[0].itmsCode,
      )
    }
  }
  if (!upload.success) {
    throw new TestFlightError(
      `altool upload failed: ${upload.errors.map((e) => e.message).join('; ')}`,
      upload.errors[0]?.itmsCode,
    )
  }

  // ── Find uploaded build for polling + assignment. ────────────────────────
  const build = await findBuildByVersion(ascOpts, apple.ascAppId, currentBuildNumber)
  if (!build) {
    throw new TestFlightError(
      `altool reported success but build ${currentBuildNumber} not found in ASC within query window. Re-run dtc — the build may appear shortly.`,
    )
  }

  // ── Phase 5 (D-15): poll until processing terminal state. ────────────────
  const terminal = await pollUntilProcessed({
    ascOpts,
    buildId: build.id,
    emitter: opts.emitter,
  })

  if (terminal === 'FAILED' || terminal === 'INVALID') {
    throw new TestFlightError(
      `Apple rejected build ${currentBuildNumber}: processingState=${terminal}. Check App Store Connect for diagnostics.`,
    )
  }

  if (terminal === 'TIMEOUT') {
    // D-15 + D-17: 45-min soft-fail. Build is uploaded; processing continues at Apple.
    return {
      status: 'completed_with_warnings',
      buildId: build.id,
      warnings: [
        `Build ${currentBuildNumber} uploaded successfully, but Apple processing exceeded 45 minutes. Check ASC (App Store Connect) for status; re-run dtc to finish tester assignment.`,
      ],
    }
  }

  // ── Processing VALID → group ensure + tester reconciliation. ─────────────
  // D-17: side-effect failures after upload → completed_with_warnings (exit 0).
  try {
    const groupName = apple.ascTestFlightGroup ?? 'dtc-internal'
    const group = await findOrCreateInternalGroup(ascOpts, apple.ascAppId, groupName)

    const { added, warnings: reconcileWarnings } = await reconcileTesters(
      ascOpts,
      group.id,
      apple.testflightTesters ?? [],
    )

    if (reconcileWarnings.length > 0) {
      return {
        status: 'completed_with_warnings',
        buildId: build.id,
        warnings: reconcileWarnings,
      }
    }

    return {
      status: 'completed',
      buildId: build.id,
      groupId: group.id,
      testersAdded: added,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      status: 'completed_with_warnings',
      buildId: build.id,
      warnings: [
        `Build ${currentBuildNumber} uploaded successfully, but group/tester assignment failed: ${msg}. Re-run dtc to retry assignment, or assign manually in App Store Connect.`,
      ],
    }
  }
}
