import { describe, it, expect, vi, beforeEach } from 'vitest'
import { planModifications } from '../src/modification-planner.js'
import type { Runner, RunnerCapabilities, AppContext } from '@appifex/core'

/** Minimal mock Runner for testing modification planner */
function createMockRunner(files: Record<string, string>): Runner & { writeFileSpy: ReturnType<typeof vi.fn> } {
  const caps: RunnerCapabilities = {
    hasMaestro: false,
    hasXcode: false,
    hasNode: true,
    hasSemgrep: false,
    platform: 'darwin',
  }
  const writeFileSpy = vi.fn().mockResolvedValue(undefined)
  return {
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: async (path: string) => {
      const content = files[path]
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    writeFile: writeFileSpy,
    exists: async (path: string) => path in files,
    glob: async (_pattern: string) => Object.keys(files),
    capabilities: caps,
    writeFileSpy,
  }
}

const OUTPUT_DIR = '/project'

function makeAppContext(overrides?: Partial<AppContext>): AppContext {
  return {
    platform: 'swiftui',
    inventory: [
      { filePath: 'Sources/ContentView.swift', type: 'screen', name: 'ContentView' },
      { filePath: 'Sources/SettingsView.swift', type: 'screen', name: 'SettingsView' },
    ],
    navGraph: [
      { screenId: 'Sources/ContentView.swift', type: 'tab', targets: ['Sources/SettingsView.swift'] },
    ],
    entryPoint: 'Sources/ContentView.swift',
    scannedAt: Date.now(),
    ...overrides,
  }
}

function makeCreateMessage(responseItems: object[], reasoning = 'The feature requires nav changes') {
  return vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ items: responseItems, reasoning }),
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  })
}

