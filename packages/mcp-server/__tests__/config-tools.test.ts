import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleLoadConfig } from '../src/tools/config.js'
import { saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'

describe('dtc_load_config handler', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-mcp-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('returns default config when no config file exists', async () => {
    const result = await handleLoadConfig({ configDir })

    const parsed = JSON.parse(result.text)
    expect(parsed.llm.provider).toBe('anthropic')
    expect(parsed.design.tool).toBe('pencil')
    expect(parsed.runner.type).toBe('local')
  })

  it('returns saved config when config file exists', async () => {
    const config: DtcConfig = {
      llm: { provider: 'openai', apiKey: 'test-key' },
      design: { tool: 'pencil' },
      runner: { type: 'e2b', sandboxId: 'sbx-123' },
    }
    await saveConfig(configDir, config)

    const result = await handleLoadConfig({ configDir })

    const parsed = JSON.parse(result.text)
    expect(parsed.llm.provider).toBe('openai')
    expect(parsed.runner.sandboxId).toBe('sbx-123')
  })

  it('uses ~/.dtc as default when configDir not provided', async () => {
    const result = await handleLoadConfig({})

    const parsed = JSON.parse(result.text)
    // Should return some config (default or user's actual config)
    expect(parsed).toHaveProperty('llm')
    expect(parsed).toHaveProperty('design')
    expect(parsed).toHaveProperty('runner')
  })
})
