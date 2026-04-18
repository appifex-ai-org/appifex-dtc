/**
 * Phase 7 (MCP-03 D-09..D-12): .dtc-manifest.json read/write/diff.
 *
 * The manifest is written once per run after codegen (before build). It lists every
 * file the pipeline wrote, with sha256 for later user-edit detection. On pipeline
 * start, a diff vs on-disk state distinguishes "user-edited since last run" (skip-
 * with-warning default) from "unchanged" (safe to overwrite).
 *
 * Security: entry.path is pipeline-controlled but stored on disk and re-read on the
 * next run. Path normalization + contains-check defends against tampering (rejects
 * `..` segments + absolute paths).
 */
import { readFile, writeFile, rename, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute, join, normalize, sep } from 'node:path'
import type { PhaseId } from './types.js'

export const MANIFEST_FILENAME = '.dtc-manifest.json'

/**
 * Paths matching any of these globs are never written to the manifest.
 * D-12 from 07-CONTEXT.md. Globs are matched against the relative path (using '/' separator).
 * Checked via simple prefix / suffix / segment rules (no external glob lib).
 */
export const MANIFEST_EXCLUDE_GLOBS: readonly string[] = [
  '.dtc/**',
  '.dtc-debug/**',
  '.dtc-report/**',
  '.git/**',
  'node_modules/**',
  'Pods/**',
  'DerivedData/**',
  '*.xcodeproj/**',
  '*.xcworkspace/**',
  'GoogleService-Info.plist',
]

export interface ManifestEntry {
  /** Relative path from outputDir. MUST NOT contain '..' segments or be absolute. */
  path: string
  /** sha256 hex of file contents at generation time. */
  sha256: string
  /** ISO timestamp for when this file was last written by the pipeline. */
  generatedAt: string
  /** Phase that last wrote this file. */
  phase: PhaseId
}

export interface Manifest {
  manifestVersion: 1
  generatedAt: string
  runId: string
  entries: ManifestEntry[]
}

export interface ManifestDiff {
  userEdited: string[]  // paths in manifest whose on-disk sha256 no longer matches
  missing: string[]     // paths in manifest that are no longer on disk
}

/** Reject absolute paths and `..` segments. Return normalized forward-slash path. */
function validateRelativePath(p: string): string {
  if (isAbsolute(p)) {
    throw new Error(`Manifest path must be relative, got: ${p}`)
  }
  const normalized = normalize(p).split(sep).join('/')
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    throw new Error(`Manifest path must not contain '..' segments: ${p}`)
  }
  return normalized
}

/** Test whether a relative path matches any MANIFEST_EXCLUDE_GLOBS entry. */
export function isExcluded(relativePath: string): boolean {
  const p = relativePath.split(sep).join('/')
  for (const glob of MANIFEST_EXCLUDE_GLOBS) {
    if (glob.endsWith('/**')) {
      const prefix = glob.slice(0, -3) // strip '/**'
      // '*.xcodeproj/**' → any segment ending with .xcodeproj
      if (prefix.startsWith('*.')) {
        const ext = prefix.slice(1) // '.xcodeproj'
        if (p.split('/').some((seg) => seg.endsWith(ext))) return true
      } else if (p === prefix || p.startsWith(prefix + '/')) {
        return true
      }
    } else if (glob === p) {
      return true
    } else if (glob.startsWith('*.') && p.split('/').pop()?.endsWith(glob.slice(1))) {
      return true
    }
  }
  return false
}

export async function computeSha256(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Structural validation: returns null if the file is missing, unreadable,
 * corrupt, or version-mismatched. Also rejects manifests with tampered paths.
 * Precedent: packages/core/src/run-context.ts:17-29 (JSON load with validation + null fallback).
 */
export async function readManifest(outputDir: string): Promise<Manifest | null> {
  try {
    const raw = await readFile(join(outputDir, MANIFEST_FILENAME), 'utf-8')
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      parsed.manifestVersion !== 1 ||
      typeof parsed.generatedAt !== 'string' ||
      typeof parsed.runId !== 'string' ||
      !Array.isArray(parsed.entries)
    ) {
      return null
    }
    for (const e of parsed.entries) {
      if (
        typeof e?.path !== 'string' ||
        typeof e?.sha256 !== 'string' ||
        typeof e?.generatedAt !== 'string' ||
        typeof e?.phase !== 'string'
      ) {
        return null
      }
      // Path guard — reject tampered manifest (T-07-03-01, T-07-03-02)
      if (isAbsolute(e.path) || e.path.includes('..')) return null
    }
    // Filter excluded paths from read manifest so they are never returned
    const filtered: Manifest = {
      ...parsed,
      entries: (parsed.entries as ManifestEntry[]).filter((e) => !isExcluded(e.path)),
    }
    return filtered
  } catch {
    return null
  }
}

/**
 * Atomic write — tmp + rename. Precedent: packages/core/src/snapshot-sidecar.ts:68-74.
 * Throws on invalid entry paths so tampered inputs never land on disk.
 * Also filters excluded paths before writing (D-12).
 */
export async function writeManifest(outputDir: string, manifest: Manifest): Promise<void> {
  const normalized: Manifest = {
    manifestVersion: 1,
    generatedAt: manifest.generatedAt,
    runId: manifest.runId,
    entries: manifest.entries
      .filter((e) => !isExcluded(e.path))
      .map((e) => ({
        ...e,
        path: validateRelativePath(e.path),
      })),
  }
  const out = join(outputDir, MANIFEST_FILENAME)
  const tmp = `${out}.tmp`
  await writeFile(tmp, JSON.stringify(normalized, null, 2), 'utf-8')
  await rename(tmp, out)
}

export async function diffManifest(
  outputDir: string,
  manifest: Manifest,
): Promise<ManifestDiff> {
  const userEdited: string[] = []
  const missing: string[] = []
  for (const entry of manifest.entries) {
    const full = join(outputDir, entry.path)
    try {
      await stat(full)
    } catch {
      missing.push(entry.path)
      continue
    }
    const actual = await computeSha256(full)
    if (actual !== entry.sha256) userEdited.push(entry.path)
  }
  return { userEdited, missing }
}
