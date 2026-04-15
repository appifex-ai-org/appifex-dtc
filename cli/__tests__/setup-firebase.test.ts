// Phase 03 Plan 04 (SETUP-04): unit tests for runFirebaseSection (mocked subprocess).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  isCancel: vi.fn().mockReturnValue(false),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal DtcConfig for tests */
function makeConfig(overrides: Record<string, unknown> = {}): import('@appifex/core').DtcConfig {
  return {
    llm: { provider: 'anthropic', apiKey: 'sk-test' },
    design: { tool: 'pencil' },
    runner: { type: 'local' },
    ...overrides,
  } as import('@appifex/core').DtcConfig
}

/** Success spawnSync result */
function okResult(stdout = '{}', stderr = ''): ReturnType<typeof import('node:child_process').spawnSync> {
  return { status: 0, stdout, stderr, pid: 1, output: [], signal: null } as ReturnType<typeof import('node:child_process').spawnSync>
}

/** Failure spawnSync result */
function failResult(stderr = 'error', stdout = ''): ReturnType<typeof import('node:child_process').spawnSync> {
  return { status: 1, stdout, stderr, pid: 1, output: [], signal: null } as ReturnType<typeof import('node:child_process').spawnSync>
}

const CREATE_JSON = JSON.stringify({ result: { projectId: 'coffee-tracker-a1b2' } })
const APP_JSON = JSON.stringify({ result: { appId: '1:123:ios:abc456' } })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runFirebaseSection', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-firebase-'))
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it('Test 1: skips when baas.provider is supabase', async () => {
    const { spawnSync } = await import('node:child_process')
    const { runFirebaseSection } = await import('../src/setup/firebase.js')

    const cfg = makeConfig({ baas: { provider: 'supabase' } })
    await runFirebaseSection(configDir, cfg, { appName: 'MyApp', projectDir: '/tmp/proj' })

    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled()
  })

  it('Test 2: throws ConfigError when firebase CLI is not installed', async () => {
    // Mock which() to return false for firebase
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(false) }
    })

    const { ConfigError } = await import('@appifex/core')
    const { runFirebaseSection } = await import('../src/setup/firebase.js')

    await expect(
      runFirebaseSection(configDir, makeConfig(), { appName: 'MyApp', projectDir: '/tmp/proj' }),
    ).rejects.toThrow(ConfigError)
  })

  it('Test 3: login gate — runs firebase login when login:list fails, throws if login fails too', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    vi.mocked(text)
      .mockResolvedValueOnce('my-app-a1b2')  // projectId
      .mockResolvedValueOnce('com.appifex.myapp')  // bundleId

    // login:list fails, login --no-localhost also fails
    vi.mocked(spawnSync)
      .mockReturnValueOnce(failResult('not logged in'))  // login:list
      .mockReturnValueOnce(failResult('login failed'))   // login --no-localhost

    const { ConfigError } = await import('@appifex/core')
    const { runFirebaseSection } = await import('../src/setup/firebase.js')

    await expect(
      runFirebaseSection(configDir, makeConfig(), { appName: 'My App', projectDir: '/tmp/proj' }),
    ).rejects.toThrow(ConfigError)

    // Verify login was invoked with stdio: 'inherit' (Test 10 overlap)
    const loginCall = vi.mocked(spawnSync).mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes('login') && !c[1].includes('login:list'),
    )
    expect(loginCall).toBeDefined()
    expect((loginCall![2] as { stdio?: unknown }).stdio).toBe('inherit')
  })

  it('Test 4: project create success — saves projectId to config', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    vi.mocked(text)
      .mockResolvedValueOnce('coffee-tracker-a1b2')
      .mockResolvedValueOnce('com.appifex.coffeetracker')

    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('sevenray@gmail.com'))  // login:list
      .mockReturnValueOnce(okResult(CREATE_JSON))            // projects:create
      .mockReturnValueOnce(okResult(APP_JSON))               // apps:create
      .mockReturnValueOnce(okResult())                       // apps:sdkconfig

    const { loadConfig, saveConfig } = await import('@appifex/core')
    const existingCfg = makeConfig()
    await saveConfig(configDir, existingCfg)

    const { runFirebaseSection } = await import('../src/setup/firebase.js')
    await runFirebaseSection(configDir, existingCfg, {
      appName: 'Coffee Tracker',
      projectDir: configDir,
    })

    const updated = await loadConfig(configDir)
    expect(updated.firebase?.projectId).toBe('coffee-tracker-a1b2')
  })

  it('Test 5: project create conflict — throws ConfigError with verbatim stderr (Pitfall 1)', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    vi.mocked(text)
      .mockResolvedValueOnce('coffee-tracker-a1b2')
      .mockResolvedValueOnce('com.appifex.coffeetracker')

    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('sevenray@gmail.com'))  // login:list
      .mockReturnValueOnce(failResult('Project ID already exists'))  // projects:create

    const { ConfigError } = await import('@appifex/core')
    const { runFirebaseSection } = await import('../src/setup/firebase.js')

    // Single call — capture rejection and assert message content.
    let caught: unknown
    try {
      await runFirebaseSection(configDir, makeConfig(), {
        appName: 'Coffee Tracker',
        projectDir: configDir,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ConfigError)
    expect(String(caught)).toContain('Project ID already exists')
  })

  it('Test 6: apps:create runs BEFORE apps:sdkconfig (Pitfall 2 ordering)', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    vi.mocked(text)
      .mockResolvedValueOnce('my-app-a1b2')
      .mockResolvedValueOnce('com.appifex.myapp')

    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('user@example.com'))  // login:list
      .mockReturnValueOnce(okResult(CREATE_JSON))          // projects:create
      .mockReturnValueOnce(okResult(APP_JSON))             // apps:create IOS
      .mockReturnValueOnce(okResult())                     // apps:sdkconfig

    const { saveConfig } = await import('@appifex/core')
    await saveConfig(configDir, makeConfig())

    const { runFirebaseSection } = await import('../src/setup/firebase.js')
    await runFirebaseSection(configDir, makeConfig(), {
      appName: 'My App',
      projectDir: configDir,
    })

    const calls = vi.mocked(spawnSync).mock.calls
    const appsCreateIdx = calls.findIndex(
      (c) => Array.isArray(c[1]) && c[1].includes('apps:create'),
    )
    const sdkconfigIdx = calls.findIndex(
      (c) => Array.isArray(c[1]) && c[1].includes('apps:sdkconfig'),
    )
    expect(appsCreateIdx).toBeLessThan(sdkconfigIdx)
  })

  it('Test 7: plist write — sdkconfig invoked with correct path; config contains plistPath', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    vi.mocked(text)
      .mockResolvedValueOnce('my-app-a1b2')
      .mockResolvedValueOnce('com.appifex.myapp')

    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('user@example.com'))
      .mockReturnValueOnce(okResult(CREATE_JSON))
      .mockReturnValueOnce(okResult(APP_JSON))
      .mockReturnValueOnce(okResult())

    const { saveConfig, loadConfig } = await import('@appifex/core')
    await saveConfig(configDir, makeConfig())

    const projectDir = configDir
    const { runFirebaseSection } = await import('../src/setup/firebase.js')
    await runFirebaseSection(configDir, makeConfig(), { appName: 'My App', projectDir })

    const updated = await loadConfig(configDir)
    const expectedPlist = join(projectDir, 'GoogleService-Info.plist')
    expect(updated.firebase?.plistPath).toBe(expectedPlist)

    // Verify spawnSync was called with the correct plist path
    const sdkconfigCall = vi.mocked(spawnSync).mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes('apps:sdkconfig'),
    )
    expect(sdkconfigCall).toBeDefined()
    expect(sdkconfigCall![1]).toContain(expectedPlist)
  })

  it('Test 8: slug derivation — "My Coffee Tracker!!!" produces valid projectId and bundleId', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { text } = await import('@clack/prompts')
    // Capture what initialValue was passed to the prompts
    let capturedProjectId = ''
    let capturedBundleId = ''
    vi.mocked(text).mockImplementation(async (opts) => {
      const initialValue = (opts as { initialValue?: string }).initialValue ?? ''
      if ((opts as { message?: string }).message?.includes('project ID')) {
        capturedProjectId = initialValue
        return initialValue
      }
      capturedBundleId = initialValue
      return initialValue
    })

    const { spawnSync } = await import('node:child_process')
    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('user@example.com'))
      .mockReturnValueOnce(okResult(CREATE_JSON))
      .mockReturnValueOnce(okResult(APP_JSON))
      .mockReturnValueOnce(okResult())

    const { saveConfig } = await import('@appifex/core')
    await saveConfig(configDir, makeConfig())

    const { runFirebaseSection } = await import('../src/setup/firebase.js')
    await runFirebaseSection(configDir, makeConfig(), {
      appName: 'My Coffee Tracker!!!',
      projectDir: configDir,
    })

    // projectId must match pattern: my-coffee-tracker-[a-f0-9]{4}
    expect(capturedProjectId).toMatch(/^my-coffee-tracker-[a-f0-9]{4}$/)
    // bundleId must be com.appifex.mycoffeetracker
    expect(capturedBundleId).toBe('com.appifex.mycoffeetracker')
  })

  it('Test 9: user override — overridden projectId is used in subprocess call', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    // User overrides projectId
    vi.mocked(text)
      .mockResolvedValueOnce('my-custom-project-id')  // user-overridden projectId
      .mockResolvedValueOnce('com.company.myapp')      // bundleId

    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('user@example.com'))
      .mockReturnValueOnce(okResult(JSON.stringify({ result: { projectId: 'my-custom-project-id' } })))
      .mockReturnValueOnce(okResult(APP_JSON))
      .mockReturnValueOnce(okResult())

    const { saveConfig } = await import('@appifex/core')
    await saveConfig(configDir, makeConfig())

    const { runFirebaseSection } = await import('../src/setup/firebase.js')
    await runFirebaseSection(configDir, makeConfig(), {
      appName: 'My App',
      projectDir: configDir,
    })

    const createCall = vi.mocked(spawnSync).mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes('projects:create'),
    )
    expect(createCall).toBeDefined()
    expect(createCall![1]).toContain('my-custom-project-id')
  })

  it('Test 9b: hard-fail when appName is missing — throws ConfigError with run setup project hint', async () => {
    const { ConfigError } = await import('@appifex/core')
    const { SECTIONS } = await import('../src/setup/index.js')

    await expect(
      SECTIONS.firebase(configDir, makeConfig(), undefined),
    ).rejects.toThrow(ConfigError)

    try {
      await SECTIONS.firebase(configDir, makeConfig(), undefined)
    } catch (err) {
      expect(String(err)).toContain('Run `dtc setup project` first')
    }
  })

  it('Test 10: login --no-localhost is invoked with stdio: inherit (Pitfall 6 — no spinner)', async () => {
    vi.doMock('@appifex/core', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@appifex/core')>()
      return { ...actual, which: vi.fn().mockReturnValue(true) }
    })

    const { spawnSync } = await import('node:child_process')
    const { text } = await import('@clack/prompts')
    vi.mocked(text)
      .mockResolvedValueOnce('my-app-a1b2')
      .mockResolvedValueOnce('com.appifex.myapp')

    // login:list shows no '@' — forces login flow
    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult('no account here'))  // login:list — no '@'
      .mockReturnValueOnce(okResult())                    // login --no-localhost succeeds
      .mockReturnValueOnce(okResult(CREATE_JSON))
      .mockReturnValueOnce(okResult(APP_JSON))
      .mockReturnValueOnce(okResult())

    const { saveConfig } = await import('@appifex/core')
    await saveConfig(configDir, makeConfig())

    const { runFirebaseSection } = await import('../src/setup/firebase.js')
    await runFirebaseSection(configDir, makeConfig(), {
      appName: 'My App',
      projectDir: configDir,
    })

    // Find the login call (not login:list)
    const loginCall = vi.mocked(spawnSync).mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1].includes('login') && c[1].includes('--no-localhost'),
    )
    expect(loginCall).toBeDefined()
    expect((loginCall![2] as { stdio?: unknown }).stdio).toBe('inherit')
  })

  it('Test 11: wave-0 stub packages/baas/__tests__/firebase-provision.test.ts has at least one it.todo', async () => {
    // This test does NOT edit the file — it only asserts the stub exists and has todos.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const stubPath = resolve(
      import.meta.dirname ?? '',
      '../../packages/baas/__tests__/firebase-provision.test.ts',
    )
    const contents = readFileSync(stubPath, 'utf-8')
    expect(contents).toContain('it.todo')
  })
})
