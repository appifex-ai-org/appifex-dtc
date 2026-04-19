import { describe, it, expect, vi } from 'vitest'
import {
  createCopilotGenerateFn,
  createCopilotFixFn,
  buildDeviceFlowUrl,
  type CopilotProviderOpts,
} from '../src/providers/copilot.js'
import type { CodegenInput } from '@appifex/codegen'
import type { ValidationResult } from '@appifex/validate'
import type { Runner } from '@appifex/core'

function mockRunner(): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: vi.fn().mockResolvedValue('export default function Home() {}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue(['/app/src/Home.tsx']),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  }
}

// Mock the CopilotClient
function mockCopilotSession(responseContent: string) {
  return {
    sendAndWait: vi.fn().mockResolvedValue({
      data: { content: responseContent },
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
}

function mockCopilotClient(session: ReturnType<typeof mockCopilotSession>) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(session),
  }
}

const sampleInput: CodegenInput = {
  spec: {
    platform: 'swiftui',
    screens: [
      {
        id: 's1',
        name: 'Home',
        componentName: 'HomeScreen',
        description: 'Main',
        components: [],
        testIds: {},
      },
    ],
    designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
    imports: ['SwiftUI'],
  },
  uiTestPaths: ['.maestro/home.yaml'],
  unitTestPaths: ['Tests/ReqTests.swift'],
  outputDir: '/app',
}

const failingValidation: ValidationResult = {
  ui: {
    total: 2,
    passed: 1,
    failed: 1,
    results: [
      {
        flowName: 'home',
        passed: false,
        duration: 100,
        error: 'button not visible',
        assertions: [],
      },
    ],
  },
  unit: { total: 1, passed: 1, failed: 0, failures: [] },
  allPassed: false,
}

describe('buildDeviceFlowUrl', () => {
  it('builds the GitHub device flow URL with copilot scope', () => {
    const url = buildDeviceFlowUrl('Iv1.abc123')
    expect(url).toBe('https://github.com/login/device/code')
  })
})

describe('createCopilotGenerateFn', () => {
  it('sends spec to Copilot session and parses file JSON response', async () => {
    const responseJson = JSON.stringify({
      files: [{ path: 'HomeScreen.tsx', content: 'export default function HomeScreen() {}' }],
    })
    const session = mockCopilotSession(responseJson)
    const client = mockCopilotClient(session)

    const generateFn = createCopilotGenerateFn({
      githubToken: 'ghu_test123',
      model: 'claude-sonnet-4-6',
      createClient: () => client as any,
    })

    const result = await generateFn(sampleInput)

    expect(client.start).toHaveBeenCalledOnce()
    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    )
    expect(session.sendAndWait).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('HomeScreen.tsx')
  })

  it('returns failure when session returns invalid JSON', async () => {
    const session = mockCopilotSession('I cannot generate code right now.')
    const client = mockCopilotClient(session)

    const generateFn = createCopilotGenerateFn({
      githubToken: 'ghu_test',
      createClient: () => client as any,
    })

    const result = await generateFn(sampleInput)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('createCopilotFixFn', () => {
  it('sends failures to Copilot and applies fixes', async () => {
    const responseJson = JSON.stringify({
      fixes: [{ path: '/app/src/Home.tsx', content: 'fixed code' }],
    })
    const session = mockCopilotSession(responseJson)
    const client = mockCopilotClient(session)
    const runner = mockRunner()

    const fixFn = createCopilotFixFn({
      githubToken: 'ghu_test',
      runner,
      projectDir: '/app',
      createClient: () => client as any,
    })

    const result = await fixFn(failingValidation)

    expect(result.filesChanged).toEqual(['/app/src/Home.tsx'])
    expect(runner.writeFile).toHaveBeenCalledWith('/app/src/Home.tsx', 'fixed code')
  })

  // Phase 02 (OBS-01): silent-return paths now route through DebugLogger.
  it('logs copilot-fix-no-json-match when response has no fixes JSON block', async () => {
    const session = mockCopilotSession('Sorry I cannot help right now.')
    const client = mockCopilotClient(session)
    const runner = mockRunner()
    const debug = {
      enabled: true,
      log: vi.fn().mockResolvedValue(undefined),
      logJson: vi.fn().mockResolvedValue(undefined),
    }

    const fixFn = createCopilotFixFn({
      githubToken: 'ghu_test',
      runner,
      projectDir: '/app',
      createClient: () => client as any,
      debug,
    })

    const result = await fixFn(failingValidation)

    expect(result).toEqual({ filesChanged: [], tokensUsed: 0 })
    expect(debug.logJson).toHaveBeenCalledWith(
      'copilot-fix-error.json',
      expect.objectContaining({
        kind: 'copilot-fix-no-json-match',
        preview: expect.any(String),
      }),
    )
  })

  it('logs copilot-fix-malformed-fixes when parsed.fixes is not an array', async () => {
    // Response contains "fixes" substring to pass the regex, but parsed value is not an array.
    const responseJson = JSON.stringify({ fixes: 'not-an-array' })
    const session = mockCopilotSession(responseJson)
    const client = mockCopilotClient(session)
    const runner = mockRunner()
    const debug = {
      enabled: true,
      log: vi.fn().mockResolvedValue(undefined),
      logJson: vi.fn().mockResolvedValue(undefined),
    }

    const fixFn = createCopilotFixFn({
      githubToken: 'ghu_test',
      runner,
      projectDir: '/app',
      createClient: () => client as any,
      debug,
    })

    const result = await fixFn(failingValidation)

    expect(result).toEqual({ filesChanged: [], tokensUsed: 0 })
    expect(debug.logJson).toHaveBeenCalledWith(
      'copilot-fix-error.json',
      expect.objectContaining({
        kind: 'copilot-fix-malformed-fixes',
        raw: expect.any(String),
      }),
    )
  })

  it('works without a debug option (backward-compat with pre-OBS-01 callers)', async () => {
    const session = mockCopilotSession('no json here')
    const client = mockCopilotClient(session)
    const runner = mockRunner()

    const fixFn = createCopilotFixFn({
      githubToken: 'ghu_test',
      runner,
      projectDir: '/app',
      createClient: () => client as any,
      // no `debug` — optional and must not crash
    })

    const result = await fixFn(failingValidation)
    expect(result).toEqual({ filesChanged: [], tokensUsed: 0 })
  })
})
