import { describe, it, expect, vi } from 'vitest'
import { ClaudeAdapter, type CodegenAdapter, type CodegenInput, type CodegenResult } from '../src/index.js'
import type { Runner } from '@appifex/core'

function mockRunner(): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: { hasMaestro: false, hasXcode: false, hasNode: true, hasSemgrep: false, platform: 'darwin' },
  }
}

const sampleInput: CodegenInput = {
  spec: {
    platform: 'swiftui',
    screens: [{
      id: 's1', name: 'Home', componentName: 'HomeView',
      description: 'Main screen', components: [], testIds: {},
    }],
    designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
    imports: ['SwiftUI'],
  },
  uiTestPaths: ['.maestro/home.yaml'],
  unitTestPaths: ['__tests__/requirements.test.ts'],
  outputDir: '/app/src',
}

describe('CodegenAdapter interface', () => {
  it('accepts a custom adapter that implements the interface', async () => {
    const custom: CodegenAdapter = {
      name: 'custom',
      async generate(input: CodegenInput): Promise<CodegenResult> {
        return {
          success: true,
          files: [{ path: '/app/src/Home.tsx', content: '<View />' }],
          tokensUsed: 100,
        }
      },
    }

    const result = await custom.generate(sampleInput)
    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(1)
  })
})

describe('ClaudeAdapter', () => {
  it('writes generated files to runner', async () => {
    const runner = mockRunner()
    const mockGenerate = vi.fn().mockResolvedValue({
      success: true,
      files: [
        { path: 'src/HomeScreen.tsx', content: 'export default function HomeScreen() {}' },
        { path: 'src/theme.ts', content: 'export const colors = {}' },
      ],
      tokensUsed: 5000,
    })

    const adapter = new ClaudeAdapter({ generateFn: mockGenerate })
    const result = await adapter.generate(sampleInput)

    expect(result.success).toBe(true)
    expect(result.files).toHaveLength(2)
    expect(result.tokensUsed).toBe(5000)
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ spec: sampleInput.spec }),
    )
  })

  it('returns failure when generation fails', async () => {
    const mockGenerate = vi.fn().mockResolvedValue({
      success: false,
      files: [],
      tokensUsed: 200,
      error: 'Rate limited',
    })

    const adapter = new ClaudeAdapter({ generateFn: mockGenerate })
    const result = await adapter.generate(sampleInput)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Rate limited')
  })

  it('writes files to outputDir via runner when provided', async () => {
    const runner = mockRunner()
    const mockGenerate = vi.fn().mockResolvedValue({
      success: true,
      files: [{ path: 'Home.tsx', content: 'code' }],
      tokensUsed: 100,
    })

    const adapter = new ClaudeAdapter({ generateFn: mockGenerate })
    const result = await adapter.generateAndWrite(sampleInput, runner)

    expect(runner.writeFile).toHaveBeenCalledWith('/app/src/Home.tsx', 'code')
    expect(result.success).toBe(true)
  })
})
