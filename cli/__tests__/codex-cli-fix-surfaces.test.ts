import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const entrySource = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf-8')
const mcpFixSource = readFileSync(
  new URL('../../packages/mcp-server/src/tools/fix.ts', import.meta.url),
  'utf-8',
)

describe('codex-cli fix surface routing', () => {
  it('routes dtc fix through the Codex CLI fix adapter', () => {
    expect(entrySource).toContain('createCodexCliFixFn')
    expect(entrySource).toContain("config.llm.provider === 'codex-cli'")
    expect(entrySource).toContain('createCodexCliFixFn({')
    expect(entrySource).toContain('projectDir: project')
    expect(entrySource).toContain('platform: platform as Platform')
  })

  it('routes MCP fix through the Codex CLI fix adapter', () => {
    expect(mcpFixSource).toContain('createCodexCliFixFn')
    expect(mcpFixSource).toContain("config.llm.provider === 'codex-cli'")
    expect(mcpFixSource).toContain(
      'createCodexCliFixFn({ runner, projectDir, model: config.llm.model, platform })',
    )
  })
})
