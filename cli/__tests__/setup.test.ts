import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runSetup } from '../src/setup.js'
import type { DtcConfig } from '@appifex/core'

describe('runSetup', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-setup-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('saves config from user selections', async () => {
    const answers = {
      llmProvider: 'anthropic' as const,
      llmApiKey: 'sk-ant-test',
      designTool: 'pencil' as const,
      runnerType: 'local' as const,
    }

    await runSetup(configDir, answers)

    const raw = readFileSync(join(configDir, 'config.json'), 'utf-8')
    const config: DtcConfig = JSON.parse(raw)

    expect(config.llm.provider).toBe('anthropic')
    expect(config.llm.apiKey).toBe('sk-ant-test')
    expect(config.design.tool).toBe('pencil')
    expect(config.runner.type).toBe('local')
  })

  it('saves E2B config with sandbox ID', async () => {
    const answers = {
      llmProvider: 'openai' as const,
      llmApiKey: 'sk-openai',
      designTool: 'stitch' as const,
      runnerType: 'e2b' as const,
      sandboxId: 'sbx-123',
    }

    await runSetup(configDir, answers)

    const config: DtcConfig = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8'))
    expect(config.runner.type).toBe('e2b')
    expect(config.runner.sandboxId).toBe('sbx-123')
  })

  it('saves remote runner config with URL and token', async () => {
    const answers = {
      llmProvider: 'anthropic' as const,
      llmApiKey: 'key',
      designTool: 'pencil' as const,
      runnerType: 'remote' as const,
      runnerUrl: 'https://mac.local:8443',
      runnerToken: 'amr_tok',
    }

    await runSetup(configDir, answers)

    const config: DtcConfig = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8'))
    expect(config.runner.runnerUrl).toBe('https://mac.local:8443')
    expect(config.runner.runnerToken).toBe('amr_tok')
  })

  it('saves Apple config when provided', async () => {
    const answers = {
      llmProvider: 'anthropic' as const,
      llmApiKey: 'key',
      designTool: 'pencil' as const,
      runnerType: 'local' as const,
      appleTeamId: 'TEAM123',
      appleBundleId: 'com.example.app',
      ascKeyId: 'KEY1',
      ascIssuerId: 'ISS1',
      ascKeyPath: '/keys/auth.p8',
    }

    await runSetup(configDir, answers)

    const config: DtcConfig = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8'))
    expect(config.apple).toBeDefined()
    expect(config.apple!.teamId).toBe('TEAM123')
    expect(config.apple!.ascKeyId).toBe('KEY1')
  })

  it('saves token budget config', async () => {
    const answers = {
      llmProvider: 'anthropic' as const,
      llmApiKey: 'key',
      designTool: 'pencil' as const,
      runnerType: 'local' as const,
      tokenBudget: 100_000,
    }

    await runSetup(configDir, answers)

    const config: DtcConfig = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8'))
    expect(config.tokenBudget).toBeDefined()
    expect(config.tokenBudget!.total).toBe(100_000)
  })
})
