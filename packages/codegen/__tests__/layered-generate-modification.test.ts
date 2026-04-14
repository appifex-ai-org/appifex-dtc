/**
 * Tests for modificationPlan rendering in buildLayeredPrompt (Phase 8, D-05 / GAP-1).
 *
 * Verifies:
 *  1. When modificationPlan has items, codegenInput includes the field (pipeline side)
 *  2. buildLayeredPrompt renders modification plan section when items present
 *  3. buildLayeredPrompt omits modification plan section when plan is undefined or empty
 *
 * These tests use a mock createMessage to capture the prompt text sent to the LLM.
 */
import { describe, it, expect, vi } from 'vitest'
import { createLayeredGenerateFn } from '../src/layered-generate.js'
import type { CodegenInput } from '../src/types.js'
import type { ModificationPlan } from '@appifex/core'

const baseSpec = {
  platform: 'swiftui' as const,
  screens: [
    {
      id: 's1',
      name: 'Home',
      componentName: 'HomeView',
      description: 'Main screen',
      components: [],
      testIds: {},
    },
  ],
  designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
  imports: ['SwiftUI'],
}

const baseInput: CodegenInput = {
  spec: baseSpec,
  uiTestPaths: [],
  unitTestPaths: [],
  outputDir: '/tmp/test-output',
}

function makeModificationPlan(items: ModificationPlan['items'] = []): ModificationPlan {
  return { items }
}

function makeMockCreateMessage(capturedPrompts: string[]) {
  return vi.fn().mockImplementation(async (params: { messages: Array<{ content: unknown }> }) => {
    const msg = params.messages[0]
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? (msg.content.find((c: { type: string; text?: string }) => c.type === 'text')?.text ??
            '')
          : ''
    capturedPrompts.push(content)
    return {
      content: [
        {
          type: 'text',
          text: '===FILE: Sources/HomeView.swift===\nstruct HomeView: View { var body: some View { Text("Hello") } }\n===END_FILE===',
        },
      ],
      usage: { input_tokens: 100, output_tokens: 200 },
    }
  })
}

describe('buildLayeredPrompt: modificationPlan rendering', () => {
  it('renders modification plan section when plan has items', async () => {
    const capturedPrompts: string[] = []
    const mockCreate = makeMockCreateMessage(capturedPrompts)

    const plan = makeModificationPlan([
      {
        filePath: 'Sources/ContentView.swift',
        screenName: 'ContentView',
        changeDescription: 'Add new tab for Settings',
        changeType: 'navigation',
        fileContent: 'struct ContentView: View { var body: some View { TabView {} } }',
      },
    ])

    const input: CodegenInput = {
      ...baseInput,
      modificationPlan: plan,
    }

    const generateFn = createLayeredGenerateFn({
      apiKey: 'test-key',
      model: 'test-model',
      createMessage: mockCreate,
    })

    await generateFn(input)

    expect(capturedPrompts.length).toBeGreaterThan(0)
    const prompt = capturedPrompts[0]

    // Must contain the modification plan header
    expect(prompt).toContain('Modification Plan (files you MUST modify)')
    // Must contain the file path
    expect(prompt).toContain('Sources/ContentView.swift')
    // Must contain the change description
    expect(prompt).toContain('Add new tab for Settings')
    // Must contain the file content
    expect(prompt).toContain('struct ContentView: View')
  })

  it('omits modification plan section when plan is undefined', async () => {
    const capturedPrompts: string[] = []
    const mockCreate = makeMockCreateMessage(capturedPrompts)

    const input: CodegenInput = {
      ...baseInput,
      modificationPlan: undefined,
    }

    const generateFn = createLayeredGenerateFn({
      apiKey: 'test-key',
      model: 'test-model',
      createMessage: mockCreate,
    })

    await generateFn(input)

    const prompt = capturedPrompts[0]
    expect(prompt).not.toContain('Modification Plan (files you MUST modify)')
  })

  it('omits modification plan section when plan has no items', async () => {
    const capturedPrompts: string[] = []
    const mockCreate = makeMockCreateMessage(capturedPrompts)

    const input: CodegenInput = {
      ...baseInput,
      modificationPlan: makeModificationPlan([]),
    }

    const generateFn = createLayeredGenerateFn({
      apiKey: 'test-key',
      model: 'test-model',
      createMessage: mockCreate,
    })

    await generateFn(input)

    const prompt = capturedPrompts[0]
    expect(prompt).not.toContain('Modification Plan (files you MUST modify)')
  })

  it('renders multiple modification plan items', async () => {
    const capturedPrompts: string[] = []
    const mockCreate = makeMockCreateMessage(capturedPrompts)

    const plan = makeModificationPlan([
      {
        filePath: 'Sources/ContentView.swift',
        screenName: 'ContentView',
        changeDescription: 'Add Settings tab',
        changeType: 'navigation',
        fileContent: 'struct ContentView: View {}',
      },
      {
        filePath: 'Sources/Views/HomeView.swift',
        screenName: 'HomeView',
        changeDescription: 'Add logout button',
        changeType: 'layout',
        fileContent: 'struct HomeView: View {}',
      },
    ])

    const input: CodegenInput = { ...baseInput, modificationPlan: plan }

    const generateFn = createLayeredGenerateFn({
      apiKey: 'test-key',
      model: 'test-model',
      createMessage: mockCreate,
    })

    await generateFn(input)

    const prompt = capturedPrompts[0]
    expect(prompt).toContain('Sources/ContentView.swift')
    expect(prompt).toContain('Sources/Views/HomeView.swift')
    expect(prompt).toContain('Add Settings tab')
    expect(prompt).toContain('Add logout button')
  })
})
