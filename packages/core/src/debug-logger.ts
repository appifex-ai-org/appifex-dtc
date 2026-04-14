import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface DebugLogger {
  /** Log a debug entry to a named file in the debug directory */
  log(name: string, content: string): Promise<void>
  /** Log a JSON object */
  logJson(name: string, data: unknown): Promise<void>
  /** Whether verbose mode is enabled */
  enabled: boolean
}

export function createDebugLogger(outputDir: string, enabled: boolean): DebugLogger {
  const debugDir = join(outputDir, '.dtc-debug')
  let dirCreated = false

  async function ensureDir() {
    if (!dirCreated) {
      await mkdir(debugDir, { recursive: true })
      dirCreated = true
    }
  }

  return {
    enabled,
    async log(name: string, content: string) {
      if (!enabled) return
      await ensureDir()
      await writeFile(join(debugDir, name), content, 'utf-8')
    },
    async logJson(name: string, data: unknown) {
      if (!enabled) return
      await ensureDir()
      await writeFile(join(debugDir, name), JSON.stringify(data, null, 2), 'utf-8')
    },
  }
}
