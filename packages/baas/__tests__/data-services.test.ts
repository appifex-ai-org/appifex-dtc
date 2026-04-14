import { describe, it, expect } from 'vitest'
import type { BaasSchema } from '@appifex/core'
import { generateDataServices } from '../src/data-services.js'

const testSchema: BaasSchema = {
  entities: [
    {
      name: 'Todo',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'completed', type: 'boolean', required: false },
        { name: 'ownerId', type: 'string', required: true },
      ],
    },
  ],
}

const twoEntitySchema: BaasSchema = {
  entities: [
    {
      name: 'Todo',
      fields: [{ name: 'title', type: 'string', required: true }],
    },
    {
      name: 'Project',
      fields: [{ name: 'name', type: 'string', required: true }],
    },
  ],
}

describe('generateDataServices', () => {
  // Test 1: firebase provider with 1 entity produces 1 file with correct path
  it('with firebase provider and 1 entity produces 1 GeneratedFile with correct path', () => {
    const files = generateDataServices(testSchema, 'firebase')
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('Sources/Services/TodoDataService.swift')
  })

  // Test 2: firebase provider with 2 entities produces 2 files
  it('with firebase provider and 2 entities produces 2 files', () => {
    const files = generateDataServices(twoEntitySchema, 'firebase')
    expect(files).toHaveLength(2)
    expect(files.map((f) => f.path)).toContain('Sources/Services/TodoDataService.swift')
    expect(files.map((f) => f.path)).toContain('Sources/Services/ProjectDataService.swift')
  })

  // Test 3: Firebase DataService content contains @Observable and final class
  it('Firebase DataService content contains "@Observable" and "final class TodoDataService"', () => {
    const files = generateDataServices(testSchema, 'firebase')
    const file = files.find((f) => f.path === 'Sources/Services/TodoDataService.swift')!
    expect(file.content).toContain('@Observable')
    expect(file.content).toContain('final class TodoDataService')
  })

  // Test 4: Firebase DataService contains protocol type (not concrete)
  it('Firebase DataService content contains "any TodoRepository" (protocol type, not concrete)', () => {
    const files = generateDataServices(testSchema, 'firebase')
    const file = files.find((f) => f.path === 'Sources/Services/TodoDataService.swift')!
    expect(file.content).toContain('any TodoRepository')
  })

  // Test 5: Firebase DataService does NOT contain FirebaseFirestore import
  it('Firebase DataService content does NOT contain "import FirebaseFirestore"', () => {
    const files = generateDataServices(testSchema, 'firebase')
    const file = files.find((f) => f.path === 'Sources/Services/TodoDataService.swift')!
    expect(file.content).not.toContain('import FirebaseFirestore')
  })

  // Test 6: Firebase DataService default init uses FirestoreTodoRepository()
  it('Firebase DataService default init uses FirestoreTodoRepository() as default parameter', () => {
    const files = generateDataServices(testSchema, 'firebase')
    const file = files.find((f) => f.path === 'Sources/Services/TodoDataService.swift')!
    expect(file.content).toContain('FirestoreTodoRepository()')
  })

  // Test 7: Supabase DataService uses SupabaseTodoRepository() as default
  it('with supabase provider produces file with SupabaseTodoRepository() as default', () => {
    const files = generateDataServices(testSchema, 'supabase')
    const file = files.find((f) => f.path === 'Sources/Services/TodoDataService.swift')!
    expect(file).toBeDefined()
    expect(file.content).toContain('SupabaseTodoRepository()')
  })

  // Test 8: DataService content contains loadAll(), create(), delete() methods
  it('DataService content contains loadAll(), create(), delete() methods', () => {
    const files = generateDataServices(testSchema, 'firebase')
    const file = files.find((f) => f.path === 'Sources/Services/TodoDataService.swift')!
    expect(file.content).toContain('func loadAll()')
    expect(file.content).toContain('func create(')
    expect(file.content).toContain('func delete(')
  })

  // Test 9: platforms=['swift'] only generates Swift files
  it("with platforms=['swift'] only generates Swift files", () => {
    const files = generateDataServices(testSchema, 'firebase', ['swift'])
    expect(files.every((f) => f.path.endsWith('.swift'))).toBe(true)
    expect(files).toHaveLength(1)
  })
})
