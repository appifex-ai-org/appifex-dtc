import type { BaasFieldType, BaasProvider, BaasSchema, PlatformSpec } from '@appifex/core'

type CreateMessageFn = (params: {
  model: string
  max_tokens: number
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}) => Promise<{ content: Array<{ type: string; text?: string }> }>

const VALID_FIELD_TYPES: readonly BaasFieldType[] = ['string', 'number', 'boolean', 'date', 'reference', 'array'] as const
const VALID_RELATIONSHIP_TYPES = ['belongs_to', 'has_many'] as const

export const SCHEMA_INFERENCE_PROMPT = `You are a backend data architect. Analyze the following app design specification and infer the data entities, fields, and relationships needed for a {provider} backend.

## App Specification
{spec}

## Provider
{provider}

## Requirements
- Identify all data entities the app needs (e.g., User, Todo, Post, Comment)
- Every entity MUST include an \`ownerId\` field of type \`string\` (required: true) for owner-based security rules
- For each entity, list its fields with name, type, and whether it's required
- Field types MUST be one of: string, number, boolean, date, reference, array
- Identify relationships between entities using: belongs_to, has_many
- Entity names should be PascalCase (e.g., "TodoItem", not "todo_item")

## Output Format
Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "entities": [
    {
      "name": "EntityName",
      "fields": [
        { "name": "ownerId", "type": "string", "required": true },
        { "name": "fieldName", "type": "string|number|boolean|date|reference|array", "required": true }
      ],
      "relationships": [
        { "target": "OtherEntity", "type": "belongs_to|has_many" }
      ]
    }
  ]
}`

/** Extract the outermost JSON object from LLM text that may include markdown fences */
function extractJson(text: string): string {
  // Strip markdown code fences
  let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')

  // Find the first { and match braces to find the complete object
  const start = cleaned.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in response')

  let depth = 0
  let end = -1
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) throw new Error('Unclosed JSON object in response')

  let json = cleaned.slice(start, end + 1)

  // Fix trailing commas before } or ] (common LLM mistake)
  json = json.replace(/,\s*([}\]])/g, '$1')

  return json
}

/** Validate and normalize parsed JSON into a BaasSchema */
function parseSchemaJson(raw: unknown): BaasSchema {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Schema inference returned non-object result')
  }

  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.entities)) {
    throw new Error('Schema inference result missing "entities" array')
  }

  if (obj.entities.length === 0) {
    throw new Error('Schema inference returned empty entities array')
  }

  const validFieldTypeSet = new Set<string>(VALID_FIELD_TYPES)
  const validRelTypeSet = new Set<string>(VALID_RELATIONSHIP_TYPES)
  const entityNamePattern = /^[A-Z][a-zA-Z0-9]*$/

  const entities = obj.entities.map((entity: unknown, idx: number) => {
    if (!entity || typeof entity !== 'object') {
      throw new Error(`Entity at index ${idx} is not an object`)
    }
    const e = entity as Record<string, unknown>

    if (typeof e.name !== 'string' || !e.name) {
      throw new Error(`Entity at index ${idx} missing "name"`)
    }

    if (!entityNamePattern.test(e.name)) {
      throw new Error(`Entity name "${e.name}" must be alphanumeric PascalCase`)
    }

    if (!Array.isArray(e.fields)) {
      throw new Error(`Entity "${e.name}" missing "fields" array`)
    }

    const fields = e.fields.map((field: unknown, fIdx: number) => {
      if (!field || typeof field !== 'object') {
        throw new Error(`Field at index ${fIdx} in entity "${e.name}" is not an object`)
      }
      const f = field as Record<string, unknown>

      if (typeof f.name !== 'string' || !f.name) {
        throw new Error(`Field at index ${fIdx} in entity "${e.name}" missing "name"`)
      }

      if (typeof f.type !== 'string' || !validFieldTypeSet.has(f.type)) {
        throw new Error(`Field "${f.name}" in entity "${e.name}" has invalid type "${f.type}". Must be one of: ${VALID_FIELD_TYPES.join(', ')}`)
      }

      return {
        name: f.name,
        type: f.type as BaasFieldType,
        required: Boolean(f.required),
      }
    })

    const relationships = Array.isArray(e.relationships)
      ? e.relationships.map((rel: unknown, rIdx: number) => {
          if (!rel || typeof rel !== 'object') {
            throw new Error(`Relationship at index ${rIdx} in entity "${e.name}" is not an object`)
          }
          const r = rel as Record<string, unknown>

          if (typeof r.target !== 'string' || !r.target) {
            throw new Error(`Relationship at index ${rIdx} in entity "${e.name}" missing "target"`)
          }

          if (typeof r.type !== 'string' || !validRelTypeSet.has(r.type)) {
            throw new Error(`Relationship to "${r.target}" in entity "${e.name}" has invalid type "${r.type}". Must be: belongs_to or has_many`)
          }

          return {
            target: r.target,
            type: r.type as 'belongs_to' | 'has_many',
          }
        })
      : []

    return { name: e.name as string, fields, relationships }
  })

  return { entities }
}

export async function inferBaasSchema(opts: {
  spec: PlatformSpec
  provider: BaasProvider
  createMessage: CreateMessageFn
  model?: string
}): Promise<BaasSchema> {
  const model = opts.model ?? 'claude-sonnet-4-20250514'
  const specJson = JSON.stringify(opts.spec, null, 2)

  const prompt = SCHEMA_INFERENCE_PROMPT
    .replace('{spec}', specJson)
    .replaceAll('{provider}', opts.provider)

  const response = await opts.createMessage({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.find(c => c.type === 'text')?.text ?? ''
  if (!text) {
    throw new Error('Schema inference received empty response from LLM')
  }

  const json = extractJson(text)
  const parsed = JSON.parse(json)
  return parseSchemaJson(parsed)
}
