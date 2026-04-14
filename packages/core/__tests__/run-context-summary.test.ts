import { describe, it, expect } from 'vitest'
import { buildContextSummary } from '../src/run-context.js'
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
      spec: { status: 'completed', summary: '3 screens, 12 components' },
      test_gen: { status: 'completed', summary: '4 UI flows, 8 unit tests' },
      codegen: { status: 'completed', summary: 'Agent: claude — 15 files generated' },
      build: { status: 'completed', summary: 'swiftui build succeeded' },
      validate: { status: 'completed', summary: 'UI 4/4  Unit 8/8' },
    },
    filesGenerated: [
      'Sources/App.swift',
      'Sources/Views/HomeView.swift',
      'Sources/Models/Pet.swift',
    ],
    agentSessionId: 'session-xyz',
    ...overrides,
  }
}

describe('buildContextSummary', () => {
  it('produces a summary for a successful run', () => {
    const summary = buildContextSummary(makeContext())

    expect(summary).toContain('Build a pet adoption app')
    expect(summary).toContain('swiftui')
    expect(summary).toContain('completed')
    // Phase summaries should be included
    expect(summary).toContain('Design created (2 iterations)')
    expect(summary).toContain('3 screens, 12 components')
    expect(summary).toContain('UI 4/4  Unit 8/8')
    // Files list
    expect(summary).toContain('Sources/App.swift')
    expect(summary).toContain('Sources/Views/HomeView.swift')
  })

  it('includes failed phase details', () => {
    const ctx = makeContext({
      status: 'failed',
      phases: {
        design: { status: 'completed', summary: 'Design created' },
        spec: { status: 'completed', summary: '2 screens' },
        test_gen: { status: 'completed', summary: '3 UI flows' },
        codegen: { status: 'completed', summary: '10 files' },
        build: { status: 'failed', summary: 'Build failed: missing import Foundation' },
      },
    })
    const summary = buildContextSummary(ctx)

    expect(summary).toContain('failed')
    expect(summary).toContain('Build failed: missing import Foundation')
  })

  it('includes budget_exceeded status and session ID', () => {
    const ctx = makeContext({
      status: 'budget_exceeded',
      phases: {
        design: { status: 'completed', summary: 'Done' },
        codegen: { status: 'failed', summary: 'Budget exceeded at $10.00' },
      },
      agentSessionId: 'sess-12345',
    })
    const summary = buildContextSummary(ctx)

    expect(summary).toContain('budget_exceeded')
    expect(summary).toContain('sess-12345')
  })

  it('handles context with no files generated', () => {
    const ctx = makeContext({ filesGenerated: [] })
    const summary = buildContextSummary(ctx)

    expect(summary).toContain('Build a pet adoption app')
    // Should not crash, should still produce output
    expect(summary.length).toBeGreaterThan(0)
  })

  it('shows skipped phases', () => {
    const ctx = makeContext({
      phases: {
        design: { status: 'completed', summary: 'Done' },
        spec: { status: 'completed', summary: 'Done' },
        test_gen: { status: 'completed', summary: 'Done' },
        codegen: { status: 'failed', summary: 'Failed' },
        build: { status: 'skipped', summary: 'Skipped — codegen failed' },
        validate: { status: 'skipped', summary: 'Skipped — build not attempted' },
      },
    })
    const summary = buildContextSummary(ctx)

    expect(summary).toContain('skipped')
  })
})
