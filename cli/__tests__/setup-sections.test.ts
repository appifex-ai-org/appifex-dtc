// Phase 03 Plan 03 (SETUP-01, D-09): tests for sectioned setup wizard
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// NOTE: vi.mock is hoisted to top of file — factory must not reference outer variables.
vi.mock('@clack/prompts', () => ({
  select: vi.fn().mockResolvedValue('anthropic'),
  text: vi.fn().mockResolvedValue('default-text'),
  password: vi.fn().mockResolvedValue('sk-ant-new'),
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

// ── shared.ts tests ────────────────────────────────────────────────────────
describe('derivedSlug', () => {
  it('Test 1: removes special chars and lowercases', async () => {
    const { derivedSlug } = await import('../src/setup/shared.js')
    expect(derivedSlug('Coffee Tracker!!!')).toBe('coffee-tracker')
  })

  it('Test 2: strips non-ascii, result contains only [a-z0-9-] and <=20 chars', async () => {
    const { derivedSlug } = await import('../src/setup/shared.js')
    const result = derivedSlug('日本語テスト', 20)
    expect(result).toMatch(/^[a-z0-9-]*$/)
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('Test 3: trims leading/trailing hyphens and collapses duplicates', async () => {
    const { derivedSlug } = await import('../src/setup/shared.js')
    expect(derivedSlug('--ab-cd--')).toBe('ab-cd')
  })
})

describe('firebaseProjectIdFromSlug', () => {
  it('Test 4: returns string matching /^[a-z][a-z0-9-]{5,29}$/', async () => {
    const { firebaseProjectIdFromSlug } = await import('../src/setup/shared.js')
    const result = firebaseProjectIdFromSlug('coffee-tracker')
    expect(result).toMatch(/^[a-z][a-z0-9-]{5,29}$/)
  })

  it('Test 5: prepends app- when slug starts with digit', async () => {
    const { firebaseProjectIdFromSlug } = await import('../src/setup/shared.js')
    const result = firebaseProjectIdFromSlug('123-numeric-start')
    expect(result.startsWith('app-')).toBe(true)
  })
})

describe('assertNotCancelled', () => {
  it('Test 6: throws ConfigError when given a symbol (cancel sentinel)', async () => {
    const { assertNotCancelled } = await import('../src/setup/shared.js')
    const { ConfigError } = await import('@appifex/core')
    expect(() => assertNotCancelled(Symbol('cancel'))).toThrow(ConfigError)
  })

  it('passes through when given a non-symbol value', async () => {
    const { assertNotCancelled } = await import('../src/setup/shared.js')
    expect(() => assertNotCancelled('some string')).not.toThrow()
    expect(() => assertNotCancelled(42)).not.toThrow()
    expect(() => assertNotCancelled(false)).not.toThrow()
  })
})

// ── runLlmSection tests ────────────────────────────────────────────────────
describe('runLlmSection', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-setup-llm-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('Test 7: preserves existing LLM wizard flow — saveConfig called with merged config', async () => {
    const { saveConfig, loadConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-old', model: 'claude-3' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    // select returns provider ('anthropic'), then model ('claude-sonnet-4-20250514')
    const clack = await import('@clack/prompts')
    vi.mocked(clack.select)
      .mockResolvedValueOnce('anthropic')
      .mockResolvedValueOnce('claude-sonnet-4-20250514')

    const { runLlmSection } = await import('../src/setup/llm.js')
    const existingConfig = await loadConfig(configDir)
    await runLlmSection(configDir, existingConfig)

    const updatedConfig = await loadConfig(configDir)
    expect(updatedConfig.llm).toBeDefined()
    expect(updatedConfig.llm.provider).toBe('anthropic')
  })
})

// ── setupWizard ordering tests ────────────────────────────────────────────
describe('setupWizard section ordering', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-setup-order-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('Test 8: calls sections in order: project -> llm -> design -> runner -> apple -> android -> deliver -> budget -> oauth', async () => {
    const { saveConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    const callOrder: string[] = []

    // Spy on SECTIONS object directly — no vi.doMock needed, no module state leakage.
    const indexMod = await import('../src/setup/index.js')
    const sectionNames = indexMod.SECTION_ORDER

    for (const name of sectionNames) {
      vi.spyOn(indexMod.SECTIONS, name).mockImplementation(async () => {
        callOrder.push(name)
      })
    }

    await indexMod.setupWizard(configDir)

    expect(callOrder).toEqual(['project', 'llm', 'design', 'runner', 'firebase', 'apple', 'android', 'deliver', 'budget', 'oauth'])
  })
})

// ── runProjectSection tests ────────────────────────────────────────────────
describe('runProjectSection', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-setup-project-'))
    // Reset modules so we get real implementations (not mocks from ordering tests)
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    vi.resetModules()
  })

  it('Test 9: persists appName + projectDir to cfg.project when caller-provided (skips prompts)', async () => {
    // Tests the pre-supplied opts path of runProjectSection.
    // This path bypasses all prompts and directly saves the values.
    // The prompt path is separately verified by the debug-test.test.ts in isolation.
    const { saveConfig, loadConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    // Import after resetModules to get fresh (real) module
    const { runProjectSection } = await import('../src/setup/project.js')
    const existingConfig = await loadConfig(configDir)
    // Use the caller-provided opts path — no prompts needed
    await runProjectSection(configDir, existingConfig, {
      appName: 'My App',
      projectDir: '/tmp/my-project',
    })

    const updated = await loadConfig(configDir)
    expect(updated.project).toBeDefined()
    expect(updated.project!.appName).toBe('My App')
    expect(updated.project!.projectDir).toBe('/tmp/my-project')
  })

  it('Test 10: setupWizard skips project section when appName and projectDir are pre-supplied', async () => {
    const { saveConfig } = await import('@appifex/core')
    await saveConfig(configDir, {
      llm: { provider: 'anthropic', apiKey: 'sk-test' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    })

    // Spy on SECTIONS directly — avoids vi.doMock module leakage.
    const indexMod = await import('../src/setup/index.js')
    const projectSpy = vi.spyOn(indexMod.SECTIONS, 'project').mockResolvedValue(undefined)
    // Stub other sections to no-ops so we don't need real prompts
    for (const name of indexMod.SECTION_ORDER) {
      if (name !== 'project') {
        vi.spyOn(indexMod.SECTIONS, name).mockResolvedValue(undefined)
      }
    }

    await indexMod.setupWizard(configDir, { appName: 'X', projectDir: '/y' })

    // Project section should NOT be called when both values are pre-supplied
    expect(projectSpy).not.toHaveBeenCalled()
  })
})
