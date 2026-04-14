import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@appifex/core', () => ({
  loadRunContext: vi.fn(),
  loadConfig: vi.fn(),
}))

vi.mock('@appifex/runner', () => ({
  createRunner: vi.fn(),
}))

vi.mock('@appifex/analysis', () => ({
  scanProject: vi.fn(),
  buildNavGraph: vi.fn(),
}))

vi.mock('../src/tools/pipeline.js', () => ({
  handleRunPipeline: vi.fn(),
}))

vi.mock('../src/tools/refine.js', () => ({
  isFeaturePromptVague: vi.fn(),
  generateFeatureAssumptions: vi.fn(),
}))

import { handleAddFeature } from '../src/tools/add-feature.js'
import { loadRunContext, loadConfig } from '@appifex/core'
import { createRunner } from '@appifex/runner'
import { scanProject, buildNavGraph } from '@appifex/analysis'
import { handleRunPipeline } from '../src/tools/pipeline.js'
import { isFeaturePromptVague, generateFeatureAssumptions } from '../src/tools/refine.js'

const mockLoadRunContext = vi.mocked(loadRunContext)
const mockLoadConfig = vi.mocked(loadConfig)
const mockCreateRunner = vi.mocked(createRunner)
const mockScanProject = vi.mocked(scanProject)
const mockBuildNavGraph = vi.mocked(buildNavGraph)
const mockHandleRunPipeline = vi.mocked(handleRunPipeline)
const mockIsFeaturePromptVague = vi.mocked(isFeaturePromptVague)
const mockGenerateFeatureAssumptions = vi.mocked(generateFeatureAssumptions)

const VALID_CONTEXT = {
  runId: 'run-abc123',
  prompt: 'Todo app',
  platform: 'swiftui' as const,
  mode: 'fresh' as const,
  status: 'completed' as const,
  timestamp: Date.now(),
  phases: {
    codegen: { status: 'completed' as const, summary: 'Generated 5 files' },
  },
  filesGenerated: ['App.swift', 'ContentView.swift'],
}

