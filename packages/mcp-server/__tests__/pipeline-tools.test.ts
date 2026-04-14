import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { handleRunPipeline } from '../src/tools/pipeline.js'
import { ProgressEmitter } from '@appifex/core'

// Mock @appifex/core to allow loadRunContext override per test
vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return { ...actual, loadRunContext: vi.fn() }
})

// Import the mocked loadRunContext after vi.mock is in place
import { loadRunContext } from '@appifex/core'

const mockPipelineResult = {
  report: {
    summary: {
      allGreen: true,
      totalTests: 4,
      totalPassed: 4,
      totalFailed: 0,
      fixAttempts: 0,
      totalTokens: 1000,
      totalDuration: 5000,
      designIterations: 1,
    },
    platformReports: [],
    tokenUsage: {},
  },
  validation: {
    ui: { total: 2, passed: 2, failed: 0, results: [] },
    unit: { total: 2, passed: 2, failed: 0, failures: [] },
    allPassed: true,
  },
  markdown: '# Report\n**Status:** ALL GREEN',
}

describe('dtc_run_pipeline handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: loadRunContext returns null (no saved context)
    ;(loadRunContext as Mock).mockResolvedValue(null)
  })

  it('returns structured JSON with status and summary on success', async () => {
    const mockRunPipeline = vi.fn().mockResolvedValue(mockPipelineResult)

    const result = await handleRunPipeline(
      {
        prompt:
          'A counter app with a home screen showing the current count, increment and decrement buttons, a settings tab for theme selection, local storage to persist the count, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-mcp-test-pipeline',
      },
      mockRunPipeline,
    )

    expect(result.isError).toBe(false)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('completed')
    expect(parsed.summary.allGreen).toBe(true)
    expect(parsed.summary.totalTests).toBe(4)
    expect(parsed.markdown).toContain('ALL GREEN')

    // Verify pipeline was called with correct opts
    expect(mockRunPipeline).toHaveBeenCalledOnce()
    const [opts] = mockRunPipeline.mock.calls[0]
    expect(opts.prompt).toBe(
      'A counter app with a home screen showing the current count, increment and decrement buttons, a settings tab for theme selection, local storage to persist the count, no auth needed, clean minimal design',
    )
    expect(opts.platform).toBe('swiftui')
    expect(opts.interactive).toBe(false)
  })

  it('returns structured error JSON when pipeline throws', async () => {
    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Pencil not installed'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A weather app with a dashboard screen for current conditions, a 5-day forecast list view, location search with tab navigation, local data cache, no auth needed, modern flat design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-mcp-test-pipeline-fail',
      },
      mockRunPipeline,
    )

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text)
    expect(parsed.status).toBe('error')
    expect(parsed.error).toContain('Pencil not installed')
  })

  // --- New tests for checkpoint enrichment (REQ-006) ---

  // Test 1: MCP error response includes checkpoint field with all D-01 fields
  it('error response always includes checkpoint object with all D-01 fields', async () => {
    ;(loadRunContext as Mock).mockResolvedValue(null)
    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Build failed'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-mcp-checkpoint-test',
      },
      mockRunPipeline,
    )

    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.text)

    // checkpoint field must always be present (D-02)
    expect(parsed).toHaveProperty('checkpoint')
    const cp = parsed.checkpoint

    // All D-01 fields must exist
    expect(cp).toHaveProperty('run_id')
    expect(cp).toHaveProperty('completed_phases')
    expect(cp).toHaveProperty('agent_session_id')
    expect(cp).toHaveProperty('failed_phase')
    expect(cp).toHaveProperty('token_usage')
    expect(cp).toHaveProperty('output_dir')
  })

  // Test 2: When loadRunContext returns null, checkpoint has null run_id and empty completed_phases
  it('checkpoint has null run_id and empty completed_phases when no context saved (D-02)', async () => {
    ;(loadRunContext as Mock).mockResolvedValue(null)
    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Very early failure'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-no-context',
      },
      mockRunPipeline,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed.checkpoint.run_id).toBeNull()
    expect(parsed.checkpoint.completed_phases).toEqual([])
    expect(parsed.checkpoint.agent_session_id).toBeNull()
    expect(parsed.checkpoint.failed_phase).toBeNull()
    expect(parsed.checkpoint.token_usage).toBeNull()
    expect(parsed.checkpoint.output_dir).toBe('/tmp/dtc-no-context')
  })

  // Test 3: When loadRunContext returns a context with completed phases, checkpoint is populated
  it('checkpoint.completed_phases and checkpoint.run_id are populated from saved context', async () => {
    ;(loadRunContext as Mock).mockResolvedValue({
      runId: 'run-abc-123',
      prompt:
        'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
      platform: 'swiftui',
      mode: 'fresh',
      status: 'failed',
      timestamp: Date.now(),
      phases: {
        design: { status: 'completed', summary: 'Design done' },
        spec: { status: 'completed', summary: '3 screens' },
        codegen: { status: 'failed', summary: 'Build error' },
      },
      filesGenerated: [],
      agentSessionId: 'sess-xyz-789',
    })

    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Build failed'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-with-context',
      },
      mockRunPipeline,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed.checkpoint.run_id).toBe('run-abc-123')
    expect(parsed.checkpoint.completed_phases).toContain('design')
    expect(parsed.checkpoint.completed_phases).toContain('spec')
    expect(parsed.checkpoint.completed_phases).not.toContain('codegen') // codegen failed
    expect(parsed.checkpoint.agent_session_id).toBe('sess-xyz-789')
    expect(parsed.checkpoint.failed_phase).toBe('codegen')
  })

  // Test 4: resume object present with exact shape when completed_phases > 0 (D-03, D-04)
  it('resume object is present with exact tool and args when completed_phases is non-empty (D-03, D-04)', async () => {
    ;(loadRunContext as Mock).mockResolvedValue({
      runId: 'run-resumable',
      prompt:
        'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
      platform: 'swiftui',
      mode: 'fresh',
      status: 'failed',
      timestamp: Date.now(),
      phases: {
        design: { status: 'completed', summary: 'Design done' },
      },
      filesGenerated: [],
      agentSessionId: 'sess-resumable',
    })

    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-resumable',
      },
      mockRunPipeline,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed).toHaveProperty('resume')
    expect(parsed.resume.tool).toBe('dtc_run_pipeline')
    expect(parsed.resume.args.mode).toBe('resume')
    expect(parsed.resume.args.outputDir).toBe('/tmp/dtc-resumable')
    expect(parsed.resume.args.resumeSessionId).toBe('sess-resumable')
  })

  // Test 5: resume object absent when completed_phases is empty (nothing to resume from)
  it('resume object is absent when completed_phases is empty', async () => {
    ;(loadRunContext as Mock).mockResolvedValue(null)
    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Immediate failure'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-not-resumable',
      },
      mockRunPipeline,
    )

    const parsed = JSON.parse(result.text)
    expect(parsed).not.toHaveProperty('resume')
    expect(parsed.resumable).toBe(false)
  })

  // Test 6: resumable boolean convenience field equals completed_phases.length > 0
  it('resumable boolean field equals completed_phases.length > 0', async () => {
    // Case A: no completed phases -> resumable = false
    ;(loadRunContext as Mock).mockResolvedValue(null)
    const mockRunPipelineA = vi.fn().mockRejectedValue(new Error('fail'))

    const resultA = await handleRunPipeline(
      {
        prompt:
          'A counter app with increment and decrement buttons, a home screen showing count, local storage to persist state, no auth needed, minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-resumable-a',
      },
      mockRunPipelineA,
    )

    const parsedA = JSON.parse(resultA.text)
    expect(parsedA.resumable).toBe(false)

    // Case B: has completed phases -> resumable = true
    ;(loadRunContext as Mock).mockResolvedValue({
      runId: 'run-b',
      prompt: 'A counter app with increment and decrement buttons',
      platform: 'swiftui',
      mode: 'fresh',
      status: 'failed',
      timestamp: Date.now(),
      phases: { design: { status: 'completed', summary: 'done' } },
      filesGenerated: [],
    })
    const mockRunPipelineB = vi.fn().mockRejectedValue(new Error('fail'))

    const resultB = await handleRunPipeline(
      {
        prompt:
          'A counter app with increment and decrement buttons, a home screen showing count, local storage to persist state, no auth needed, minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-resumable-b',
      },
      mockRunPipelineB,
    )

    const parsedB = JSON.parse(resultB.text)
    expect(parsedB.resumable).toBe(true)
  })

  // Test 7: error field contains only err.message, not stack trace (D-06)
  it('error field contains only err.message string, not stack trace (D-06)', async () => {
    ;(loadRunContext as Mock).mockResolvedValue(null)
    const mockRunPipeline = vi.fn().mockRejectedValue(new Error('Build crashed with exit code 1'))

    const result = await handleRunPipeline(
      {
        prompt:
          'A todo app with a task list screen showing all tasks, add and delete buttons, local storage persistence, no auth needed, clean minimal design',
        platform: 'swiftui',
        outputDir: '/tmp/dtc-no-stack',
      },
      mockRunPipeline,
    )

    const parsed = JSON.parse(result.text)
    expect(typeof parsed.error).toBe('string')
    expect(parsed.error).toBe('Build crashed with exit code 1')
    // Must not contain stack trace patterns
    expect(parsed.error).not.toContain('at Object.')
    expect(parsed.error).not.toContain('.ts:')
    expect(parsed.error).not.toContain('.js:')
    // The full text must also not contain stack trace
    expect(result.text).not.toContain('at handleRunPipeline')
  })
})
