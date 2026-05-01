import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import type { DtcConfig } from './types.js'

const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: DtcConfig = {
  llm: { provider: 'anthropic', apiKey: '' },
  design: { tool: 'prompt' },
  runner: { type: 'local' },
}

export async function loadConfig(configDir: string): Promise<DtcConfig> {
  try {
    const raw = await readFile(join(configDir, CONFIG_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DtcConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(configDir: string, config: DtcConfig): Promise<void> {
  await mkdir(configDir, { recursive: true })
  const p = join(configDir, CONFIG_FILE)
  await writeFile(p, JSON.stringify(config, null, 2), 'utf-8')
  // Phase 03 Plan 01 (SETUP-02, RESEARCH Pitfall 8): chmod 0600 prevents world-readable leak
  // of API keys in ~/.dtc/config.json. Soft-fail on exotic filesystems (e.g. FAT32 mounts).
  try {
    await chmod(p, 0o600)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn(`[dtc] Warning: could not set config.json permissions to 0600: ${String(err)}`)
    }
  }
}