describe('handleAddFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects with isError=true and D-11 error when loadRunContext returns null', async () => {
    mockLoadRunContext.mockResolvedValue(null)

    const result = await handleAddFeature({ prompt: 'Add settings', outputDir: '/tmp/app' })

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('error')
    expect(parsed.error).toContain('No existing project found at /tmp/app')
  })

  it('includes the outputDir path in the error message', async () => {
    mockLoadRunContext.mockResolvedValue(null)

    const result = await handleAddFeature({ prompt: 'Add settings', outputDir: '/my/custom/path' })

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text)
    expect(parsed.error).toContain('/my/custom/path')
  })

  it('calls handleRunPipeline with mode=add-feature when loadRunContext returns valid context', async () => {
    mockLoadRunContext.mockResolvedValue(VALID_CONTEXT)
    mockHandleRunPipeline.mockResolvedValue({ text: '{}', isError: false })
    mockIsFeaturePromptVague.mockReturnValue(false)

    await handleAddFeature({ prompt: 'Add settings', outputDir: '/tmp/app' })

    expect(mockHandleRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'add-feature' }),
    )
  })

  it('passes prompt, outputDir, and platform args through to handleRunPipeline', async () => {
    mockLoadRunContext.mockResolvedValue(VALID_CONTEXT)
    mockHandleRunPipeline.mockResolvedValue({ text: '{}', isError: false })
    mockIsFeaturePromptVague.mockReturnValue(false)

    await handleAddFeature({
      prompt: 'Add dark mode',
      outputDir: '/tmp/app',
      platform: 'kotlin-compose',
    })

    expect(mockHandleRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Add dark mode',
        outputDir: '/tmp/app',
        platform: 'kotlin-compose',
        mode: 'add-feature',
      }),
    )
  })

  it('defaults platform to swiftui when not provided', async () => {
    mockLoadRunContext.mockResolvedValue(VALID_CONTEXT)
    mockHandleRunPipeline.mockResolvedValue({ text: '{}', isError: false })
    mockIsFeaturePromptVague.mockReturnValue(false)

    await handleAddFeature({ prompt: 'Add settings', outputDir: '/tmp/app' })

    expect(mockHandleRunPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'swiftui' }),
    )
  })

  describe('confirmed parameter gating (D-04)', () => {
    beforeEach(() => {
      mockLoadRunContext.mockResolvedValue(VALID_CONTEXT)
      mockHandleRunPipeline.mockResolvedValue({ text: '{}', isError: false })
    })

    it('returns needs_confirmation when confirmed is absent and prompt is vague', async () => {
      mockIsFeaturePromptVague.mockReturnValue(true)
      mockGenerateFeatureAssumptions.mockReturnValue({
        mode: 'feature_assumptions',
        originalPrompt: 'add stuff',
        assumptions: [{ id: 'type-1', category: 'type', description: 'Adding a new screen' }],
        summary: "I'll assume: Adding a new screen",
      })

      const result = await handleAddFeature({ prompt: 'add stuff', outputDir: '/tmp/app' })

      expect(result.isError).toBe(false)
      const parsed = JSON.parse(result.text)
      expect(parsed.status).toBe('needs_confirmation')
      expect(parsed.assumptions).toHaveLength(1)
      expect(parsed.hint).toContain('dtc_add_feature')
      expect(mockHandleRunPipeline).not.toHaveBeenCalled()
    })

    it('runs pipeline directly when confirmed is absent and prompt is specific', async () => {
      mockIsFeaturePromptVague.mockReturnValue(false)

      await handleAddFeature({
        prompt: 'Add a settings screen with dark mode toggle to the tab bar',
        outputDir: '/tmp/app',
      })

      expect(mockHandleRunPipeline).toHaveBeenCalled()
    })

    it('runs pipeline when confirmed=true regardless of prompt vagueness', async () => {
      mockIsFeaturePromptVague.mockReturnValue(true) // would be vague, but confirmed overrides

      await handleAddFeature({ prompt: 'add stuff', outputDir: '/tmp/app', confirmed: true })

      expect(mockHandleRunPipeline).toHaveBeenCalled()
      expect(mockGenerateFeatureAssumptions).not.toHaveBeenCalled()
    })

    it('validates project existence BEFORE confirmed check', async () => {
      mockLoadRunContext.mockResolvedValue(null)

      const result = await handleAddFeature({
        prompt: 'add stuff',
        outputDir: '/tmp/app',
        confirmed: true,
      })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.text)
      expect(parsed.status).toBe('error')
      expect(mockHandleRunPipeline).not.toHaveBeenCalled()
    })
  })

  describe('appContext propagation (PROMPT-02)', () => {
    const MOCK_INVENTORY = [
      { filePath: 'Sources/Views/HomeView.swift', type: 'screen' as const, name: 'HomeView' },
    ]
    const MOCK_NAV_NODES = [
      { screenId: 'HomeView', type: 'push' as const, targets: ['DetailView'] },
    ]

    beforeEach(() => {
      mockLoadRunContext.mockResolvedValue(VALID_CONTEXT)
      mockIsFeaturePromptVague.mockReturnValue(true)
      mockGenerateFeatureAssumptions.mockReturnValue({
        mode: 'feature_assumptions',
        originalPrompt: 'add stuff',
        assumptions: [{ id: 'type-1', category: 'type', description: 'Adding a new screen' }],
        summary: "I'll assume: Adding a new screen",
      })
      mockLoadConfig.mockResolvedValue({ runner: 'local' } as any)
      mockCreateRunner.mockReturnValue({} as any)
      mockScanProject.mockResolvedValue(MOCK_INVENTORY)
      mockBuildNavGraph.mockResolvedValue({ nodes: MOCK_NAV_NODES, entryPoint: 'ContentView' })
    })

    it('passes real appContext to generateFeatureAssumptions when scanning succeeds', async () => {
      await handleAddFeature({ prompt: 'add stuff', outputDir: '/tmp/app' })

      expect(mockScanProject).toHaveBeenCalledWith('/tmp/app', 'swiftui', expect.anything())
      expect(mockBuildNavGraph).toHaveBeenCalledWith('/tmp/app', 'swiftui', expect.anything())
      expect(mockGenerateFeatureAssumptions).toHaveBeenCalledWith(
        'add stuff',
        expect.objectContaining({
          platform: 'swiftui',
          inventory: MOCK_INVENTORY,
          navGraph: MOCK_NAV_NODES,
          entryPoint: 'ContentView',
        }),
      )
    })

    it('falls back to null appContext when scanning throws', async () => {
      mockScanProject.mockRejectedValue(new Error('no project files'))

      await handleAddFeature({ prompt: 'add stuff', outputDir: '/tmp/app' })

      expect(mockGenerateFeatureAssumptions).toHaveBeenCalledWith('add stuff', null)
    })

    it('does not scan when confirmed=true', async () => {
      mockHandleRunPipeline.mockResolvedValue({ text: '{}', isError: false })

      await handleAddFeature({ prompt: 'add stuff', outputDir: '/tmp/app', confirmed: true })

      expect(mockScanProject).not.toHaveBeenCalled()
      expect(mockBuildNavGraph).not.toHaveBeenCalled()
    })

    it('does not scan when prompt is specific (not vague)', async () => {
      mockIsFeaturePromptVague.mockReturnValue(false)
      mockHandleRunPipeline.mockResolvedValue({ text: '{}', isError: false })

      await handleAddFeature({
        prompt: 'Add a settings screen with dark mode toggle',
        outputDir: '/tmp/app',
      })

      expect(mockScanProject).not.toHaveBeenCalled()
      expect(mockBuildNavGraph).not.toHaveBeenCalled()
    })

    it('uses provided platform arg for scanning', async () => {
      await handleAddFeature({
        prompt: 'add stuff',
        outputDir: '/tmp/app',
        platform: 'kotlin-compose',
      })

      expect(mockScanProject).toHaveBeenCalledWith('/tmp/app', 'kotlin-compose', expect.anything())
    })
  })
})
