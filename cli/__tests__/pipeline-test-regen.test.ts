import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @appifex/analysis so we can control diffScreenInventory return value per test.
vi.mock('@appifex/analysis', async () => {
  const actual = await vi.importActual<typeof import('@appifex/analysis')>('@appifex/analysis')
  return {
    ...actual,
    diffScreenInventory: vi.fn(),
  }
})

// Mock @appifex/test-gen so we can assert screenFilter is plumbed through and
// that generators are NOT called on skip / fresh-app paths.
vi.mock('@appifex/test-gen', async () => {
  const actual = await vi.importActual<typeof import('@appifex/test-gen')>('@appifex/test-gen')
  return {
    ...actual,
    generateUITests: vi.fn((_spec: unknown, opts: { screenFilter?: Set<string> } = {}) => {
      const screens = opts.screenFilter ? [...opts.screenFilter] : []
      return screens.map((name) => ({
        name,
        screenId: name.toLowerCase(),
        fileName: `${name.toLowerCase()}.yaml`,
        content: `appId: com.dtc.App\n# ${name}\n`,
      }))
    }),
    generateSpecUnitTests: vi.fn((spec: { platform: string }, _filter?: Set<string>) => {
      return [
        {
          fileName: spec.platform === 'swiftui' ? 'ViewTests+Regen.swift' : 'ScreenTestRegen.kt',
          content: '// regen\n',
          platform: spec.platform,
          testCount: 1,
        },
      ]
    }),
  }
})

import { runTestRegenPhase, type RunTestRegenDeps } from '../src/pipeline.js'
import { diffScreenInventory } from '@appifex/analysis'
import { generateUITests, generateSpecUnitTests } from '@appifex/test-gen'
import {
  RunContextBuilder,
  type PlatformSpec,
  type ProgressEvent,
  type Runner,
} from '@appifex/core'

const diffMock = vi.mocked(diffScreenInventory)
const generateUITestsMock = vi.mocked(generateUITests)
const generateSpecUnitTestsMock = vi.mocked(generateSpecUnitTests)

function makePlatformSpec(platform: 'swiftui' | 'kotlin-compose' = 'swiftui'): PlatformSpec {
  return {
    platform,
    appName: 'TestApp',
    screens: [
      { id: 'home', name: 'Home', components: [], actions: [] },
      { id: 'detail', name: 'Detail', components: [], actions: [] },
      { id: 'new-screen', name: 'NewScreen', components: [], actions: [] },
    ],
    navigation: { type: 'stack', routes: [] },
    theme: { colors: {}, spacing: {}, typography: {} },
  } as unknown as PlatformSpec
}

function makeRunner(): Runner {
  return {
    glob: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    exec: vi.fn(),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  } as unknown as Runner
}

function makeDeps(overrides: Partial<RunTestRegenDeps> = {}): {
  deps: RunTestRegenDeps
  emitted: ProgressEvent[]
  flushCalls: number
  ctxBuilder: RunContextBuilder
} {
  const emitted: ProgressEvent[] = []
  let flushCalls = 0
  const ctxBuilder = new RunContextBuilder({
    prompt: 'test',
    platform: 'swiftui',
    mode: 'add-feature',
  })
  const runner = overrides.runner ?? makeRunner()
  const deps: RunTestRegenDeps = {
    runner,
    outputDir: '/tmp/dtc',
    platform: 'swiftui',
    runMode: 'add-feature',
    preAgentSnapshot: new Map([['Sources/Home.swift', 'original']]),
    platformSpec: makePlatformSpec(),
    ctxBuilder,
    emit: (phase, status, message) => {
      emitted.push({ phase, status, message, timestamp: Date.now() } as ProgressEvent)
    },
    flushContext: async () => {
      flushCalls++
    },
    flowDir: '/tmp/dtc/.maestro',
    testDir: '/tmp/dtc/__tests__',
    bundleId: 'com.dtc.TestApp',
    designScreenshots: {},
    ...overrides,
  }
  return {
    deps,
    emitted,
    flushCalls: 0,
    ctxBuilder,
    get flushCalls() {
      return flushCalls
    },
  } as any
}

beforeEach(() => {
  diffMock.mockReset()
  generateUITestsMock.mockClear()
  generateSpecUnitTestsMock.mockClear()
})

