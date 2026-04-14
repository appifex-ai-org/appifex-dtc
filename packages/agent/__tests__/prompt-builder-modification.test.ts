import { describe, it, expect } from 'vitest'
import { buildAgentPrompt } from '../src/prompt-builder.js'
import type { ModificationPlan } from '@appifex/core'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dtc-prompt-mod-'))
  const spec = {
    platform: 'swiftui',
    screens: [{ id: 's1', name: 'Home', componentName: 'HomeView', description: 'Home screen', components: [], testIds: {} }],
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

const samplePlan: ModificationPlan = {
  items: [
    {
      filePath: 'Sources/ContentView.swift',
      screenName: 'ContentView',
      changeDescription: 'Add Settings tab to TabView',
      changeType: 'navigation',
      fileContent: 'import SwiftUI\nstruct ContentView: View {\n  var body: some View { TabView { Text("Home") } }\n}',
    },
  ],
}

describe('buildAgentPrompt with modificationPlan', () => {
  it('Test 1: includes Modification Plan section when plan has items and runMode is add-feature', () => {
    const dir = makeTempProject()
    try {
      const result = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        runMode: 'add-feature',
        modificationPlan: samplePlan,
      })

      expect(result).toContain('## Modification Plan (files you MUST modify)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Test 2: does NOT include Modification Plan section when plan has empty items', () => {
    const dir = makeTempProject()
    try {
      const result = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        runMode: 'add-feature',
        modificationPlan: { items: [] },
      })

      expect(result).not.toContain('## Modification Plan')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Test 3: does NOT include Modification Plan section when modificationPlan is undefined', () => {
    const dir = makeTempProject()
    try {
      const result = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        runMode: 'add-feature',
      })

      expect(result).not.toContain('## Modification Plan')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Test 4: does NOT include Modification Plan section when runMode is not add-feature', () => {
    const dir = makeTempProject()
    try {
      const result = buildAgentPrompt({
        prompt: 'Build a new app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        runMode: 'fresh',
        modificationPlan: samplePlan,
      })

      expect(result).not.toContain('## Modification Plan')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Test 5: Modification Plan section includes per-file header with screenName and changeType, change description, file path, and full file content in a code block', () => {
    const dir = makeTempProject()
    try {
      const result = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        runMode: 'add-feature',
        modificationPlan: samplePlan,
      })

      expect(result).toContain('### ContentView (navigation)')
      expect(result).toContain('**Change:** Add Settings tab to TabView')
      expect(result).toContain('**File path:** Sources/ContentView.swift')
      expect(result).toContain('import SwiftUI')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Test 6: Modification Plan section includes "DO NOT modify any files not listed here" instruction', () => {
    const dir = makeTempProject()
    try {
      const result = buildAgentPrompt({
        prompt: 'Add settings screen',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        runMode: 'add-feature',
        modificationPlan: samplePlan,
      })

      expect(result).toContain('DO NOT modify any files not listed here')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
