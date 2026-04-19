// Phase 6 (VAL-02 D-07 D-08 D-09 D-10): RED tests for fix-context-ranker.
// Target module (packages/analysis/src/fix-context-ranker.ts) does not yet exist —
// these tests MUST fail today with "Cannot find module". Plan 06-02 turns them green.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  Runner,
  RunnerCapabilities,
  InventoryEntry,
  Platform,
  ModifiedScreens,
} from '@appifex/core'

// Mock sibling analysis modules so the ranker receives deterministic inputs.
vi.mock('../src/scanner.js', () => ({ scanProject: vi.fn() }))
vi.mock('../src/nav-graph.js', () => ({ buildNavGraph: vi.fn() }))

// Import target AFTER mocks. This file is created by Plan 06-02 — this test MUST fail today.
import { rankFixContext } from '../src/fix-context-ranker.js'
import type { RankFixContextInput } from '../src/fix-context-ranker.js'

const caps: RunnerCapabilities = {
  hasMaestro: false,
  hasXcode: false,
  hasNode: true,
  hasSemgrep: false,
  platform: 'darwin',
}

function createMockRunner(files: Record<string, string>): Runner {
  return {
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: async (p: string) => {
      const c = files[p]
      if (c === undefined) throw new Error(`File not found: ${p}`)
      return c
    },
    writeFile: async () => {},
    exists: async (p: string) => p in files,
    glob: async () => Object.keys(files),
    capabilities: caps,
  } as unknown as Runner
}

// Base failures envelope — callers override individual tiers per test.
// Cast to `any` at use site to match ValidationResult shape without pulling in the full type.
const BASE_FAILURES = {
  ui: { total: 0, passed: 0, failed: 0, results: [] },
  unit: { total: 0, passed: 0, failed: 0, failures: [] },
  security: undefined,
  baasIntegration: undefined,
  baasParity: undefined,
  mockLayer: undefined,
  mockParity: undefined,
  allPassed: false,
} as const