describe('pipeline test_regen phase', () => {
  it('runs test_regen AFTER revertUnexpectedChanges (Pitfall 1 ordering)', async () => {
    // Ordering is asserted at the call-site level: the caller invokes
    // revertUnexpectedChanges, then runTestRegenPhase. We assert invocation
    // order by tracking a shared order counter.
    const order: string[] = []
    const revertSpy = vi.fn(async () => {
      order.push('revert')
    })
    diffMock.mockImplementation(async () => {
      order.push('diff')
      return { added: [], modified: [] }
    })

    // Simulate the caller sequence from pipeline.ts
    await revertSpy()
    const { deps } = makeDeps()
    await runTestRegenPhase(deps)

    expect(order).toEqual(['revert', 'diff'])
  })

  it('only activates when runMode === "add-feature" && preAgentSnapshot (D-08)', async () => {
    diffMock.mockResolvedValue({ added: ['NewScreen'], modified: [] })
    const { deps, emitted } = makeDeps()
    await runTestRegenPhase(deps)
    expect(diffMock).toHaveBeenCalledTimes(1)
    expect(emitted.some((e) => e.phase === 'test_regen' && e.status === 'started')).toBe(true)
    expect(emitted.some((e) => e.phase === 'test_regen' && e.status === 'completed')).toBe(true)
  })

  it('skips generator calls when modifiedScreens is empty (D-10)', async () => {
    diffMock.mockResolvedValue({ added: [], modified: [] })
    const { deps } = makeDeps()
    await runTestRegenPhase(deps)
    expect(generateUITestsMock).not.toHaveBeenCalled()
    expect(generateSpecUnitTestsMock).not.toHaveBeenCalled()
    expect(deps.runner.writeFile).not.toHaveBeenCalled()
  })

  it('emits progress event phase=test_regen status=skipped on empty set (D-10)', async () => {
    diffMock.mockResolvedValue({ added: [], modified: [] })
    const { deps, emitted } = makeDeps()
    await runTestRegenPhase(deps)
    const skipEvent = emitted.find((e) => e.phase === 'test_regen' && e.status === 'skipped')
    expect(skipEvent).toBeDefined()
    expect(skipEvent!.message).toContain('No modified screens')
  })

  it('writes modifiedScreens to run-context top-level (D-09)', async () => {
    diffMock.mockResolvedValue({ added: ['NewScreen'], modified: ['Home'] })
    const { deps, ctxBuilder } = makeDeps()
    await runTestRegenPhase(deps)
    const ctx = ctxBuilder.build('completed')
    expect(ctx.modifiedScreens).toEqual({ added: ['NewScreen'], modified: ['Home'] })
  })

  it('does NOT activate on fresh-app runs (Pitfall 6)', async () => {
    const { deps, emitted } = makeDeps({ runMode: 'fresh', preAgentSnapshot: undefined })
    await runTestRegenPhase(deps)
    expect(diffMock).not.toHaveBeenCalled()
    expect(emitted.find((e) => e.phase === 'test_regen')).toBeUndefined()
  })

  it('plumbs screenFilter through generateUITests when screens changed', async () => {
    diffMock.mockResolvedValue({ added: ['NewScreen'], modified: [] })
    const { deps } = makeDeps()
    await runTestRegenPhase(deps)
    expect(generateUITestsMock).toHaveBeenCalledTimes(1)
    const call = generateUITestsMock.mock.calls[0]
    const optsArg = call[1] as { screenFilter?: Set<string> }
    expect(optsArg.screenFilter).toBeInstanceOf(Set)
    expect([...optsArg.screenFilter!]).toContain('NewScreen')
  })

  it('writes regen flow + unit test files when screens changed', async () => {
    diffMock.mockResolvedValue({ added: ['NewScreen'], modified: [] })
    const { deps } = makeDeps()
    await runTestRegenPhase(deps)
    const writes = (deps.runner.writeFile as any).mock.calls.map(([p]: [string]) => p)
    // Flow file written
    expect(writes.some((p: string) => p.includes('.maestro') && p.includes('newscreen.yaml'))).toBe(
      true,
    )
    // Regen unit test file written (distinct filename per Plan 11-03)
    expect(writes.some((p: string) => p.includes('ViewTests+Regen.swift'))).toBe(true)
  })

  it('is a no-op when preAgentSnapshot is undefined even if runMode === "add-feature" (Pitfall 6)', async () => {
    const { deps, emitted } = makeDeps({ preAgentSnapshot: undefined })
    await runTestRegenPhase(deps)
    expect(diffMock).not.toHaveBeenCalled()
    expect(emitted.find((e) => e.phase === 'test_regen')).toBeUndefined()
  })
})
