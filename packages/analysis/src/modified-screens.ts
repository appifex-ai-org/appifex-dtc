/**
 * Modified-screen detection for add-feature pipeline runs.
 *
 * Phase 11 (QUALITY-01a): diffs the post-codegen source tree against the pre-run
 * snapshot produced by cli/src/pipeline.ts::snapshotSourceFiles() and classifies
 * each screen as `added` (not in snapshot) or `modified` (SHA-256 changed).
 *
 * CRITICAL ORDERING: callers MUST run this AFTER revertUnexpectedChanges(),
 * otherwise out-of-plan agent edits show as false-positive modifications
 * (see 11-RESEARCH.md Pitfall 1).
 *
 * CRITICAL PATH NORMALIZATION: preSnapshot keys are ABSOLUTE paths (raw output
 * of runner.glob()) whereas InventoryEntry.filePath from scanProject() is RELATIVE
 * to outputDir. This module normalizes the snapshot side by stripping
 * `${outputDir}/` (see 11-RESEARCH.md Pitfall 2).
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { ModifiedScreens, Platform, Runner } from '@appifex/core'
import { scanProject } from './scanner.js'

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

export async function diffScreenInventory(
  outputDir: string,
  platform: Platform,
  runner: Runner,
  preSnapshot: Map<string, string>,
): Promise<ModifiedScreens> {
  // Step 1: Re-scan post-codegen tree
  const inventory = await scanProject(outputDir, platform, runner)
  const screenEntries = inventory.filter((e) => e.type === 'screen')

  // Step 2: Build relPath -> screenName for post-codegen screens
  const newScreenMap = new Map<string, string>()
  for (const entry of screenEntries) {
    newScreenMap.set(entry.filePath, entry.name)
  }

  // Step 3: Normalize preSnapshot keys: absolute -> relative (strip outputDir prefix).
  // Handles both POSIX and trailing-slash normalization.
  const prefix = outputDir.endsWith('/') ? outputDir : outputDir + '/'
  const snapshotHashes = new Map<string, string>() // relPath -> sha256
  for (const [absPath, content] of preSnapshot) {
    const relPath = absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath
    snapshotHashes.set(relPath, sha256Hex(content))
  }

  // Step 4: Classify each post-codegen screen
  const added: string[] = []
  const modified: string[] = []

  for (const [relPath, screenName] of newScreenMap) {
    if (!snapshotHashes.has(relPath)) {
      added.push(screenName)
      continue
    }
    const absPath = join(outputDir, relPath)
    let currentContent = ''
    try {
      currentContent = await runner.readFile(absPath)
    } catch {
      // File disappeared between scan and readFile — treat as unchanged; callers
      // don't classify deletions in Phase 11 (D-07 out of scope).
      continue
    }
    if (sha256Hex(currentContent) !== snapshotHashes.get(relPath)) {
      modified.push(screenName)
    }
  }

  return { added, modified }
}
