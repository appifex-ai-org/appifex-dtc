/**
 * Phase 7 (MCP-01 D-05 D-07 D-08): handleFirebaseProvision MCP handler.
 *
 * Dispatches to the existing `runFirebaseProvision` phase helper (Phase 4 FIRE-04).
 * Idempotency + checkpoint semantics preserved — the helper handles them.
 *
 * Revision B-01 (2026-04-18): uses the REAL FirebaseProvisionOpts shape from
 * packages/baas/src/firebase-provision.ts:26-43 — outputDir (not projectDir),
 * REQUIRED baasSchema, plistExists computed via runner.glob, no emitter param.
 * FirebaseProvisionResult fields: skipped, projectId?, iosAppId?, plistPath?,
 * collectionsSeeded? — NOT rulesDeployed.
 */
import { runFirebaseProvision } from '@appifex/baas'
import type { Runner, DtcConfig, BaasSchema } from '@appifex/core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface HandleFirebaseProvisionArgs {
  projectDir: string
  overwritePlist?: boolean
  /** Optional — caller may pass inline; otherwise handler reads .dtc/last-baas-schema.json */
  baasSchema?: BaasSchema
  configDir?: string
}

/** Resolve baasSchema in priority: args → .dtc/last-baas-schema.json → throw. */
async function resolveBaasSchema(
  projectDir: string,
  fromArgs: BaasSchema | undefined,
): Promise<BaasSchema> {
  if (fromArgs) return fromArgs
  const schemaPath = join(projectDir, '.dtc', 'last-baas-schema.json')
  try {
    const raw = await readFile(schemaPath, 'utf-8')
    return JSON.parse(raw) as BaasSchema
  } catch {
    throw new Error(
      "baasSchema not found; run 'dtc_run_pipeline' first or pass baasSchema arg",
    )
  }
}

export async function handleFirebaseProvision(
  args: HandleFirebaseProvisionArgs,
  runner: Runner,
  config: DtcConfig,
): Promise<{ text: string; isError: boolean }> {
  if (!config.firebase?.projectId) {
    return {
      text: 'Firebase not configured (config.firebase.projectId missing). Run `dtc setup firebase` first.',
      isError: true,
    }
  }
  if (!config.firebase?.serviceAccountKeyPath) {
    return {
      text: 'Firebase service-account key path missing (config.firebase.serviceAccountKeyPath). Run `dtc setup firebase` first.',
      isError: true,
    }
  }

  try {
    const baasSchema = await resolveBaasSchema(args.projectDir, args.baasSchema)

    // plistExists: true if any GoogleService-Info.plist is present under projectDir
    const plistMatches = await runner.glob(
      join(args.projectDir, '**/GoogleService-Info.plist'),
    )
    const plistExists = plistMatches.length > 0

    const result = await runFirebaseProvision({
      outputDir: args.projectDir,
      runner,
      config,
      baasSchema,
      plistExists,
      overwritePlist: args.overwritePlist,
    })

    return {
      text: JSON.stringify(
        {
          phase: 'firebase_provision',
          success: true,
          skipped: result.skipped,
          projectId: result.projectId,
          iosAppId: result.iosAppId,
          plistPath: result.plistPath,
          collectionsSeeded: result.collectionsSeeded,
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
          phase: 'firebase_provision',
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
