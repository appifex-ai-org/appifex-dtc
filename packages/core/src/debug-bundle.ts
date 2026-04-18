/**
 * Phase 7 (OBS-03 D-16): streaming zip writer for failed-run debug bundles.
 *
 * Scrubs text files for credentials before adding them to the zip. Binary files
 * (checkpoint.db, images) are copied unchanged — they should never contain secrets
 * by schema design (CheckpointData stores paths/counts/statuses only).
 *
 * Secret scrubbing is defense-in-depth. The primary control remains
 * "secrets only live in ~/.dtc/config.json" — this is the safety net.
 */
import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { readFile, readdir, stat, mkdir } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

/** Regex patterns that mark text as potentially containing a credential. */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /"?apiKey"?\s*[:=]\s*['"][^'"]+['"]/gi,
  /"?private_key"?\s*[:=]\s*['"][^'"]+['"]/gi,
  /asc_?key/gi,
  /service_account/gi,
  /sk-ant-[a-zA-Z0-9_-]{10,}/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END[^-]*-----/g,
  /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
]

const TEXT_EXTENSIONS = new Set(['.json', '.log', '.txt', '.md', '.yaml', '.yml', '.jsonl'])

export function scrub(content: string): string {
  let out = content
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, '[REDACTED]')
  }
  return out
}

/** Recursively list absolute file paths under `dir`. Swallows ENOENT. */
async function listFilesRecursive(dir: string): Promise<string[]> {
  let results: string[] = []
  let entryNames: string[] = []
  try {
    entryNames = await readdir(dir)
  } catch {
    return results
  }
  for (const name of entryNames) {
    const full = join(dir, name)
    let s
    try {
      s = await stat(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      results = results.concat(await listFilesRecursive(full))
    } else if (s.isFile()) {
      results.push(full)
    }
  }
  return results
}

function isTextFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase())
}

export interface WriteDebugBundleOptions {
  reason?: 'failure' | 'user-export'
  extraFiles?: string[]
}

/**
 * Write a timestamped zip to `.dtc-debug/bundle-<ts>.zip`. Returns the absolute path.
 *
 * Pitfall 4: zlib level 6 (default), not 9 — user cares about exit speed over size.
 */
export async function writeDebugBundle(
  outputDir: string,
  options: WriteDebugBundleOptions = {},
): Promise<string> {
  const reason = options.reason ?? 'failure'
  const debugDir = join(outputDir, '.dtc-debug')
  await mkdir(debugDir, { recursive: true })

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const bundlePath = join(debugDir, `bundle-${ts}.zip`)

  const output = createWriteStream(bundlePath)
  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.pipe(output)

  // 1. All files under .dtc-debug/, scrubbed (text) or copied (binary)
  const debugFiles = await listFilesRecursive(debugDir)
  for (const f of debugFiles) {
    if (f === bundlePath) continue  // don't include our own output
    const raw = await readFile(f)
    const name = `debug/${relative(debugDir, f).split(/[\\/]/).join('/')}`
    if (isTextFile(f)) {
      archive.append(scrub(raw.toString('utf8')), { name })
    } else {
      archive.append(raw, { name })
    }
  }

  // 2. Auxiliary files (run-context, checkpoint, report) — scrubbed if text
  const aux = [
    '.dtc/run-context.json',
    '.dtc/checkpoint.db',
    '.dtc-report/report.json',
    '.dtc-report/report.md',
    ...(options.extraFiles ?? []),
  ]
  for (const rel of aux) {
    const full = join(outputDir, rel)
    try {
      await stat(full)
      const raw = await readFile(full)
      if (isTextFile(full)) {
        archive.append(scrub(raw.toString('utf8')), { name: rel })
      } else {
        archive.append(raw, { name: rel })
      }
    } catch {
      // file not present — skip silently (common: no report.json on very early failure)
    }
  }

  // 3. Provenance manifest
  const manifestText =
    `bundle generated: ${new Date().toISOString()}\n` +
    `reason: ${reason}\n` +
    `output dir: ${outputDir}\n`
  archive.append(manifestText, { name: 'manifest.txt' })

  await archive.finalize()
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve())
    output.on('error', reject)
  })

  return bundlePath
}
