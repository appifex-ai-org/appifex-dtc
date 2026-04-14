import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@appifex/core', () => ({
  loadConfig: vi.fn(),
}))

vi.mock('@appifex/runner', () => ({
  createRunner: vi.fn(),
}))

vi.mock('@appifex/analysis', () => ({
  scanProject: vi.fn(),
  buildNavGraph: vi.fn(),
  backupRunContext: vi.fn(),
  buildAppContextSummary: vi.fn(),
}))

import { handleAnalyze } from '../src/tools/analysis.js'
import { loadConfig } from '@appifex/core'
import { createRunner } from '@appifex/runner'
import {
  scanProject,
  buildNavGraph,
  backupRunContext,
  buildAppContextSummary,
} from '@appifex/analysis'

const mockLoadConfig = vi.mocked(loadConfig)
const mockCreateRunner = vi.mocked(createRunner)
const mockScanProject = vi.mocked(scanProject)
const mockBuildNavGraph = vi.mocked(buildNavGraph)
const mockBackupRunContext = vi.mocked(backupRunContext)
const mockBuildAppContextSummary = vi.mocked(buildAppContextSummary)

const MOCK_INVENTORY = [
  { filePath: 'Sources/Views/HomeView.swift', type: 'screen' as const, name: 'HomeView' },
]
const MOCK_NAV_NODES = [{ screenId: 'HomeView', type: 'push' as const, targets: ['DetailView'] }]

describe('handleAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadConfig.mockResolvedValue({ runner: 'local' } as any)
    mockCreateRunner.mockReturnValue({} as any)
    mockBackupRunContext.mockResolvedValue(undefined)
    mockScanProject.mockResolvedValue(MOCK_INVENTORY)
    mockBuildNavGraph.mockResolvedValue({ nodes: MOCK_NAV_NODES, entryPoint: 'ContentView' })
    mockBuildAppContextSummary.mockReturnValue('## Existing App Context\nPlatform: swiftui')
  })

  it('returns content array with single text item', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
  })

  it('returns valid JSON in content text', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    expect(() => JSON.parse(result.content[0].text)).not.toThrow()
  })

  it('includes summary field in JSON output', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.summary).toBe('## Existing App Context\nPlatform: swiftui')
  })

  it('includes inventory array in JSON output (ANALYZE-01)', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.inventory).toEqual(MOCK_INVENTORY)
  })

  it('includes navGraph array in JSON output (ANALYZE-02)', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.navGraph).toEqual(MOCK_NAV_NODES)
  })

  it('includes entryPoint in JSON output', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.entryPoint).toBe('ContentView')
  })

  it('includes platform in JSON output', async () => {
    const result = await handleAnalyze({ outputDir: '/tmp/app', platform: 'swiftui' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.platform).toBe('swiftui')
  })
})