const EMPTY_MODIFIED: ModifiedScreens = { added: [], modified: [] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rankFixContext — Phase 6 (VAL-02 D-07 D-08 D-09 D-10)', () => {
  it('Test 1 (P1 — parses failing-test paths from unit errors)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Views/LoginView.swift': '// contents',
    })
    const input: RankFixContextInput = {
      failures: {
        ...BASE_FAILURES,
        unit: {
          total: 1,
          passed: 0,
          failed: 1,
          failures: [{ file: '', error: 'Sources/Views/LoginView.swift:42: undefined symbol' }],
        },
      } as any,
      modifiedScreens: EMPTY_MODIFIED,
      navGraph: { nodes: [], entryPoint: null },
      inventory: [],
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toContain('Sources/Views/LoginView.swift')
  })

  it('Test 2 (P1 — maps semgrep findings to file paths)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Auth/AuthManager.swift': '// contents',
    })
    const input: RankFixContextInput = {
      failures: {
        ...BASE_FAILURES,
        security: {
          total: 1,
          passed: 0,
          failed: 1,
          findings: [
            {
              file: 'Sources/Auth/AuthManager.swift',
              rule: 'hardcoded-secret',
              message: 'secret',
              severity: 'ERROR',
              line: 10,
            },
          ],
        } as any,
      } as any,
      modifiedScreens: EMPTY_MODIFIED,
      navGraph: { nodes: [], entryPoint: null },
      inventory: [],
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toContain('Sources/Auth/AuthManager.swift')
  })

  it('Test 3 (P1 — maps Maestro accessibility ids to screen files via inventory)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Auth/LoginView.swift': '// contents',
    })
    const inventory: InventoryEntry[] = [
      { name: 'LoginView', filePath: 'Sources/Auth/LoginView.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: {
        ...BASE_FAILURES,
        ui: {
          total: 1,
          passed: 0,
          failed: 1,
          results: [
            {
              flowName: 'login',
              passed: false,
              duration: 0,
              error: 'Assertion is false: id: login_email is visible',
              assertions: [],
            },
          ],
        } as any,
      } as any,
      modifiedScreens: EMPTY_MODIFIED,
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toContain('Sources/Auth/LoginView.swift')
  })

  it('Test 4 (P2 — modifiedScreens names resolved to paths via inventory)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Home/HomeView.swift': '// contents',
    })
    const inventory: InventoryEntry[] = [
      { name: 'HomeView', filePath: 'Sources/Home/HomeView.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: { ...BASE_FAILURES } as any,
      modifiedScreens: { added: [], modified: ['HomeView'] },
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toContain('Sources/Home/HomeView.swift')
  })

  it('Test 5 (P3 — nav-graph 1-hop sibling expansion)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Home/HomeView.swift': '// contents',
      '/proj/Sources/Home/AddItemView.swift': '// contents',
    })
    const inventory: InventoryEntry[] = [
      { name: 'HomeView', filePath: 'Sources/Home/HomeView.swift', type: 'screen' },
      { name: 'AddItemView', filePath: 'Sources/Home/AddItemView.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: { ...BASE_FAILURES } as any,
      modifiedScreens: { added: [], modified: ['HomeView'] },
      navGraph: {
        nodes: [
          { screenId: 'Sources/Home/HomeView.swift', type: 'push', targets: ['AddItemView'] },
        ],
        entryPoint: null,
      },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toContain('Sources/Home/HomeView.swift')
    expect(result.files).toContain('Sources/Home/AddItemView.swift')
  })

  it('Test 6 (D-09 cold-start — parses ids from flowYaml when modifiedScreens empty)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Auth/SignupView.swift': '// contents',
      '/proj/Sources/Home/HomeView.swift': '// contents',
    })
    const inventory: InventoryEntry[] = [
      { name: 'SignupView', filePath: 'Sources/Auth/SignupView.swift', type: 'screen' },
      { name: 'HomeView', filePath: 'Sources/Home/HomeView.swift', type: 'screen' },
    ]
    const flowYaml = `- tapOn:
    id: "signup_submit"
- assertVisible:
    id: "home_root"`
    const input: RankFixContextInput = {
      failures: { ...BASE_FAILURES } as any,
      modifiedScreens: EMPTY_MODIFIED,
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      flowYaml,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toContain('Sources/Auth/SignupView.swift')
    expect(result.files).toContain('Sources/Home/HomeView.swift')
  })

  it('Test 7 (D-08 budget cap — N = floor(remaining * 0.4 / avgFileTokens))', async () => {
    // Sampled file has ~3000 chars → ~1000 tokens (CHARS_PER_TOKEN=3)
    const bigContent = 'x'.repeat(3000)
    const runner = createMockRunner({
      '/proj/Sources/A.swift': bigContent,
      '/proj/Sources/B.swift': bigContent,
      '/proj/Sources/C.swift': bigContent,
    })
    const inventory: InventoryEntry[] = [
      { name: 'AView', filePath: 'Sources/A.swift', type: 'screen' },
      { name: 'BView', filePath: 'Sources/B.swift', type: 'screen' },
      { name: 'CView', filePath: 'Sources/C.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: { ...BASE_FAILURES } as any,
      modifiedScreens: { added: [], modified: ['AView', 'BView', 'CView'] },
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      // N = floor(3000 * 0.4 / 1000) = 1
      remainingTokens: 3000,
    }
    const result = await rankFixContext(input)
    expect(result.files.length).toBe(1)
    expect(result.maxFiles).toBe(1)
  })

  it('Test 8 (D-08 N=0 edge — empty array when budget exhausted)', async () => {
    const bigContent = 'x'.repeat(3000)
    const runner = createMockRunner({
      '/proj/Sources/A.swift': bigContent,
    })
    const inventory: InventoryEntry[] = [
      { name: 'AView', filePath: 'Sources/A.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: { ...BASE_FAILURES } as any,
      modifiedScreens: { added: [], modified: ['AView'] },
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      // N = floor(100 * 0.4 / 1000) = 0
      remainingTokens: 100,
    }
    const result = await rankFixContext(input)
    expect(result.files).toEqual([])
    expect(result.maxFiles).toBe(0)
  })

  it('Test 9 (dedup across tiers — highest-priority slot wins, file appears once)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Views/LoginView.swift': '// contents',
    })
    const inventory: InventoryEntry[] = [
      { name: 'LoginView', filePath: 'Sources/Views/LoginView.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: {
        ...BASE_FAILURES,
        unit: {
          total: 1,
          passed: 0,
          failed: 1,
          failures: [{ file: '', error: 'Sources/Views/LoginView.swift:42: undefined symbol' }],
        },
      } as any,
      modifiedScreens: { added: [], modified: ['LoginView'] },
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 100_000,
    }
    const result = await rankFixContext(input)
    const occurrences = result.files.filter((f) => f === 'Sources/Views/LoginView.swift').length
    expect(occurrences).toBe(1)
  })

  it('Test 10 (empty inputs — no crash, returns [])', async () => {
    const runner = createMockRunner({})
    const input: RankFixContextInput = {
      failures: { ...BASE_FAILURES } as any,
      modifiedScreens: EMPTY_MODIFIED,
      navGraph: { nodes: [], entryPoint: null },
      inventory: [],
      flowYaml: undefined,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 10_000,
    }
    const result = await rankFixContext(input)
    expect(result.files).toEqual([])
  })

  it('Test 11 (priority ordering — P1 files precede P2 files)', async () => {
    const runner = createMockRunner({
      '/proj/Sources/Views/LoginView.swift': '// p1 content',
      '/proj/Sources/Home/HomeView.swift': '// p2 content',
    })
    const inventory: InventoryEntry[] = [
      { name: 'LoginView', filePath: 'Sources/Views/LoginView.swift', type: 'screen' },
      { name: 'HomeView', filePath: 'Sources/Home/HomeView.swift', type: 'screen' },
    ]
    const input: RankFixContextInput = {
      failures: {
        ...BASE_FAILURES,
        unit: {
          total: 1,
          passed: 0,
          failed: 1,
          failures: [{ file: '', error: 'Sources/Views/LoginView.swift:10: boom' }],
        },
      } as any,
      modifiedScreens: { added: [], modified: ['HomeView'] },
      navGraph: { nodes: [], entryPoint: null },
      inventory,
      projectDir: '/proj',
      runner,
      platform: 'swiftui' as Platform,
      remainingTokens: 100_000,
    }
    const result = await rankFixContext(input)
    const p1Idx = result.files.indexOf('Sources/Views/LoginView.swift')
    const p2Idx = result.files.indexOf('Sources/Home/HomeView.swift')
    expect(p1Idx).toBeGreaterThanOrEqual(0)
    expect(p2Idx).toBeGreaterThanOrEqual(0)
    expect(p1Idx).toBeLessThan(p2Idx)
  })
})
