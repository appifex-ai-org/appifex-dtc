import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pipelineSrc = readFileSync(join(__dirname, '../src/pipeline.ts'), 'utf-8')

describe('Codex agent validation path', () => {
  it('continues to local build and validation after successful Codex codegen', () => {
    expect(pipelineSrc).toContain("if (agent.name === 'codex')")
    expect(pipelineSrc).toContain(
      "emit('build', 'started', 'Running local build after Codex codegen')",
    )
    expect(pipelineSrc).toContain(
      "emit('validate', 'started', 'Running local validation after Codex codegen')",
    )
    expect(pipelineSrc).toContain('if (!codexAgentReport)')
    expect(pipelineSrc).toContain('validateAll(runner, {')
  })

  it('keeps Claude/non-Codex agent path on the existing agent-handled validation branch', () => {
    expect(pipelineSrc).toContain(
      "emit('validate', 'completed', 'Agent completed — all tests passing')",
    )
  })
})
