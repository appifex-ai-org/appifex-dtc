import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DtcConfig } from './types.js'

const CONFIG_FILE = 'config.json'

const DEFAULT_CONFIG: DtcConfig = {
  llm: { provider: 'anthropic', apiKey: '' },
  design: { tool: 'pencil' },
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
  await writeFile(join(configDir, CONFIG_FILE), JSON.stringify(config, null, 2), 'utf-8')
}
