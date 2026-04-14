import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

// Mock @appifex/analysis so the harness can deterministically control
// diffScreenInventory's return shape per test.
vi.mock('@appifex/analysis', async () => {
  const actual = await vi.importActual<typeof import('@appifex/analysis')>('@appifex/analysis')
  return {
    ...actual,
    diffScreenInventory: vi.fn(),
  }
})

import { runTestRegenPhase, type RunTestRegenDeps } from '../src/pipeline.js'
import { diffScreenInventory } from '@appifex/analysis'
import { RunContextBuilder, type PlatformSpec, type Runner } from '@appifex/core'

const diffMock = vi.mocked(diffScreenInventory)

/**
 * SHA-256 hex — intentionally duplicated from packages/analysis/src/modified-screens.ts
 * per Plan 11-02 (no shared core utility for this one-liner).
 */
function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

/**
 * Minimal in-memory Runner backed by a Map<string, string>. Writes through to
 * the map so SHA-256 comparisons can read the post-run state.
 */
function makeMemRunner(initial: Record<string, string>): Runner {
  const files = new Map<string, string>(Object.entries(initial))
  return {
    async readFile(p: string) {
      const c = files.get(p)
      if (c === undefined) throw new Error(`ENOENT: ${p}`)
      return c
    },
    async writeFile(p: string, c: string) {
      files.set(p, c)
    },
    async glob() {
      return []
    },
    async exists(p: string) {
      return files.has(p)
    },
    async exec() {
      return { command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }
    },
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
  } as unknown as Runner
}

function makePlatformSpec(): PlatformSpec {
  return {
    platform: 'swiftui',
    appName: 'TestApp',
    screens: [
      { id: 'home', name: 'Home', components: [], actions: [], testIds: {} },
      { id: 'detail', name: 'Detail', components: [], actions: [], testIds: {} },
    ],
    navigation: { type: 'stack', routes: [] },
    theme: { colors: {}, spacing: {}, typography: {} },
  } as unknown as PlatformSpec
}

function makeDeps(runner: Runner): RunTestRegenDeps {
  return {
    runner,
    outputDir: '/tmp/dtc',
    platform: 'swiftui',
    runMode: 'add-feature',
    preAgentSnapshot: new Map([['Sources/Home.swift', 'original home']]),
    platformSpec: makePlatformSpec(),
    ctxBuilder: new RunContextBuilder({
      prompt: 'test',
      platform: 'swiftui',
      mode: 'add-feature',
    }),
    emit: () => {
      /* no-op */
    },
    flushContext: async () => {
      /* no-op */
    },
    flowDir: '.maestro',
    testDir: '__tests__',
    bundleId: 'com.dtc.TestApp',
    designScreenshots: {},
  }
}

beforeEach(() => {
  diffMock.mockReset()
})

describe('test_regen byte-identical guarantee (SHA-256 harness)', () => {
  it('untouched screen test files are byte-identical across two add-feature runs (QUALITY-01b #3)', async () => {
    const flowPath = '.maestro/home.yaml'
    const unitPath = '__tests__/ViewTests.swift'
    const originalFlow = 'appId: com.dtc.TestApp\n---\n- launchApp\n- tapOn: "Home"\n'
    const originalUnit = 'import XCTest\nfinal class HomeViewTests: XCTestCase { /* original */ }\n'

    const runner = makeMemRunner({
      [flowPath]: originalFlow,
      [unitPath]: originalUnit,
    })

    // Non-empty diff that does NOT include 'Home' — so Home's flow file and
    // the original combined ViewTests.swift must remain untouched.
    diffMock.mockResolvedValue({ added: [], modified: ['Detail'] })

    // Run 1
    await runTestRegenPhase(makeDeps(runner))
    const flowHashAfter1 = sha256Hex(await runner.readFile(flowPath))
    const unitHashAfter1 = sha256Hex(await runner.readFile(unitPath))

    // Run 2 — identical inputs
    await runTestRegenPhase(makeDeps(runner))
    const flowHashAfter2 = sha256Hex(await runner.readFile(flowPath))
    const unitHashAfter2 = sha256Hex(await runner.readFile(unitPath))

    // The original Maestro flow for Home was never written → byte-identical
    expect(flowHashAfter1).toBe(sha256Hex(originalFlow))
    expect(flowHashAfter2).toBe(sha256Hex(originalFlow))
    expect(flowHashAfter1).toBe(flowHashAfter2)

    // Original combined ViewTests.swift is never overwritten by the regen path
    // (Pitfall 3 mitigation: Plan 11-03 emits ViewTests+Regen.swift instead).
    expect(unitHashAfter1).toBe(sha256Hex(originalUnit))
    expect(unitHashAfter2).toBe(sha256Hex(originalUnit))
    expect(unitHashAfter1).toBe(unitHashAfter2)
  })

  it('an add-feature run with zero added/modified screens writes ZERO test files (D-10)', async () => {
    const runner = makeMemRunner({})
    const writeSpy = vi.spyOn(runner, 'writeFile')

    diffMock.mockResolvedValue({ added: [], modified: [] })

    await runTestRegenPhase(makeDeps(runner))

    const testFileWrites = writeSpy.mock.calls.filter(
      ([p]) => p.includes('__tests__') || p.includes('.maestro'),
    )
    expect(testFileWrites).toHaveLength(0)
  })
})
