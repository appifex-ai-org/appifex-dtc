import { describe, it, expect } from 'vitest'
import { RunContextBuilder, PHASE_ORDER } from '../src/run-context.js'

describe('RunContextBuilder', () => {
  it('builds a context with all completed phases', () => {
    const builder = new RunContextBuilder({
      prompt: 'Build a todo app',
      platform: 'swiftui',
      mode: 'fresh',
    })

    builder.recordPhase('design', 'completed', 'Design created (1 iteration)')
    builder.recordPhase('spec', 'completed', '2 screens, 8 components', { screenCount: 2 })
    builder.recordPhase('codegen', 'completed', '10 files generated')
    builder.recordPhase('build', 'completed', 'Build succeeded')
    builder.recordPhase('validate', 'completed', 'UI 3/3  Unit 5/5', { allPassed: true })
    builder.setFilesGenerated(['Sources/App.swift', 'Sources/Views/HomeView.swift'])

    const ctx = builder.build('completed')

    expect(ctx.prompt).toBe('Build a todo app')
    expect(ctx.platform).toBe('swiftui')
    expect(ctx.mode).toBe('fresh')
    expect(ctx.status).toBe('completed')
    expect(ctx.runId).toBeTruthy()
    expect(ctx.timestamp).toBeGreaterThan(0)
    expect(ctx.phases.design?.status).toBe('completed')
    expect(ctx.phases.spec?.detail).toEqual({ screenCount: 2 })
    expect(ctx.phases.validate?.status).toBe('completed')
    expect(ctx.filesGenerated).toEqual(['Sources/App.swift', 'Sources/Views/HomeView.swift'])
  })

  it('builds a context with a failed phase', () => {
    const builder = new RunContextBuilder({
      prompt: 'Build an app',
      platform: 'swiftui',
      mode: 'fresh',
    })

    builder.recordPhase('design', 'completed', 'Done')
    builder.recordPhase('codegen', 'failed', 'Budget exceeded at $10.00')

    const ctx = builder.build('budget_exceeded')

    expect(ctx.status).toBe('budget_exceeded')
    expect(ctx.phases.codegen?.status).toBe('failed')
    expect(ctx.phases.codegen?.summary).toBe('Budget exceeded at $10.00')
  })

  it('records agent session ID', () => {
    const builder = new RunContextBuilder({
      prompt: 'Build an app',
      platform: 'swiftui',
      mode: 'fresh',
    })

    builder.setAgentSessionId('sess-abc123')
    const ctx = builder.build('completed')

    expect(ctx.agentSessionId).toBe('sess-abc123')
  })

  it('records phase artifacts', () => {
    const builder = new RunContextBuilder({
      prompt: 'Build an app',
      platform: 'swiftui',
      mode: 'fresh',
    })

    builder.recordPhase('test_gen', 'completed', '4 flows, 6 tests', undefined, {
      flowDir: '.maestro',
      testDir: '__tests__',
    })

    const ctx = builder.build('completed')
    expect(ctx.phases.test_gen?.artifacts).toEqual({ flowDir: '.maestro', testDir: '__tests__' })
  })

  it('generates unique run IDs', () => {
    const b1 = new RunContextBuilder({ prompt: 'a', platform: 'swiftui', mode: 'fresh' })
    const b2 = new RunContextBuilder({ prompt: 'b', platform: 'swiftui', mode: 'fresh' })

    const ctx1 = b1.build('completed')
    const ctx2 = b2.build('completed')

    expect(ctx1.runId).not.toBe(ctx2.runId)
  })

  it('builds context for resume mode', () => {
    const builder = new RunContextBuilder({
      prompt: 'Continue building the app',
      platform: 'swiftui',
      mode: 'resume',
    })

    builder.recordPhase('codegen', 'completed', 'Resumed — 5 more files')
    const ctx = builder.build('completed')

    expect(ctx.mode).toBe('resume')
  })

  it('setDesignDelta round-trips through build()', () => {
    const builder = new RunContextBuilder({
      prompt: 'Add dark mode',
      platform: 'swiftui',
      mode: 'add-feature',
    })
    const delta = { added: [], removed: [], changed: [] }
    builder.setDesignDelta(delta)
    const ctx = builder.build('completed')
    expect(ctx.designDelta).toEqual(delta)
  })

  it('designDelta is absent from built context when setDesignDelta was not called', () => {
    const builder = new RunContextBuilder({
      prompt: 'Fresh app',
      platform: 'swiftui',
      mode: 'fresh',
    })
    const ctx = builder.build('completed')
    expect(ctx.designDelta).toBeUndefined()
  })

  it('setBaselineDesignTokens is emitted in build() output (Phase 18 Bug B fix)', () => {
    const builder = new RunContextBuilder({
      prompt: 'Build a todo app',
      platform: 'swiftui',
      mode: 'fresh',
    })
    const tokens = {
      colors: { '-Primary': '#3D8A5A', '-Background': '#FFFFFF' },
      typography: {},
      spacing: { sm: 8 },
      borderRadius: { md: 12 },
    }
    builder.setBaselineDesignTokens(tokens)
    const ctx = builder.build('completed')
    expect(ctx.baselineDesignTokens).toEqual(tokens)
  })

  it('baselineDesignTokens is absent from built context when setter was not called', () => {
    const builder = new RunContextBuilder({
      prompt: 'Fresh app',
      platform: 'swiftui',
      mode: 'fresh',
    })
    const ctx = builder.build('completed')
    expect(ctx.baselineDesignTokens).toBeUndefined()
  })
})

describe('setBaasContext', () => {
  it('setBaasContext round-trips through build() and appears on RunContext', () => {
    const builder = new RunContextBuilder({
      prompt: 'Build a firebase app',
      platform: 'swiftui',
      mode: 'fresh',
    })
    builder.setBaasContext({ provider: 'firebase', recommendation: { tier: 'appropriate', reason: 'test' } })
    const ctx = builder.build('completed')
    expect(ctx.baasContext?.provider).toBe('firebase')
    expect(ctx.baasContext?.recommendation.tier).toBe('appropriate')
  })

  it('RunContextBuilder without setBaasContext produces a RunContext where baasContext is undefined', () => {
    const builder = new RunContextBuilder({
      prompt: 'Fresh app',
      platform: 'swiftui',
      mode: 'fresh',
    })
    const ctx = builder.build('completed')
    expect(ctx.baasContext).toBeUndefined()
  })

  it('PHASE_ORDER includes baas_recommend immediately after design_delta and before test_gen', () => {
    const designDeltaIdx = PHASE_ORDER.indexOf('design_delta')
    const baasRecommendIdx = PHASE_ORDER.indexOf('baas_recommend')
    const testGenIdx = PHASE_ORDER.indexOf('test_gen')
    expect(baasRecommendIdx).toBeGreaterThan(-1)
    expect(baasRecommendIdx).toBe(designDeltaIdx + 1)
    expect(baasRecommendIdx).toBeLessThan(testGenIdx)
  })
})
