// Phase 5 Plan 05 (TF-01, Pitfall 4, Pitfall 7 / Q3, Pitfall 8): altool subprocess driver.
// Canonical 2026 flag set verified against altool(1) man page 2026-04-17
// + fastlane #29739 + fastlane #29743 (Xcode 26 silent-failure regression).
//
// Contract:
//  - ensureKeyAtStandardPath creates ~/.appstoreconnect/private_keys/AuthKey_{keyId}.p8
//    as a symlink to apple.ascKeyPath. Idempotent (no-op when the file/symlink exists).
//  - uploadIpa invokes `xcrun altool --upload-package ...` via the Runner port
//    (so tests use the in-memory Runner from MCP / local-runner / remote-runner without
//    reaching for child_process.spawn directly).
//  - parseAltoolOutput NEVER trusts exit code alone (Pitfall 7 / Q3). It runs a 3-tier
//    detection pipeline: JSON product-errors → ITMS regex on combined stdout+stderr →
//    ContentDelivery regex (Xcode 26 silent-failure pattern).
//  - Never prints / returns JWT material or .p8 contents — the Authorization header
//    for ASC REST lives in asc-rest.ts, not here; altool talks to Apple directly.

import { mkdir, symlink, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Runner } from '@appifex/core'

/** Arguments for altool upload.
 *  - `keyId` is the 10-char App Store Connect API key ID — feeds `--api-key <ID>`.
 *  - `keyPath` is the filesystem path to the AuthKey_{keyId}.p8 file; we symlink it
 *    into ~/.appstoreconnect/private_keys/ before invocation so altool can find it. */
export interface AltoolUploadArgs {
  runner: Runner
  ipaPath: string
  ascAppId: string
  bundleId: string
  buildNumber: string
  marketingVersion: string
  keyId: string
  issuerId: string
  keyPath: string
}

export type AltoolResult =
  | { success: true; toolVersion: string }
  | {
      success: false
      errors: Array<{ message: string; code?: number; itmsCode?: string }>
    }

/** Phase 5 (Pitfall 4): altool searches ~/.appstoreconnect/private_keys/AuthKey_{id}.p8.
 *  Symlink from apple.ascKeyPath to preserve a single source of truth for the key. */
export async function ensureKeyAtStandardPath(keyPath: string, keyId: string): Promise<void> {
  const dir = path.join(homedir(), '.appstoreconnect', 'private_keys')
  const standardPath = path.join(dir, `AuthKey_${keyId}.p8`)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  try {
    await stat(standardPath)
    return // idempotent — file or symlink already present
  } catch {
    // File doesn't exist — fall through to symlink creation below.
  }
  await symlink(keyPath, standardPath)
}

export async function uploadIpa(args: AltoolUploadArgs): Promise<AltoolResult> {
  await ensureKeyAtStandardPath(args.keyPath, args.keyId)

  // Phase 5 (Pitfall 8): canonical hyphenated flag set. All three bundle flags required
  // (Xcode 26 silent-failure regression per fastlane #29743 when any is omitted).
  const cliArgs = [
    'altool',
    '--upload-package',
    args.ipaPath,
    '--type',
    'ios',
    '--apple-id',
    args.ascAppId,
    '--bundle-id',
    args.bundleId,
    '--bundle-version',
    args.buildNumber,
    '--bundle-short-version-string',
    args.marketingVersion,
    '--api-key',
    args.keyId,
    '--api-issuer',
    args.issuerId,
    '--output-format',
    'json',
  ]
  const result = (await args.runner.exec('xcrun', cliArgs, { timeout: 900_000 })) as {
    exitCode: number
    stdout: string
    stderr: string
  }
  return parseAltoolOutput(result.stdout, result.stderr, result.exitCode)
}

/**
 * Phase 5 (Pitfall 7 / Q3): 3-tier error detection.
 * 1. JSON product-errors array (primary signal; stable across Xcode 14-26).
 * 2. ITMS-NNNNN regex on combined stdout+stderr (catches non-JSON + Xcode 26 quirks).
 * 3. ContentDelivery error regex (Xcode 26 silent-failure pattern — fastlane #29739).
 * Fallback: non-zero exit with no parseable error → generic failure.
 */
export function parseAltoolOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
): AltoolResult {
  // Primary: parse JSON. altool prepends progress lines before the final JSON payload, so
  // take the JSON starting at the last `{` in stdout.
  let jsonResult: {
    'tool-version'?: string
    'product-errors'?: Array<{ message: string; code?: number }>
  } | null = null
  try {
    const lastJsonStart = stdout.lastIndexOf('{')
    if (lastJsonStart >= 0) {
      jsonResult = JSON.parse(stdout.slice(lastJsonStart))
    }
  } catch {
    jsonResult = null
  }

  if (jsonResult?.['product-errors'] && jsonResult['product-errors'].length > 0) {
    return {
      success: false,
      errors: jsonResult['product-errors'].map((e) => ({
        message: e.message,
        code: e.code,
        itmsCode: extractItmsCode(e.message),
      })),
    }
  }

  const combined = `${stdout}\n${stderr}`

  // Secondary: ITMS regex on combined output.
  const itmsMatches = [...combined.matchAll(/ERROR\s+ITMS-(\d+)[^\n]*/g)]
  if (itmsMatches.length > 0) {
    return {
      success: false,
      errors: itmsMatches.map((m) => ({ message: m[0], itmsCode: `ITMS-${m[1]}` })),
    }
  }

  // Tertiary: Xcode 26 ContentDelivery ERROR (silent-failure pattern).
  const cdMatches = [...combined.matchAll(/ERROR:\s+\[ContentDelivery\.[^\]]+\][^\n]*/g)]
  if (cdMatches.length > 0) {
    return {
      success: false,
      errors: cdMatches.map((m) => ({ message: m[0] })),
    }
  }

  if (exitCode !== 0) {
    return {
      success: false,
      errors: [{ message: `altool exited ${exitCode} with no parseable error` }],
    }
  }
  return { success: true, toolVersion: jsonResult?.['tool-version'] ?? 'unknown' }
}

function extractItmsCode(msg: string): string | undefined {
  const m = msg.match(/ITMS-(\d+)/)
  return m ? `ITMS-${m[1]}` : undefined
}
