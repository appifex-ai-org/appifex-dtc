// Phase 03 Plan 03 (SETUP-01, D-07, D-10): tests for oauth section and setup command surface
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// NOTE: vi.mock is hoisted — factory must not reference outer variables.
vi.mock('@clack/prompts', () => ({
  select: vi.fn().mockResolvedValue('internal'),
  text: vi.fn().mockResolvedValue(''),
  password: vi.fn().mockResolvedValue('secret'),
  confirm: vi.fn().mockResolvedValue(false),
  isCancel: vi.fn().mockReturnValue(false),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  group: vi.fn().mockResolvedValue({ sandboxId: 'sbx-1', url: 'http://x', token: 'tok' }),
}))

// ── runOauthSection tests ────────────────────────────────────────────────
describe('runOauthSection', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-oauth-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('Test 1: early return when user answers No to Apple Sign In', async () => {
    const { saveConfig, loadConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    const clack = await import('@clack/prompts')
    vi.mocked(clack.confirm).mockResolvedValueOnce(false)

    const { runOauthSection } = await import('../src/setup/oauth.js')
    const cfg = await loadConfig(configDir)
    await runOauthSection(configDir, cfg)

    const updated = await loadConfig(configDir)
    expect(updated.oauth).toBeUndefined()
  })

  it('Test 2: Yes path writes oauth.apple config via saveConfig', async () => {
    const { saveConfig, loadConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    const clack = await import('@clack/prompts')
    vi.mocked(clack.confirm).mockResolvedValueOnce(true)
    vi.mocked(clack.group).mockResolvedValueOnce({
      servicesId: 'com.example.app.siwa',
      teamId: 'ABCDE12345',
      keyId: 'FGHIJ67890',
      p8Path: '/keys/AuthKey.p8',
    })

    const { runOauthSection } = await import('../src/setup/oauth.js')
    const cfg = await loadConfig(configDir)
    await runOauthSection(configDir, cfg)

    const updated = await loadConfig(configDir)
    expect(updated.oauth?.apple?.servicesId).toBe('com.example.app.siwa')
    expect(updated.oauth?.apple?.teamId).toBe('ABCDE12345')
    expect(updated.oauth?.apple?.keyId).toBe('FGHIJ67890')
    expect(updated.oauth?.apple?.p8Path).toBe('/keys/AuthKey.p8')
  })

  it('Test 3: ConfigError thrown when user cancels at confirm prompt', async () => {
    const { saveConfig, loadConfig, ConfigError } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    const clack = await import('@clack/prompts')
    // Return cancel symbol from confirm — assertNotCancelled should throw
    const cancelSymbol = Symbol('cancel')
    vi.mocked(clack.confirm).mockResolvedValueOnce(cancelSymbol as unknown as boolean)
    vi.mocked(clack.isCancel).mockReturnValue(true)

    const { runOauthSection } = await import('../src/setup/oauth.js')
    const cfg = await loadConfig(configDir)
    await expect(runOauthSection(configDir, cfg)).rejects.toThrow(ConfigError)
  })
})
