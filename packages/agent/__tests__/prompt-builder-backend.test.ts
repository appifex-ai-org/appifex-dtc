import { describe, it, expect } from 'vitest'
import { buildAgentPrompt } from '../src/prompt-builder.js'
import type { BackendContext } from '@appifex/core'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dtc-prompt-be-'))
  const spec = {
    platform: 'swiftui',
    screens: [{ id: 's1', name: 'Home', componentName: 'HomeView', description: 'Home', components: [], testIds: {} }],
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

function makeBackendContext(): BackendContext {
  return {
    apiBaseUrl: 'https://api.petapp.com',
    endpoints: [
      { method: 'GET', path: '/api/pets', description: 'List all pets' },
      { method: 'POST', path: '/api/pets', description: 'Create a pet' },
    ],
    models: {
      'Pet': 'struct Pet: Codable {\n  let id: UUID\n  var name: String\n}',
    },
    auth: { type: 'bearer', description: 'JWT token' },
  }
}

describe('buildAgentPrompt with backendContext', () => {
  let dir: string

  it('includes backend API section when backendContext is provided', () => {
    dir = makeTempProject()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Build a pet app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        backendContext: makeBackendContext(),
      })

      expect(prompt).toContain('Backend API Integration')
      expect(prompt).toContain('https://api.petapp.com')
      expect(prompt).toContain('GET /api/pets')
      expect(prompt).toContain('POST /api/pets')
      expect(prompt).toContain('struct Pet: Codable')
      expect(prompt).toContain('URLSession')
      expect(prompt).toContain('bearer')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('omits backend section when no backendContext', () => {
    dir = makeTempProject()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Build a standalone app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
      })

      expect(prompt).not.toContain('Backend API Integration')
      expect(prompt).not.toContain('URLSession')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('updates architecture rules to include Services/APIClient.swift', () => {
    dir = makeTempProject()
    try {
      const prompt = buildAgentPrompt({
        prompt: 'Build a pet app',
        platform: 'swiftui',
        specPath: join(dir, 'spec.json'),
        flowDir: join(dir, '.maestro'),
        testDir: join(dir, '__tests__'),
        skillsDir: join(dir, 'skills'),
        projectDir: dir,
        agentSupportsImages: false,
        backendContext: makeBackendContext(),
      })

      expect(prompt).toContain('APIClient')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
