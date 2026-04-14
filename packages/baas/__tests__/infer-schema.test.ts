import { describe, it, expect } from 'vitest'
import type { BaasFieldType, BaasEntity, BaasSchema, BaasField, BaasRelationship, BaasContext, PhaseId, CheckpointData, PlatformSpec } from '@appifex/core'
import { PHASE_ORDER } from '@appifex/core'
import { inferBaasSchema, SCHEMA_INFERENCE_PROMPT } from '@appifex/baas'

describe('BaasSchema types', () => {
  it('BaasFieldType union accepts all required types', () => {
    const types: BaasFieldType[] = ['string', 'number', 'boolean', 'date', 'reference', 'array']
    expect(types).toHaveLength(6)
    for (const t of types) {
      expect(typeof t).toBe('string')
    }
  })

  it('BaasEntity has name, fields, and relationships', () => {
    const entity: BaasEntity = {
      name: 'Todo',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'count', type: 'number', required: false },
      ],
      relationships: [
        { target: 'User', type: 'belongs_to' },
      ],
    }
    expect(entity.name).toBe('Todo')
    expect(entity.fields).toHaveLength(2)
    expect(entity.relationships).toHaveLength(1)
  })

  it('BaasSchema has entities array', () => {
    const schema: BaasSchema = {
      entities: [
        {
          name: 'Todo',
          fields: [{ name: 'title', type: 'string', required: true }],
          relationships: [],
        },
      ],
    }
    expect(schema.entities).toHaveLength(1)
    expect(schema.entities[0].name).toBe('Todo')
  })

  it('BaasContext.schema is typed as BaasSchema (not unknown)', () => {
    const schema: BaasSchema = {
      entities: [
        { name: 'User', fields: [{ name: 'email', type: 'string', required: true }], relationships: [] },
      ],
    }
    const ctx: BaasContext = {
      provider: 'firebase',
      recommendation: { tier: 'appropriate', reason: 'Simple CRUD' },
      schema,
    }
    // If schema were typed as unknown, accessing .entities would be a compile error
    expect(ctx.schema?.entities).toHaveLength(1)
  })
})

describe('PhaseId and PHASE_ORDER registration', () => {
  it('PhaseId includes baas_schema', () => {
    const id: PhaseId = 'baas_schema'
    expect(id).toBe('baas_schema')
  })

  it('PHASE_ORDER has baas_schema after baas_recommend and before baas_auth before test_gen', () => {
    const baasRecommendIdx = PHASE_ORDER.indexOf('baas_recommend')
    const baasSchemaIdx = PHASE_ORDER.indexOf('baas_schema')
    const baasAuthIdx = PHASE_ORDER.indexOf('baas_auth')
    const testGenIdx = PHASE_ORDER.indexOf('test_gen')
    expect(baasSchemaIdx).toBe(baasRecommendIdx + 1)
    expect(baasAuthIdx).toBe(baasSchemaIdx + 1)
    expect(baasAuthIdx).toBeLessThan(testGenIdx)
    expect(PHASE_ORDER.indexOf('mock_service')).toBe(baasAuthIdx + 1)
  })

  it('CheckpointData has baas_schema key', () => {
    // Compile-time check: if baas_schema key doesn't exist on CheckpointData, this won't compile
    const data: Pick<CheckpointData, 'baas_schema'> = {
      baas_schema: { entityCount: 3 },
    }
    expect(data.baas_schema).toBeDefined()
  })
})

// ── Task 2: inferBaasSchema tests ──

const MOCK_SPEC: PlatformSpec = {
  platform: 'swiftui',
  screens: [
    {
      id: 'screen-home',
      name: 'Home',
      componentName: 'HomeView',
      description: 'Main screen',
      components: [],
      testIds: {},
    },
  ],
  designTokens: {
    colors: { primary: '#007AFF' },
    typography: {},
    spacing: { md: 16 },
    borderRadius: { md: 12 },
  },
  imports: ['SwiftUI'],
}

const VALID_SCHEMA_JSON = JSON.stringify({
  entities: [
    {
      name: 'Todo',
      fields: [
        { name: 'ownerId', type: 'string', required: true },
        { name: 'title', type: 'string', required: true },
        { name: 'completed', type: 'boolean', required: true },
        { name: 'dueDate', type: 'date', required: false },
      ],
      relationships: [
        { target: 'User', type: 'belongs_to' },
      ],
    },
    {
      name: 'User',
      fields: [
        { name: 'ownerId', type: 'string', required: true },
        { name: 'email', type: 'string', required: true },
        { name: 'age', type: 'number', required: false },
        { name: 'tags', type: 'array', required: false },
      ],
      relationships: [
        { target: 'Todo', type: 'has_many' },
      ],
    },
  ],
})

function mockCreateMessage(responseText: string) {
  return async (_params: { model: string; max_tokens: number; messages: Array<{ role: string; content: string }> }) => ({
    content: [{ type: 'text' as const, text: responseText }],
  })
}

describe('inferBaasSchema', () => {
  it('returns BaasSchema with entities when LLM returns valid JSON', async () => {
    const result = await inferBaasSchema({
      spec: MOCK_SPEC,
      provider: 'firebase',
      createMessage: mockCreateMessage(VALID_SCHEMA_JSON),
    })
    expect(result.entities).toHaveLength(2)
    expect(result.entities[0].name).toBe('Todo')
    expect(result.entities[1].name).toBe('User')
  })

  it('extracts JSON from markdown-fenced LLM response', async () => {
    const fenced = '```json\n' + VALID_SCHEMA_JSON + '\n```'
    const result = await inferBaasSchema({
      spec: MOCK_SPEC,
      provider: 'supabase',
      createMessage: mockCreateMessage(fenced),
    })
    expect(result.entities).toHaveLength(2)
  })

  it('throws on empty entities array', async () => {
    const emptySchema = JSON.stringify({ entities: [] })
    await expect(
      inferBaasSchema({
        spec: MOCK_SPEC,
        provider: 'firebase',
        createMessage: mockCreateMessage(emptySchema),
      }),
    ).rejects.toThrow(/entities/)
  })

  it('maps all field types to BaasFieldType union', async () => {
    const result = await inferBaasSchema({
      spec: MOCK_SPEC,
      provider: 'firebase',
      createMessage: mockCreateMessage(VALID_SCHEMA_JSON),
    })
    const allFieldTypes = result.entities.flatMap(e => e.fields.map(f => f.type))
    const validTypes: BaasFieldType[] = ['string', 'number', 'boolean', 'date', 'reference', 'array']
    for (const t of allFieldTypes) {
      expect(validTypes).toContain(t)
    }
  })

  it('includes relationships when LLM returns them', async () => {
    const result = await inferBaasSchema({
      spec: MOCK_SPEC,
      provider: 'firebase',
      createMessage: mockCreateMessage(VALID_SCHEMA_JSON),
    })
    const todoRels = result.entities[0].relationships
    expect(todoRels).toHaveLength(1)
    expect(todoRels[0]).toEqual({ target: 'User', type: 'belongs_to' })
    const userRels = result.entities[1].relationships
    expect(userRels).toHaveLength(1)
    expect(userRels[0]).toEqual({ target: 'Todo', type: 'has_many' })
  })

  it('SCHEMA_INFERENCE_PROMPT contains provider and spec placeholders', () => {
    expect(SCHEMA_INFERENCE_PROMPT).toContain('{provider}')
    expect(SCHEMA_INFERENCE_PROMPT).toContain('{spec}')
  })
})
