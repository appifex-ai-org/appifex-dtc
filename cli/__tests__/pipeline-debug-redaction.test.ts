import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDebugLogger, type DtcConfig } from '@appifex/core'
import { redactConfigForDebug } from '../src/pipeline.js'

function baseConfig(): DtcConfig {
  return {
    llm: {
      provider: 'anthropic',
      apiKey: 'sk-live-llm-secret',
      githubToken: 'ghp_live_github_token',
      model: 'claude-sonnet-4-6',
    },
    design: {
      tool: 'pencil',
      mcpUrl: 'http://localhost:4000',
      apiKey: 'pencil-live-secret',
      figmaFileUrl: 'https://figma.com/file/abc',
      figmaToken: 'figd_live_figma_token',
    },
    runner: { type: 'local' },
  }
}

describe('redactConfigForDebug', () => {
  it('redacts all four secret fields when present', () => {
    const cfg = baseConfig()
    const redacted = redactConfigForDebug(cfg)

    expect(redacted.llm.apiKey).toBe('***')
    expect(redacted.llm.githubToken).toBe('***')
    expect(redacted.design.apiKey).toBe('***')
    expect(redacted.design.figmaToken).toBe('***')
  })

  it('does not introduce optional secret fields when they are absent', () => {
    const cfg: DtcConfig = {
      llm: {
        provider: 'anthropic',
        apiKey: 'sk-live',
        // githubToken absent
      },
      design: {
        tool: 'pencil',
        // apiKey absent
        // figmaToken absent
      },
      runner: { type: 'local' },
    }
    const redacted = redactConfigForDebug(cfg)

    // Present fields redacted
    expect(redacted.llm.apiKey).toBe('***')
    // Absent fields stay absent — no placeholder injected
    expect('githubToken' in redacted.llm).toBe(false)
    expect('apiKey' in redacted.design).toBe(false)
    expect('figmaToken' in redacted.design).toBe(false)
  })

  it('passes through non-secret fields unchanged', () => {
    const cfg = baseConfig()
    const redacted = redactConfigForDebug(cfg)

    expect(redacted.llm.provider).toBe('anthropic')
    expect(redacted.llm.model).toBe('claude-sonnet-4-6')
    expect(redacted.design.tool).toBe('pencil')
    expect(redacted.design.mcpUrl).toBe('http://localhost:4000')
    expect(redacted.design.figmaFileUrl).toBe('https://figma.com/file/abc')
    expect(redacted.runner.type).toBe('local')
  })

  it('does not mutate the input config (original secrets still live)', () => {
    const cfg = baseConfig()
    redactConfigForDebug(cfg)

    expect(cfg.llm.apiKey).toBe('sk-live-llm-secret')
    expect(cfg.llm.githubToken).toBe('ghp_live_github_token')
    expect(cfg.design.apiKey).toBe('pencil-live-secret')
    expect(cfg.design.figmaToken).toBe('figd_live_figma_token')
  })
})

describe('redactConfigForDebug — round trip via DebugLogger.logJson', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dtc-redaction-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a redacted config.json under .dtc-debug/', async () => {
    const debug = createDebugLogger(tmpDir, true)
    const cfg = baseConfig()

    await debug.logJson('config.json', redactConfigForDebug(cfg))

    const raw = await readFile(join(tmpDir, '.dtc-debug', 'config.json'), 'utf8')
    const parsed = JSON.parse(raw) as DtcConfig
    expect(parsed.llm.apiKey).toBe('***')
    expect(parsed.llm.githubToken).toBe('***')
    expect(parsed.design.apiKey).toBe('***')
    expect(parsed.design.figmaToken).toBe('***')
    // Non-secret still present
    expect(parsed.llm.provider).toBe('anthropic')
    expect(parsed.design.tool).toBe('pencil')
  })
})
