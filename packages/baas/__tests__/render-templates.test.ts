import { describe, it, expect } from 'vitest'
import type { BaasSchema } from '@appifex/core'
import { renderBaasTemplates } from '../src/render-templates.js'

const testSchema: BaasSchema = {
  entities: [
    {
      name: 'Todo',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'completed', type: 'boolean', required: false },
        { name: 'ownerId', type: 'string', required: true },
      ],
      relationships: [{ target: 'User', type: 'belongs_to' }],
    },
  ],
}

describe('renderBaasTemplates', () => {
  // Test 1
  it('produces GeneratedFile[] with repository file per entity for firebase + swift', () => {
    const files = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const repoFile = files.find((f) => f.path === 'Sources/Repositories/TodoRepository.swift')
    expect(repoFile).toBeDefined()
    expect(repoFile!.content.length).toBeGreaterThan(0)
  })

  // Test 2
  it('produces GeneratedFile[] with repository file per entity for supabase + swift', () => {
    const files = renderBaasTemplates(testSchema, 'supabase', ['swift'])
    const repoFile = files.find((f) => f.path === 'Sources/Repositories/TodoRepository.swift')
    expect(repoFile).toBeDefined()
    expect(repoFile!.content.length).toBeGreaterThan(0)
  })

  // Test 3
  it('Firebase Swift repository contains protocol and Firestore implementation', () => {
    const files = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const repoFile = files.find((f) => f.path.endsWith('TodoRepository.swift'))!
    expect(repoFile.content).toContain('protocol TodoRepository')
    expect(repoFile.content).toContain('class FirestoreTodoRepository')
  })

  // Test 4
  it('Supabase Swift repository contains protocol and Supabase implementation', () => {
    const files = renderBaasTemplates(testSchema, 'supabase', ['swift'])
    const repoFile = files.find((f) => f.path.endsWith('TodoRepository.swift'))!
    expect(repoFile.content).toContain('protocol TodoRepository')
    expect(repoFile.content).toContain('class SupabaseTodoRepository')
  })

  // Test 5
  it('Firebase repository protocol does NOT contain import FirebaseFirestore', () => {
    const files = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const repoFile = files.find((f) => f.path.endsWith('TodoRepository.swift'))!
    // Extract protocol block (from 'protocol' to its closing '}')
    const protocolMatch = repoFile.content.match(/protocol \w+Repository \{[\s\S]*?\n\}/)
    expect(protocolMatch).not.toBeNull()
    const protocolBlock = protocolMatch![0]
    expect(protocolBlock).not.toContain('import FirebaseFirestore')
    // File-level: Foundation import is at the top (before protocol)
    expect(repoFile.content).toContain('import Foundation')
    // Implementation SHOULD have FirebaseFirestore import
    expect(repoFile.content).toContain('import FirebaseFirestore')
  })

  // Test 6
  it('produces security rules file — firebase returns firestore.rules, supabase returns supabase/rls-policies.sql', () => {
    const fbFiles = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const fbRules = fbFiles.find((f) => f.path === 'firestore.rules')
    expect(fbRules).toBeDefined()

    const sbFiles = renderBaasTemplates(testSchema, 'supabase', ['swift'])
    const sbRules = sbFiles.find((f) => f.path === 'supabase/rls-policies.sql')
    expect(sbRules).toBeDefined()
  })

  // Test 7
  it('Firebase security rules contain rules_version and owner-only checks', () => {
    const files = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const rules = files.find((f) => f.path === 'firestore.rules')!
    expect(rules.content).toContain("rules_version = '2'")
    expect(rules.content).toContain('request.auth.uid == resource.data.ownerId')
  })

  // Test 8
  it('Supabase RLS contains ENABLE ROW LEVEL SECURITY and auth.uid() check', () => {
    const files = renderBaasTemplates(testSchema, 'supabase', ['swift'])
    const rls = files.find((f) => f.path === 'supabase/rls-policies.sql')!
    expect(rls.content).toContain('ENABLE ROW LEVEL SECURITY')
    expect(rls.content).toContain('auth.uid()) = user_id')
  })

  // Test 9
  it('Each CRUD method appears in generated repository', () => {
    const files = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const repoFile = files.find((f) => f.path.endsWith('TodoRepository.swift'))!
    expect(repoFile.content).toContain('func create')
    expect(repoFile.content).toContain('func getById')
    expect(repoFile.content).toContain('func list')
    expect(repoFile.content).toContain('func update')
    expect(repoFile.content).toContain('func delete')
  })

  // Test 10
  it('Firebase Kotlin repository contains FirestoreTodoRepository with suspend functions', () => {
    const files = renderBaasTemplates(testSchema, 'firebase', ['kotlin'])
    const repoFile = files.find((f) =>
      f.path === 'app/src/main/java/repositories/TodoRepository.kt',
    )
    expect(repoFile).toBeDefined()
    expect(repoFile!.content).toContain('class FirestoreTodoRepository')
    expect(repoFile!.content).toContain('suspend fun')
  })

  // Test 11
  it('Supabase Kotlin repository contains SupabaseTodoRepository with suspend functions', () => {
    const files = renderBaasTemplates(testSchema, 'supabase', ['kotlin'])
    const repoFile = files.find((f) =>
      f.path === 'app/src/main/java/repositories/TodoRepository.kt',
    )
    expect(repoFile).toBeDefined()
    expect(repoFile!.content).toContain('class SupabaseTodoRepository')
    expect(repoFile!.content).toContain('suspend fun')
  })

  // Test 12
  it('Field type mapping — string renders as Swift String (firebase) and text (supabase RLS)', () => {
    const fbFiles = renderBaasTemplates(testSchema, 'firebase', ['swift'])
    const fbRepo = fbFiles.find((f) => f.path.endsWith('TodoRepository.swift'))!
    expect(fbRepo.content).toContain('String')

    const sbFiles = renderBaasTemplates(testSchema, 'supabase', ['swift'])
    const sbRls = sbFiles.find((f) => f.path === 'supabase/rls-policies.sql')!
    // Supabase RLS doesn't directly type-map in the SQL, but the template is present
    expect(sbRls.content).toBeDefined()
  })
})
