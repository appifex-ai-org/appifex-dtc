import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveRunContext, loadRunContext, PHASE_ORDER } from '../src/run-context.js'
import type { RunContext } from '../src/types.js'

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-abc123',
    prompt: 'Build a pet adoption app',
    platform: 'swiftui',
    mode: 'fresh',
    status: 'completed',
    timestamp: 1712100000000,
    phases: {
      design: { status: 'completed', summary: 'Design created (2 iterations)' },
      spec: { status: 'completed', summary: '3 screens, 12 components', detail: { screenCount: 3, componentCount: 12 } },
      test_gen: { status: 'completed', summary: '4 UI flows, 8 unit tests', artifacts: { flowDir: '.maestro', testDir: '__tests__' } },
      codegen: { status: 'completed', summary: 'Agent: claude — 15 files generated' },
      build: { status: 'completed', summary: 'swiftui build succeeded' },
      validate: { status: 'completed', summary: 'UI 4/4  Unit 8/8', detail: { ui: { passed: 4, total: 4 }, unit: { passed: 8, total: 8 }, allPassed: true } },
    },
    filesGenerated: ['Sources/App.swift', 'Sources/Views/HomeView.swift'],
    agentSessionId: 'session-xyz',
    ...overrides,
  }
}

describe('RunContext', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dtc-run-ctx-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('saves and loads a run context', async () => {
    const ctx = makeContext()
    await saveRunContext(dir, ctx)
    const loaded = await loadRunContext(dir)

    expect(loaded).toEqual(ctx)
  })

  it('returns null when no context file exists', async () => {
    const loaded = await loadRunContext(dir)
    expect(loaded).toBeNull()
  })

  it('overwrites an existing context on save', async () => {
    const first = makeContext({ prompt: 'First run' })
    await saveRunContext(dir, first)

    const second = makeContext({ prompt: 'Second run', runId: 'run-def456' })
    await saveRunContext(dir, second)

    const loaded = await loadRunContext(dir)
    expect(loaded).toEqual(second)
    expect(loaded!.prompt).toBe('Second run')
  })

  it('preserves all phase outcomes through round-trip', async () => {
    const ctx = makeContext({
      phases: {
        design: { status: 'completed', summary: 'Done' },
        spec: { status: 'completed', summary: 'Done' },
        test_gen: { status: 'completed', summary: 'Done' },
        codegen: { status: 'failed', summary: 'Budget exceeded' },
        build: { status: 'skipped', summary: 'Skipped — codegen failed' },
      },
      status: 'budget_exceeded',
    })
    await saveRunContext(dir, ctx)
    const loaded = await loadRunContext(dir)

    expect(loaded!.phases.codegen!.status).toBe('failed')
    expect(loaded!.phases.build!.status).toBe('skipped')
    expect(loaded!.status).toBe('budget_exceeded')
  })

  it('creates .dtc directory if it does not exist', async () => {
    const nested = join(dir, 'my-app')
    const ctx = makeContext()
    await saveRunContext(nested, ctx)

    const loaded = await loadRunContext(nested)
    expect(loaded).toEqual(ctx)
  })

  it('handles context with no agentSessionId', async () => {
    const ctx = makeContext({ agentSessionId: undefined })
    await saveRunContext(dir, ctx)
    const loaded = await loadRunContext(dir)

    expect(loaded!.agentSessionId).toBeUndefined()
  })

  it('returns null for malformed JSON (missing required fields)', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const dtcDir = join(dir, '.dtc')
    await mkdir(dtcDir, { recursive: true })
    await writeFile(join(dtcDir, 'run-context.json'), JSON.stringify({ foo: 'bar' }))

    const loaded = await loadRunContext(dir)
    expect(loaded).toBeNull()
  })

  it('returns null for JSON with wrong types', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const dtcDir = join(dir, '.dtc')
    await mkdir(dtcDir, { recursive: true })
    await writeFile(join(dtcDir, 'run-context.json'), JSON.stringify({ runId: 123, platform: null, phases: 'wrong' }))

    const loaded = await loadRunContext(dir)
    expect(loaded).toBeNull()
  })
})

describe('PHASE_ORDER', () => {
  it("contains 'design_delta' at index 3 (immediately after 'spec')", () => {
    expect(PHASE_ORDER[3]).toBe('design_delta')
    expect(PHASE_ORDER[2]).toBe('spec')
  })

  it("includes 'design_delta' in the full ordered list", () => {
    expect(PHASE_ORDER).toContain('design_delta')
  })

  it("includes 'mock_service' between 'baas_auth' and 'test_gen'", () => {
    expect(PHASE_ORDER).toContain('mock_service')
    const mockIdx = PHASE_ORDER.indexOf('mock_service')
    const baasAuthIdx = PHASE_ORDER.indexOf('baas_auth')
    const testGenIdx = PHASE_ORDER.indexOf('test_gen')
    expect(mockIdx).toBe(baasAuthIdx + 1)
    expect(mockIdx).toBe(testGenIdx - 1)
  })
})
