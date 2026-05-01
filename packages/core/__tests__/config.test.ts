import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Will import from src once implemented
import { loadConfig, saveConfig } from '../src/config.js'
import type { DtcConfig } from '../src/types.js'

describe('config', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-test-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('returns default config when no file exists', async () => {
    const config = await loadConfig(configDir)

    expect(config).toEqual({
      llm: { provider: 'anthropic', apiKey: '' },
      design: { tool: 'prompt' },
      runner: { type: 'local' },
    })
  })

  it('loads config from config.json in the given directory', async () => {
    const custom: DtcConfig = {
      llm: { provider: 'openai', apiKey: 'sk-test-123' },
      design: { tool: 'stitch', apiKey: 'stitch-key' },
      runner: { type: 'e2b', sandboxId: 'sandbox-abc' },
    }

    await saveConfig(configDir, custom)
    const loaded = await loadConfig(configDir)

    expect(loaded).toEqual(custom)
  })

  it('saves config as JSON to config.json', async () => {
    const config: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-ant-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }

    await saveConfig(configDir, config)

    const raw = readFileSync(join(configDir, 'config.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed).toEqual(config)
  })

  it('creates the config directory if it does not exist', async () => {
    const nested = join(configDir, 'nested', 'deep')
    const config: DtcConfig = {
      llm: { provider: 'google', apiKey: 'gkey' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }

    await saveConfig(nested, config)
    const loaded = await loadConfig(nested)

    expect(loaded).toEqual(config)
  })

  it('merges partial config with defaults', async () => {
    // Save a config with only llm set
    const partial = { llm: { provider: 'openai' as const, apiKey: 'key' } }
    await saveConfig(configDir, partial as DtcConfig)

    const loaded = await loadConfig(configDir)
    // Should have the saved llm but defaults for the rest
    expect(loaded.llm).toEqual({ provider: 'openai', apiKey: 'key' })
    expect(loaded.design).toEqual({ tool: 'prompt' })
    expect(loaded.runner).toEqual({ type: 'local' })
  })
})
