import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'

/** Phase 13 (QUALITY-03a): persisted shape of the preAgent snapshot sidecar. */
export interface SnapshotSidecarPayload {
  files: Record<string, string>
  sha256PerFile: Record<string, string>
  writtenAt: string // ISO-8601
}

/** Return shape for the writer — feeds the analysis checkpoint `data` payload. */
export interface SnapshotSidecarMetadata {
  path: string // relative path to dtcDir (e.g. 'snapshots/{runId}-preAgent.json'). Changed in Phase 24 (RESUME-02 / D-04); was absolute before.
  sha256: string // aggregate hash over sorted (path, sha256) tuples
  fileCount: number // snapshot.size at write time
}

/**
 * Phase 13: serialize the in-memory preAgent snapshot (Map<filePath, content>)
 * to `${dtcDir}/snapshots/${runId}-preAgent.json` with per-file sha256
 * entries and a deterministic aggregate hash.
 *
 * Runtime contract:
 *  - Creates the `snapshots/` subdir if absent.
 *  - Per-file sha256 = sha256(content).hex()
 *  - Aggregate sha256 = sha256(sorted `${path}\0${sha256PerFile[path]}\0` tuples).hex()
 *  - JSON body is written atomically: first to `${outPath}.tmp`, then renamed
 *    into place. POSIX `rename(2)` is atomic within a filesystem, so a crash
 *    mid-write leaves either the old file or the new file — never a truncated
 *    one. The analysis checkpoint row at cli/src/pipeline.ts:1588-1594 relies
 *    on this so `snapshotPath` + `snapshotSha256` cannot reference a corrupt
 *    sidecar on resume.
 *
 * runId MUST be a sanitized UUID (caller responsibility). See threat model T-13-10.
 */
export async function writePreAgentSnapshotSidecar(
  dtcDir: string,
  runId: string,
  snapshot: Map<string, string>,
): Promise<SnapshotSidecarMetadata> {
  const snapshotsDir = join(dtcDir, 'snapshots')
  await mkdir(snapshotsDir, { recursive: true })

  const files: Record<string, string> = {}
  const sha256PerFile: Record<string, string> = {}
  for (const [filePath, content] of snapshot) {
    files[filePath] = content
    sha256PerFile[filePath] = createHash('sha256').update(content).digest('hex')
  }

  // D-12: deterministic aggregate over sorted (path, sha) tuples
  const sortedPaths = Object.keys(sha256PerFile).sort()
  const aggregate = createHash('sha256')
  for (const p of sortedPaths) {
    aggregate.update(p)
    aggregate.update('\0')
    aggregate.update(sha256PerFile[p])
    aggregate.update('\0')
  }
  const aggregateHex = aggregate.digest('hex')

  const payload: SnapshotSidecarPayload = {
    files,
    sha256PerFile,
    writtenAt: new Date().toISOString(),
  }
  const outPath = join(snapshotsDir, `${runId}-preAgent.json`)
  // Phase 13 (WR-01): atomic write — temp path + POSIX rename so a crash
  // mid-write cannot leave a truncated JSON file that poisons analysis
  // resume. rename(2) is atomic within a filesystem.
  const tmpPath = `${outPath}.tmp`
  await writeFile(tmpPath, JSON.stringify(payload, null, 2))
  await rename(tmpPath, outPath)

  // Phase 24 (RESUME-02 / D-04): return relative path so checkpoint DB entries
  // survive project directory relocation.  Base = dtcDir because sidecar lives
  // inside dtcDir/snapshots/.  Result: 'snapshots/{runId}-preAgent.json'.
  return {
    path: relative(dtcDir, outPath),
    sha256: aggregateHex,
    fileCount: snapshot.size,
  }
}

// ── Phase 14 (QUALITY-03b/03c): Reader side ──────────────────────────────────

/**
 * Thrown when the sidecar JSON file is unreadable, unparseable, missing required
 * keys, or contains unsafe (absolute/traversal) path entries.
 */
export class SidecarCorruptError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message)
    this.name = 'SidecarCorruptError'
  }
}

/**
 * Read and validate a preAgent snapshot sidecar from an absolute path.
 * Mirrors the shape written by `writePreAgentSnapshotSidecar`.
 *
 * Security: rejects any path entry that is absolute or contains `..` segments
 * (path traversal). Throws `SidecarCorruptError` for any structural violation.
 */
export async function readPreAgentSnapshotSidecar(
  absolutePath: string,
): Promise<SnapshotSidecarPayload> {
  // Read file
  let raw: string
  try {
    raw = await readFile(absolutePath, 'utf-8')
  } catch (err) {
    throw new SidecarCorruptError(`Sidecar file not readable: ${String(err)}`, absolutePath)
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new SidecarCorruptError(
      `Sidecar JSON parse failed at ${absolutePath}: ${String(err)}`,
      absolutePath,
    )
  }

  // Validate required keys
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).files !== 'object' ||
    (parsed as Record<string, unknown>).files === null ||
    typeof (parsed as Record<string, unknown>).sha256PerFile !== 'object' ||
    (parsed as Record<string, unknown>).sha256PerFile === null ||
    typeof (parsed as Record<string, unknown>).writtenAt !== 'string'
  ) {
    throw new SidecarCorruptError(
      `Sidecar missing required keys (files/sha256PerFile/writtenAt) at ${absolutePath}`,
      absolutePath,
    )
  }

  const payload = parsed as SnapshotSidecarPayload

  // Path-traversal validation: reject absolute paths or `..` segments
  const allKeys = [...Object.keys(payload.files), ...Object.keys(payload.sha256PerFile)]
  for (const key of allKeys) {
    if (isAbsolute(key) || key.split('/').includes('..') || key.split('\\').includes('..')) {
      throw new SidecarCorruptError(
        `Sidecar contains unsafe path: ${key} at ${absolutePath}`,
        absolutePath,
      )
    }
  }

  return payload
}

/**
 * Recompute the aggregate sha256 from a sidecar payload.
 * Mirrors the writer algorithm byte-for-byte so results are comparable.
 * D-12: sha256 over sorted (path\0 + sha256PerFile[path]\0) tuples.
 */
export function recomputeAggregateSha256(payload: SnapshotSidecarPayload): string {
  const sortedPaths = Object.keys(payload.sha256PerFile).sort()
  const aggregate = createHash('sha256')
  for (const p of sortedPaths) {
    aggregate.update(p)
    aggregate.update('\0')
    aggregate.update(payload.sha256PerFile[p])
    aggregate.update('\0')
  }
  return aggregate.digest('hex')
}
