import { copyFile, access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const CONTEXT_DIR = '.dtc'
const CONTEXT_FILE = 'run-context.json'

/** Copy run-context.json to a timestamped backup. No-op if no context exists. */
export async function backupRunContext(outputDir: string): Promise<string | null> {
  const dir = join(outputDir, CONTEXT_DIR)
  const src = join(dir, CONTEXT_FILE)
  try {
    await access(src)
  } catch {
    return null // no existing context — nothing to back up
  }
  await mkdir(dir, { recursive: true })
  // ISO 8601 timestamp with colons/dots replaced for filename safety (per Pitfall 5)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(dir, `run-context.${ts}.json`)
  await copyFile(src, dest)
  return dest
}
