import { describe, it, expect, vi } from 'vitest'
import { createDefaultGenerateFn } from '../src/default-generate.js'
import type { CodegenInput } from '../src/types.js'

const sampleInput: CodegenInput = {
  spec: {
    platform: 'swiftui',
    screens: [
      {
        id: 's1',
        name: 'Home',
        componentName: 'HomeView',
        description: 'Main screen with greeting',
        components: [
          {
            id: 'c1',
            platformType: 'Text',
            name: 'Greeting',
            props: { testID: 'greeting' },
            style: {},
            testId: 'greeting',
          },
        ],
        testIds: { c1: 'greeting' },
      },
    ],
    designTokens: { colors: { primary: '#FF6B35' }, typography: {}, spacing: {}, borderRadius: {} },
    imports: ['SwiftUI'],
  },
  uiTestPaths: ['.maestro/home.yaml'],
  unitTestPaths: ['__tests__/requirements.test.ts'],
  outputDir: '/app/src',
}

describe('createDefaultGenerateFn', () => {
  it('calls the LLM with spec and test context in the prompt', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            files: [
              {
                path: 'HomeView.swift',
                content: 'struct HomeView: View { var body: some View { Text("Hello") } }',
              },
              {
                path: 'Theme.swift',
                content: 'enum AppColors { static let primary = Color(hex: "#FF6B35") }',
              },
            ],
          }),
        },
      ],
      usage: { input_tokens: 500, output_tokens: 1500 },
    })

    const generateFn = createDefaultGenerateFn({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
      createMessage: mockCreate,
    })

    const result = await generateFn(sampleInput)

    expect(mockCreate).toHaveBeenCalledOnce()
    const callArgs = mockCreate.mock.calls[0][0]
    // Should include the spec in the prompt
    expect(callArgs.messages[0].content).toContain('HomeView')
    expect(callArgs.messages[0].content).toContain('swiftui')
    // Should mention tests
    expect(callArgs.messages[0].content).toContain('test')
    // Should request JSON output
    expect(callArgs.messages[0].content).toContain('JSON')

    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(2)
    expect(result.files[0].path).toBe('HomeView.swift')
    expect(result.tokensUsed).toBe(2000)
  })

  it('returns failure when LLM returns invalid JSON', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I cannot generate code.' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const generateFn = createDefaultGenerateFn({
      apiKey: 'sk-ant-test',
      createMessage: mockCreate,
    })

    const result = await generateFn(sampleInput)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.tokensUsed).toBe(150)
  })

  it('returns failure when API call throws', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Rate limited'))

    const generateFn = createDefaultGenerateFn({
      apiKey: 'sk-ant-test',
      createMessage: mockCreate,
    })

    const result = await generateFn(sampleInput)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Rate limited')
  })
})
