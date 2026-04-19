/**
 * Phase 4 (FIRE-04): firebase_provision phase implementation.
 *
 * Orchestrates Firebase project provisioning for generated SwiftUI apps:
 * - Security lint gate (FIRE-05): runs before any rules deployment
 * - Idempotency: returns early if plist already exists (D-05)
 * - firebase-admin SecurityRules API: deploys rules programmatically (D-07)
 * - Collection seeding: empty sentinel docs for every BaasSchema entity (D-06)
 * - Plist download: calls firebase apps:sdkconfig when plistExists is false
 *
 * Throws ProvisionError on firebase-tools failure, SecurityLintError on lint failure.
 * Never calls process.exit (FOUND-04 / D-08).
 */

import { join } from 'node:path'
import type { Runner } from '@appifex/core'
import { ProvisionError, SecurityLintError } from '@appifex/core'
import type { BaasSchema } from '@appifex/core'
import { lintSecurityRules } from './security-lint.js'

// firebase-admin — named app pattern to avoid global state conflicts
import { initializeApp, cert, deleteApp } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'
import { getFirestore } from 'firebase-admin/firestore'

export interface FirebaseProvisionOpts {
  outputDir: string
  runner: Runner
  config: {
    firebase?: {
      projectId?: string
      serviceAccountKeyPath?: string
      iosAppId?: string
    }
  }
  baasSchema: BaasSchema
  /** True if GoogleService-Info.plist already exists on disk — skip if so (D-05) */
  plistExists?: boolean
  /** Phase 4 Plan 07 (UI-SPEC destructive-action contract): force overwrite even when plistExists=true.
   * Set by the pipeline handler ONLY after the user explicitly confirms the overwrite prompt.
   * Default false — preserves D-05 idempotency for headless / repeated runs. */
  overwritePlist?: boolean
}

export interface FirebaseProvisionResult {
  skipped: boolean
  projectId?: string
  iosAppId?: string
  plistPath?: string
  collectionsSeeded?: number
}

export async function runFirebaseProvision(
  opts: FirebaseProvisionOpts,
): Promise<FirebaseProvisionResult> {
  const { outputDir, runner, config, baasSchema, plistExists, overwritePlist } = opts

  // Phase 4 Plan 07: only short-circuit when plist exists AND user did not opt into overwrite.
  // The overwritePlist=true path is gated by an interactive @clack/prompts confirm in cli/src/pipeline.ts.
  if (plistExists && !overwritePlist) {
    return { skipped: true }
  }

  const firebaseConfig = config.firebase
  if (!firebaseConfig?.projectId || !firebaseConfig?.serviceAccountKeyPath) {
    throw new ProvisionError(
      'firebase_provision: missing projectId or serviceAccountKeyPath in config — run dtc setup firebase first',
    )
  }

  const { projectId, serviceAccountKeyPath } = firebaseConfig

  // ── Step 1: Security lint gate (FIRE-05 D-13) ──
  // Read the generated firestore.rules file and lint before any deployment.
  // Phase 4 (CR-01): path matches renderBaasTemplates output — written to join(outputDir, 'firestore.rules').
  const rulesPath = join(outputDir, 'firestore.rules')
  let rulesContent: string
  try {
    rulesContent = await runner.readFile(rulesPath)
  } catch {
    throw new ProvisionError(
      `firebase_provision: firestore.rules not found at ${rulesPath} — run baas_schema phase first`,
    )
  }

  const lintResult = lintSecurityRules(rulesContent)
  if (!lintResult.passed) {
    // Phase 4 (FIRE-05 D-13): lint failed — throw SecurityLintError, rules NEVER deployed
    throw new SecurityLintError(
      `Security lint failed before rules deployment:\n${lintResult.violations.join('\n')}`,
      lintResult.violations,
    )
  }

  // ── Step 2: firebase-admin rules deployment (D-07) ──
  // Named app avoids conflicts if admin SDK is initialized elsewhere in the pipeline
  const adminAppName = `provision-${Date.now()}`
  const adminApp = initializeApp({ credential: cert(serviceAccountKeyPath) }, adminAppName)

  let collectionsSeeded = 0
  try {
    // Deploy Firestore security rules
    const securityRules = getSecurityRules(adminApp)
    const rulesFile = securityRules.createRulesFileFromSource('firestore.rules', rulesContent)
    const ruleset = await securityRules.createRuleset(rulesFile)
    await securityRules.releaseFirestoreRuleset(ruleset)

    // ── Step 3: Seed empty Firestore collections (D-06) ──
    // Prevents the generated app's first run from failing on a missing collection
    const db = getFirestore(adminApp)
    for (const entity of baasSchema.entities) {
      const colName = `${entity.name.toLowerCase()}s`
      await db.collection(colName).doc('_init').set({ _seeded: true })
      collectionsSeeded++
    }
  } finally {
    // Phase 4 (FIRE-04): always clean up named app — prevents leak across pipeline phases
    await deleteApp(adminApp)
  }

  // ── Step 4: Download GoogleService-Info.plist via firebase-tools (FIRE-04) ──
  // This is idempotent — overwriting an existing plist with the same content is safe.
  const plistPath = join(outputDir, 'GoogleService-Info.plist')
  const iosAppId = firebaseConfig.iosAppId
  if (!iosAppId) {
    throw new ProvisionError(
      'firebase_provision: missing iosAppId in config — run dtc setup firebase first to register an iOS app',
    )
  }

  const plistResult = await runner.exec('firebase', [
    'apps:sdkconfig',
    'IOS',
    iosAppId,
    '--project',
    projectId,
    '-o',
    plistPath,
  ])

  if (plistResult.exitCode !== 0) {
    throw new ProvisionError(
      `firebase_provision: failed to download GoogleService-Info.plist — firebase apps:sdkconfig exited ${plistResult.exitCode}: ${plistResult.stderr}`,
    )
  }

  return {
    skipped: false,
    projectId,
    iosAppId,
    plistPath,
    collectionsSeeded,
  }
}
