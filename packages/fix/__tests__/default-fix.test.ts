import { describe, it, expect, vi } from 'vitest'
import { createDefaultFixFn } from '../src/default-fix.js'
import type { ValidationResult } from '@appifex/validate'
import type { Runner } from '@appifex/core'

function mockRunner(): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: vi.fn().mockResolvedValue('export default function Home() { return null }'),
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
        error: 'adoptButton not visible',
        assertions: [],
      },
    ],
  },
  unit: {
    total: 3,
    passed: 2,
    failed: 1,
    failures: [
      { testName: 'validateEmail', suiteName: 'forms', error: 'Expected false, got true' },
    ],
  },
  allPassed: false,
}

describe('createDefaultFixFn', () => {
  it('sends failures to LLM and applies file patches', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            fixes: [
              {
                path: '/app/src/Home.tsx',
                content: 'export default function Home() { return <View testID="adoptButton" /> }',
              },
            ],
          }),
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
    })

    const result = await fixFn(failingValidation)

    // Should call LLM with failure details
    expect(mockCreate).toHaveBeenCalledOnce()
    const prompt = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('adoptButton not visible')
    expect(prompt).toContain('validateEmail')

    // Should write fixed files
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