describe('planModifications', () => {
  // Test 1: returns items with correct shape when LLM response includes modification items
  it('returns items with correct shape (filePath, screenName, changeDescription, changeType, fileContent)', async () => {
    const fileContent = 'struct ContentView: View { var body: some View { Text("Hello") } }'
    const runner = createMockRunner({
      '/project/Sources/ContentView.swift': fileContent,
    })
    const createMessage = makeCreateMessage([
      {
        filePath: 'Sources/ContentView.swift',
        screenName: 'ContentView',
        changeDescription: 'Add Settings tab to TabView',
        changeType: 'navigation',
      },
    ])
    const appContext = makeAppContext()
    const result = await planModifications('Add a settings screen', appContext, OUTPUT_DIR, runner, createMessage)

    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item.filePath).toBe('Sources/ContentView.swift')
    expect(item.screenName).toBe('ContentView')
    expect(item.changeDescription).toBe('Add Settings tab to TabView')
    expect(item.changeType).toBe('navigation')
    expect(item.fileContent).toBe(fileContent)
  })

  // Test 2: returns { items: [] } when LLM says no modifications needed
  it('returns { items: [] } when LLM response says no modifications needed (new-screen-only feature)', async () => {
    const runner = createMockRunner({})
    const createMessage = makeCreateMessage([], 'This feature only adds new screens')
    const appContext = makeAppContext()
    const result = await planModifications('Add a brand new Help screen', appContext, OUTPUT_DIR, runner, createMessage)

    expect(result.items).toEqual([])
  })

  // Test 3: loads fileContent from runner.readFile for each item
  it('loads fileContent from runner.readFile for each item returned by LLM', async () => {
    const content1 = 'struct ContentView: View { }'
    const content2 = 'struct SettingsView: View { }'
    const runner = createMockRunner({
      '/project/Sources/ContentView.swift': content1,
      '/project/Sources/SettingsView.swift': content2,
    })
    const createMessage = makeCreateMessage([
      { filePath: 'Sources/ContentView.swift', screenName: 'ContentView', changeDescription: 'Add tab', changeType: 'navigation' },
      { filePath: 'Sources/SettingsView.swift', screenName: 'SettingsView', changeDescription: 'Add button', changeType: 'button' },
    ])
    const appContext = makeAppContext()
    const result = await planModifications('Add settings navigation', appContext, OUTPUT_DIR, runner, createMessage)

    expect(result.items).toHaveLength(2)
    expect(result.items[0].fileContent).toBe(content1)
    expect(result.items[1].fileContent).toBe(content2)
  })

  // Test 4: returns { items: [] } when LLM response is invalid JSON
  it('returns { items: [] } when LLM response is invalid JSON (graceful degradation)', async () => {
    const runner = createMockRunner({})
    const createMessage = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Here is the plan:\n{invalid json' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    })
    const appContext = makeAppContext()
    const result = await planModifications('Add settings', appContext, OUTPUT_DIR, runner, createMessage)

    expect(result.items).toEqual([])
  })

  // Test 5: logs raw LLM response to .dtc-debug/modification-plan-raw.txt on parse failure
  it('logs raw LLM response to .dtc-debug/modification-plan-raw.txt on parse failure', async () => {
    const rawText = 'Here is the plan:\n{invalid json'
    const runner = createMockRunner({})
    const createMessage = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: rawText }],
      usage: { input_tokens: 50, output_tokens: 20 },
    })
    const appContext = makeAppContext()
    await planModifications('Add settings', appContext, OUTPUT_DIR, runner, createMessage)

    expect(runner.writeFileSpy).toHaveBeenCalledWith(
      '/project/.dtc-debug/modification-plan-raw.txt',
      rawText,
    )
  })

  // Test 6: truncates items when total file content exceeds 8000 token budget (32000 chars), keeping navigation first
  it('truncates items when total file content exceeds 8000 token budget, keeping navigation-type items first', async () => {
    // Create files large enough to exceed the 32000 char budget
    const largeContent = 'x'.repeat(12000)
    const runner = createMockRunner({
      '/project/Sources/OtherView.swift': largeContent,
      '/project/Sources/FormView.swift': largeContent,
      '/project/Sources/ContentView.swift': largeContent,
    })
    // navigation item has lower priority index → kept first
    const createMessage = makeCreateMessage([
      { filePath: 'Sources/OtherView.swift', screenName: 'OtherView', changeDescription: 'Add layout', changeType: 'other' },
      { filePath: 'Sources/FormView.swift', screenName: 'FormView', changeDescription: 'Add form field', changeType: 'form' },
      { filePath: 'Sources/ContentView.swift', screenName: 'ContentView', changeDescription: 'Add nav tab', changeType: 'navigation' },
    ])
    const appContext = makeAppContext({
      inventory: [
        { filePath: 'Sources/OtherView.swift', type: 'screen', name: 'OtherView' },
        { filePath: 'Sources/FormView.swift', type: 'screen', name: 'FormView' },
        { filePath: 'Sources/ContentView.swift', type: 'screen', name: 'ContentView' },
      ],
    })
    const result = await planModifications('Add settings', appContext, OUTPUT_DIR, runner, createMessage)

    // Total would be 36000 chars (3 * 12000), budget is 32000
    // After sorting by priority (navigation first), must trim to fit budget
    // navigation (12000) + form (12000) = 24000 < 32000, add other (12000) = 36000 > 32000, so only 2 items
    expect(result.items.length).toBeLessThan(3)
    // navigation item must be kept (highest priority)
    const changeTypes = result.items.map((i) => i.changeType)
    expect(changeTypes).toContain('navigation')
    // 'other' should be dropped (lowest priority) if budget exceeded
    expect(changeTypes).not.toContain('other')
  })

  // Test 7: sends prompt containing inventory screen names, file paths, and navGraph screenIds
  it('sends prompt containing inventory screen names, file paths, and navGraph screenIds to LLM', async () => {
    const runner = createMockRunner({})
    const createMessage = makeCreateMessage([])
    const appContext = makeAppContext()
    await planModifications('Add a settings screen', appContext, OUTPUT_DIR, runner, createMessage)

    expect(createMessage).toHaveBeenCalledOnce()
    const callArgs = createMessage.mock.calls[0][0]
    const promptText = callArgs.messages[0].content as string

    // Should contain inventory screen names and file paths
    expect(promptText).toContain('ContentView')
    expect(promptText).toContain('Sources/ContentView.swift')
    expect(promptText).toContain('SettingsView')
    expect(promptText).toContain('Sources/SettingsView.swift')
    // Should contain navGraph screenIds
    expect(promptText).toContain('Sources/ContentView.swift')
    // Should contain entry point
    expect(promptText).toContain('Sources/ContentView.swift')
    // Should contain the feature prompt
    expect(promptText).toContain('Add a settings screen')
  })

  // Test 8: skips items where readFile throws (file not found) without crashing
  it('skips items where readFile throws (file not found) without crashing the whole plan', async () => {
    const runner = createMockRunner({
      '/project/Sources/ContentView.swift': 'struct ContentView: View { }',
      // SettingsView not in files — will throw
    })
    const createMessage = makeCreateMessage([
      { filePath: 'Sources/ContentView.swift', screenName: 'ContentView', changeDescription: 'Add tab', changeType: 'navigation' },
      { filePath: 'Sources/MissingView.swift', screenName: 'MissingView', changeDescription: 'Add button', changeType: 'button' },
    ])
    const appContext = makeAppContext()
    const result = await planModifications('Add settings navigation', appContext, OUTPUT_DIR, runner, createMessage)

    // Should have only the item that was found
    expect(result.items).toHaveLength(1)
    expect(result.items[0].screenName).toBe('ContentView')
  })
})
