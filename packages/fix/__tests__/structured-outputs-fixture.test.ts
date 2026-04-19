// Phase 6 (VAL-03 D-11 D-13 D-14, GATE-02): RED smoke test locking the
// Anthropic tool-use parser's fixture-mode compatibility contract.
// Current parser uses ===FIX:=== delimiter + JSON fallback; Plan 06-05 swaps
// to tool_use blocks. This test exercises the NEW shape (tool_use + platform field).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Runner, RunnerCapabilities } from '@appifex/core'
import { createDefaultFixFn } from '../src/default-fix.js'
import type { ValidationResult } from '@appifex/validate'

const caps: RunnerCapabilities = {
  hasMaestro: false,
  hasXcode: false,
  hasNode: true,
  hasSemgrep: false,
  platform: 'darwin',
}

function createMockRunner(files: Record<string, string>): Runner {
  return {
    exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
    readFile: async (p: string) => files[p] ?? '',
    writeFile: async () => {},
    exists: async () => false,
    glob: async () => [],
    capabilities: caps,
  } as unknown as Runner
}

const EMPTY_FAILURES: ValidationResult = {
  ui: {
    total: 1,
    passed: 0,
    failed: 1,
    results: [{ flowName: 'flow', passed: false, duration: 0, error: 'boom', assertions: [] }],
  },
  unit: {
    total: 1,
    passed: 0,
    failed: 1,
    failures: [{ testName: 't', suiteName: 's', error: 'Error on Sources/X.swift' }],
  },
  security: undefined,
  baasIntegration: undefined,
  baasParity: undefined,
  mockLayer: undefined,
  mockParity: undefined,
  allPassed: false,
} as unknown as ValidationResult

describe('default-fix structured-outputs fixture compatibility — Phase 6 (VAL-03 D-13, GATE-02)', () => {
  const ORIGINAL_ENV = process.env.DTC_LLM_MODE

  beforeEach(() => {
    process.env.DTC_LLM_MODE = 'fixture'
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.DTC_LLM_MODE
    else process.env.DTC_LLM_MODE = ORIGINAL_ENV
  })

  it('Test 1 (GATE-02 compat): fixture-mode tool-use parser returns empty-fix envelope for text-only fixture', async () => {
    const runner = createMockRunner({})
    // Phase 6 (VAL-03 D-14): `platform` is NOT yet in DefaultFixOpts — this is the
    // compile-time RED signal. Plan 06-05 adds the field, making this type-check.
    const fix = createDefaultFixFn({
      runner,
      projectDir: '/proj',
      apiKey: 'test-key',
      platform: 'swiftui',
    })
    const result = await fix(EMPTY_FAILURES)
    expect(result).toEqual({ filesChanged: [], tokensUsed: 0 })
  })

  it('Test 2 (D-11 — NEW parser reads tool_use.input.fixes and writes files)', async () => {
    // Phase 6 (VAL-03 D-11): the NEW parser finds tool_use blocks and applies
    // fixes from input.fixes. Today's parser only scans `text` content blocks
    // for ===FIX:=== delimiters or a JSON object — it IGNORES tool_use blocks
    // entirely, so this assertion fails on the current code path.
    delete process.env.DTC_LLM_MODE
    const writtenPaths: string[] = []
    const writeTrackingRunner: Runner = {
      exec: async () => ({ command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }),
      readFile: async () => '',
      writeFile: async (p: string) => {
        writtenPaths.push(p)
      },
      exists: async () => false,
      glob: async () => [],
      capabilities: caps,
    } as unknown as Runner

    const fix = createDefaultFixFn({
      runner: writeTrackingRunner,
      projectDir: '/proj',
      apiKey: 'test-key',
      platform: 'swiftui',
      createMessage: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'submit_fixes',
            input: { fixes: [{ path: 'Sources/X.swift', content: 'fixed content' }] },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    })
    const result = await fix(EMPTY_FAILURES)
    expect(result.filesChanged).toEqual(['/proj/Sources/X.swift'])
    expect(result.tokensUsed).toBe(15)
    expect(writtenPaths).toEqual(['/proj/Sources/X.swift'])
  })
})
