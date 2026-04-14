import { describe, it, expect } from 'vitest'
import { buildAgentPrompt } from '../src/prompt-builder.js'
import type { RunContext } from '@appifex/core'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dtc-prompt-'))
  // Write a minimal spec file
  const spec = {
    platform: 'swiftui',
    screens: [
      {
        id: 's1',
        name: 'Home',
        componentName: 'HomeView',
        description: 'Home screen',
        components: [],
        testIds: {},
      },
    ],
    designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
    imports: [],
  }
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec))
  mkdirSync(join(dir, '.maestro'), { recursive: true })
  mkdirSync(join(dir, '__tests__'), { recursive: true })
  mkdirSync(join(dir, 'skills', 'swiftui', 'codegen'), { recursive: true })
  mkdirSync(join(dir, 'skills', 'swiftui', 'fix'), { recursive: true })
  writeFileSync(join(dir, 'skills', 'swiftui', 'codegen', '01-architecture.md'), '# Arch')
  return dir
}

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-abc',
    prompt: 'Build a pet adoption app',
    platform: 'swiftui',
    mode: 'fresh',
    status: 'completed',
    timestamp: Date.now(),
    phases: {
      design: { status: 'completed', summary: 'Design created (2 iterations)' },
      spec: { status: 'completed', summary: '3 screens, 12 components' },
      test_gen: { status: 'completed', summary: '4 UI flows, 8 unit tests' },
      codegen: { status: 'completed', summary: 'Agent: claude — 15 files generated' },
      build: { status: 'completed', summary: 'swiftui build succeeded' },
      validate: { status: 'completed', summary: 'UI 4/4  Unit 8/8' },
    },
    filesGenerated: ['Sources/App.swift', 'Sources/Views/HomeView.swift'],
    agentSessionId: 'session-xyz',
    ...overrides,
  }
}

describe('buildAgentPrompt with previousContext', () => {
  let dir: string

  it('includes previous run context when provided', () => {
    dir = makeTempProject()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Add dark mode support',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        previousContext: makeContext(),
      })

      expect(prompt).toContain('Previous Run Context')
      expect(prompt).toContain('Build a pet adoption app')
      expect(prompt).toContain('3 screens, 12 components')
      expect(prompt).toContain('Sources/Views/HomeView.swift')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('omits previous context section when not provided', () => {
    dir = makeTempProject()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Build a todo app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
      })

      expect(prompt).not.toContain('Previous Run Context')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes run mode context for add-feature', () => {
    dir = makeTempProject()
    try {
      const ctx = makeContext({ mode: 'add-feature' })
      const prompt = buildAgentPrompt({
        prompt: 'Add dark mode support',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        previousContext: ctx,
        runMode: 'add-feature',
      })

      expect(prompt).toContain('add-feature')
      expect(prompt).toContain('Preserve existing functionality')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes run mode context for refactor', () => {
    dir = makeTempProject()
    try {
      const ctx = makeContext({ mode: 'fresh' })
      const prompt = buildAgentPrompt({
        prompt: 'Extract reusable components',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        previousContext: ctx,
        runMode: 'refactor',
      })

      expect(prompt).toContain('refactor')
      expect(prompt).toContain('do NOT change visible behavior')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes failed phase info for resume', () => {
    dir = makeTempProject()
    try {
      const ctx = makeContext({
        status: 'failed',
        phases: {
          design: { status: 'completed', summary: 'Done' },
          spec: { status: 'completed', summary: '3 screens' },
          codegen: { status: 'failed', summary: 'Build failed: missing import' },
        },
      })
      const prompt = buildAgentPrompt({
        prompt: 'Build a pet adoption app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        previousContext: ctx,
        runMode: 'resume',
      })

      expect(prompt).toContain('Previous Run Context')
      expect(prompt).toContain('FAILED')
      expect(prompt).toContain('Build failed: missing import')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes mode instructions even without previous context', () => {
    dir = makeTempProject()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Add notifications to my existing app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        // No previousContext — hand-written or third-party codebase
        runMode: 'add-feature',
      })

      expect(prompt).toContain('add-feature')
      expect(prompt).toContain('Preserve existing functionality')
      expect(prompt).not.toContain('Previous Run Context')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildAgentPrompt with existingDesignTokens', () => {
  function makeTempProjectLocal(): string {
    const d = mkdtempSync(join(tmpdir(), 'dtc-prompt-tokens-'))
    const spec = {
      platform: 'swiftui',
      screens: [
        {
          id: 's1',
          name: 'Home',
          componentName: 'HomeView',
          description: 'Home screen',
          components: [],
          testIds: {},
        },
      ],
      designTokens: { colors: {}, typography: {}, spacing: {}, borderRadius: {} },
      imports: [],
    }
    writeFileSync(join(d, 'spec.json'), JSON.stringify(spec))
    mkdirSync(join(d, '.maestro'), { recursive: true })
    mkdirSync(join(d, '__tests__'), { recursive: true })
    mkdirSync(join(d, 'skills', 'swiftui', 'codegen'), { recursive: true })
    mkdirSync(join(d, 'skills', 'swiftui', 'fix'), { recursive: true })
    writeFileSync(join(d, 'skills', 'swiftui', 'codegen', '01-architecture.md'), '# Arch')
    return d
  }

  const sampleTokens = {
    colors: { primary: '#FF0000', background: '#FFFFFF' },
    typography: {
      heading: { fontFamily: 'Inter', fontSize: 24, fontWeight: 'bold' },
      body: { fontFamily: 'Inter', fontSize: 16, fontWeight: 'regular' },
      caption: { fontFamily: 'Inter', fontSize: 12, fontWeight: 'regular' },
    },
    spacing: { sm: 8, md: 16 },
    borderRadius: { button: 8 },
  }

  it('includes Existing Design Tokens section in add-feature mode when existingDesignTokens provided', () => {
    const d = makeTempProjectLocal()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(d, 'spec.json'),
        flowDir: join(d, '.maestro'),
        testDir: join(d, '__tests__'),
        skillsDir: join(d, 'skills'),
        projectDir: d,
        agentSupportsImages: false,
        runMode: 'add-feature',
        existingDesignTokens: sampleTokens,
      })

      expect(prompt).toContain('Existing Design Tokens')
      expect(prompt).toContain('#FF0000')
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('does NOT include Existing Design Tokens section in fresh mode even when existingDesignTokens provided', () => {
    const d = makeTempProjectLocal()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Build a new app',
        platform: 'swiftui',
        specPath: join(d, 'spec.json'),
        flowDir: join(d, '.maestro'),
        testDir: join(d, '__tests__'),
        skillsDir: join(d, 'skills'),
        projectDir: d,
        agentSupportsImages: false,
        runMode: 'fresh',
        existingDesignTokens: sampleTokens,
      })

      expect(prompt).not.toContain('Existing Design Tokens')
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('does NOT include Existing Design Tokens section when existingDesignTokens is undefined', () => {
    const d = makeTempProjectLocal()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(d, 'spec.json'),
        flowDir: join(d, '.maestro'),
        testDir: join(d, '__tests__'),
        skillsDir: join(d, 'skills'),
        projectDir: d,
        agentSupportsImages: false,
        runMode: 'add-feature',
        existingDesignTokens: undefined,
      })

      expect(prompt).not.toContain('Existing Design Tokens')
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})
