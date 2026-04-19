import { describe, it, expect, vi } from 'vitest'
import { createDefaultFixFn } from '../src/default-fix.js'
import type { ValidationResult } from '@appifex/validate'
import type { Runner } from '@appifex/core'

// Phase 6 (VAL-03 D-11 D-14): these tests were rewritten from the ===FIX:=== delimiter
// contract to the new Anthropic tool-use contract. The parser now reads `content[].type ===
// 'tool_use'` with `name === 'submit_fixes'` and applies `input.fixes`. See 06-05-PLAN.md.

function mockRunner(overrides: Partial<Runner> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: vi.fn().mockResolvedValue('export default function Home() { return null }'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    // Ranker's scanProject + buildNavGraph glob for source files. Return a seed that the ranker
    // can populate the `errorFiles` Set from (via the `src/Home.tsx` path referenced in a failure).
    glob: vi.fn().mockResolvedValue(['/app/src/Home.tsx']),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
    ...overrides,
  } as unknown as Runner
}

// Phase 6 (VAL-02): the ranker requires a failure whose `error` text mentions a `src/...` or
// `Sources/...` path so P1 picks it up. Otherwise the ranker returns [] + maxFiles = 0 and the
// N=0 short-circuit triggers before calling the LLM.
const failingValidation: ValidationResult = {
  ui: {
    total: 5,
    passed: 4,
    failed: 1,
    results: [
      { flowName: 'browse', passed: true, duration: 100, assertions: [] },
      {
        flowName: 'detail',
        passed: false,
        duration: 100,
        error: 'adoptButton not visible in src/Home.tsx',
        assertions: [],
      },
    ],
  },
  unit: {
    total: 3,
    passed: 2,
    failed: 1,
    failures: [
      {
        testName: 'validateEmail',
        suiteName: 'forms',
        error: 'Expected false, got true at src/Home.tsx:10',
      },
    ],
  },
  allPassed: false,
} as unknown as ValidationResult

describe('createDefaultFixFn', () => {
  it('sends failures to LLM via tool-use and applies file patches from tool_use.input.fixes', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_test',
          name: 'submit_fixes',
          input: {
            fixes: [
              {
                // Phase 6 (VAL-03, Pitfall 1): path-traversal guard requires relative + allowed prefix.
                path: 'src/Home.tsx',
                content: 'export default function Home() { return <View testID="adoptButton" /> }',
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 800, output_tokens: 600 },
    })

    const runner = mockRunner()
    const fixFn = createDefaultFixFn({
      apiKey: 'sk-ant-test',
      runner,
      projectDir: '/app',
      createMessage: mockCreate,
      // Phase 6 (VAL-02 D-10): unbounded ranker budget so maxFiles > 0 in test.
    })

    const result = await fixFn(failingValidation)

    // Phase 6 (VAL-03 D-14): LLM is called with tools + tool_choice forcing submit_fixes.
    expect(mockCreate).toHaveBeenCalledOnce()
    const call = mockCreate.mock.calls[0][0]
    const prompt = call.messages[0].content
    expect(prompt).toContain('adoptButton not visible')
    expect(prompt).toContain('validateEmail')
    expect(call.tools).toBeDefined()
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'submit_fixes' })

    // Phase 6 (VAL-03): tool_use.input.fixes entries are written to `<projectDir>/<path>`.
    expect(runner.writeFile).toHaveBeenCalledWith(
      '/app/src/Home.tsx',
      expect.stringContaining('adoptButton'),
    )

    expect(result.filesChanged).toEqual(['/app/src/Home.tsx'])
    expect(result.tokensUsed).toBe(1400)
  })

  it('returns empty fix when LLM fails', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('API error'))

    const fixFn = createDefaultFixFn({
      apiKey: 'sk-ant-test',
      runner: mockRunner(),
      projectDir: '/app',
      createMessage: mockCreate,
    })

    const result = await fixFn(failingValidation)

    expect(result.filesChanged).toEqual([])
    expect(result.tokensUsed).toBe(0)
  })
})
