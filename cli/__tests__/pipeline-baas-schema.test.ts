/**
 * Phase 20 Plan 03: baas_schema pipeline integration tests.
 *
 * Covers:
 *  - baas_schema phase block presence in pipeline.ts (emit, imports, functions)
 *  - Security lint gate in baas_schema block
 *  - Resume path rehydration from previousContext
 *  - PreBuildSummary.baasSchema field
 *  - PHASE_LABELS contains baas_schema
 *  - formatPreBuildSummary renders inferred entities
 *  - CodegenInput.baasContext field
 *  - buildPromptText BaaS Repository Layer section
 *
 * Uses source-text assertion approach matching pipeline-baas.test.ts precedent.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { formatPreBuildSummary } from '../src/views/format.js'
import type { PreBuildSummary } from '../src/pipeline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipelineSrc = readFileSync(join(__dirname, '../src/pipeline.ts'), 'utf-8')
const formatSrc = readFileSync(join(__dirname, '../src/views/format.ts'), 'utf-8')
const codegenTypesSrc = readFileSync(join(__dirname, '../../packages/codegen/src/types.ts'), 'utf-8')
const defaultGenerateSrc = readFileSync(join(__dirname, '../../packages/codegen/src/default-generate.ts'), 'utf-8')

function makeMinimalSummary(overrides: Partial<PreBuildSummary> = {}): PreBuildSummary {
  return {
    newScreens: [],
    modifiedFiles: [],
    designStrategy: 'new',
    testFilesToGenerate: [],
    tokenCount: 0,
    enrichedPrompt: 'Test app',
    ...overrides,
  }
}

// ── pipeline.ts source assertions ──────────────────────────────────────────

describe('baas_schema phase block in pipeline.ts', () => {
  it('pipeline.ts emits baas_schema phase events', () => {
    expect(pipelineSrc).toContain("emit('baas_schema'")
  })

  it('pipeline.ts dynamically imports @appifex/baas', () => {
    expect(pipelineSrc).toContain("import('@appifex/baas')")
  })

  it('pipeline.ts calls inferBaasSchema', () => {
    expect(pipelineSrc).toContain('inferBaasSchema')
  })

  it('pipeline.ts calls renderBaasTemplates', () => {
    expect(pipelineSrc).toContain('renderBaasTemplates')
  })

  it('pipeline.ts calls lintSecurityRules', () => {
    expect(pipelineSrc).toContain('lintSecurityRules')
  })

  it('pipeline.ts calls generateSdkInit', () => {
    expect(pipelineSrc).toContain('generateSdkInit')
  })

  it('pipeline.ts calls generateConfigStubs', () => {
    expect(pipelineSrc).toContain('generateConfigStubs')
  })

  it('pipeline.ts saves baas_schema checkpoint', () => {
    expect(pipelineSrc).toContain("checkpoint.savePhase(checkpointRunId, 'baas_schema'")
  })

  it('PreBuildSummary contains baasSchema field', () => {
    expect(pipelineSrc).toContain('baasSchema')
  })

  it('pipeline.ts contains security lint gate (lint.passed check)', () => {
    expect(pipelineSrc).toContain('lint.passed')
  })

  it('pipeline.ts resume path rehydrates baasSchema from previousContext', () => {
    expect(pipelineSrc).toContain('previousContext?.baasContext?.schema')
  })
})

// ── format.ts assertions ───────────────────────────────────────────────────

describe('format.ts baas_schema support', () => {
  it('PHASE_LABELS contains baas_schema', () => {
    expect(formatSrc).toContain("baas_schema")
    expect(formatSrc).toContain("'Schema'")
  })

  it('formatPreBuildSummary renders Inferred entities', () => {
    expect(formatSrc).toContain('Inferred entities')
  })

  it('formatPreBuildSummary renders entity names when baasSchema is present', () => {
    const summary = makeMinimalSummary({
      baasSchema: {
        entities: [
          { name: 'Todo', fields: [], relationships: [] },
          { name: 'User', fields: [], relationships: [] },
        ],
      },
    })
    const output = formatPreBuildSummary(summary)
    expect(output).toContain('Todo, User')
    expect(output).toContain('Inferred entities')
  })
})

// ── codegen types assertions ───────────────────────────────────────────────

describe('CodegenInput baasContext field', () => {
  it('codegen/types.ts CodegenInput contains baasContext', () => {
    expect(codegenTypesSrc).toContain('baasContext?')
  })
})

// ── default-generate.ts assertions ─────────────────────────────────────────

describe('buildPromptText BaaS section', () => {
  it('default-generate.ts contains BaaS Repository Layer section', () => {
    expect(defaultGenerateSrc).toContain('BaaS Repository Layer')
  })

  it('default-generate.ts tells LLM not to generate AppEntry.swift', () => {
    expect(defaultGenerateSrc).toContain('Do NOT generate')
    expect(defaultGenerateSrc).toContain('AppEntry.swift')
  })
})
