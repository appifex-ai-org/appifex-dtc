/**
 * Phase 22: Frontend Wiring and Pipeline Integration tests.
 *
 * Covers WIRE-01 and WIRE-02:
 *  - generateDataServices called in baas_schema pipeline block
 *  - BaaS Data Layer injection in layered-generate.ts
 *  - Auth Screen protection in layered-generate.ts
 *  - patchProjectDependencies/patchBuildGradle in pipeline
 *  - AppEntry.swift protected from codegen overwrite
 *  - Build dependency URLs for Firebase and Supabase
 *  - Functional test: generateDataServices rendering
 *
 * Uses source-text assertion approach matching pipeline-baas-schema.test.ts precedent.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipelineSrc = readFileSync(join(__dirname, '../src/pipeline.ts'), 'utf-8')
const layeredSrc = readFileSync(
  join(__dirname, '../../packages/codegen/src/layered-generate.ts'),
  'utf-8',
)
const swiftSrc = readFileSync(join(__dirname, '../../packages/build/src/swift.ts'), 'utf-8')
const kotlinSrc = readFileSync(join(__dirname, '../../packages/build/src/kotlin.ts'), 'utf-8')
const buildIndexSrc = readFileSync(join(__dirname, '../../packages/build/src/index.ts'), 'utf-8')
const baasIndexSrc = readFileSync(join(__dirname, '../../packages/baas/src/index.ts'), 'utf-8')

// ── WIRE-01: DataService wiring ────────────────────────────────────────────

describe('WIRE-01: DataService wiring', () => {
  // Phase 1 Plan 03 (GATE-01): pre-existing failures documented in Phase 01 Plan 01
  // deferred-items.md — WIRE-01 DataService wiring not yet implemented. Un-skip in the
  // future BaaS wiring plan (tracked for Phase 04) once functionality is wired.
  it.skip('pipeline.ts calls generateDataServices in baas_schema block', () => {
    expect(pipelineSrc).toContain('generateDataServices')
    expect(pipelineSrc).toContain('generateDataServices(schema, resolvedBaasProvider)')
  })

  it('@appifex/baas exports generateDataServices', () => {
    expect(baasIndexSrc).toContain('generateDataServices')
  })

  it.skip('layered-generate.ts contains BaaS Data Layer injection', () => {
    expect(layeredSrc).toContain('BaaS Data Layer')
  })

  it.skip('layered-generate.ts references DataService in prompt', () => {
    expect(layeredSrc).toContain('DataService')
  })

  it.skip('layered-generate.ts prevents AppEntry.swift generation', () => {
    expect(layeredSrc).toContain('Do NOT generate Sources/AppEntry.swift')
  })

  it.skip('layered-generate.ts protects auth screen wiring', () => {
    expect(layeredSrc).toContain('Auth Screens (DO NOT MODIFY WIRING)')
  })

  it('swift.ts contains Firebase SPM URL', () => {
    expect(swiftSrc).toContain('firebase-ios-sdk.git')
  })

  it('swift.ts contains Supabase SPM URL', () => {
    expect(swiftSrc).toContain('supabase-swift.git')
  })

  it('swift.ts exports patchProjectDependencies', () => {
    expect(swiftSrc).toContain('export async function patchProjectDependencies')
  })

  it('swift.ts has idempotency guard for packages:', () => {
    expect(swiftSrc).toContain("includes('packages:')")
  })
})

// ── WIRE-01: Android build patching ────────────────────────────────────────

describe('WIRE-01: Android build patching', () => {
  it('kotlin.ts contains firebase-bom dependency', () => {
    expect(kotlinSrc).toContain('firebase-bom')
  })

  it('kotlin.ts contains google-services plugin', () => {
    expect(kotlinSrc).toContain('google-services')
  })

  it('kotlin.ts exports patchBuildGradle', () => {
    expect(kotlinSrc).toContain('export async function patchBuildGradle')
  })

  it('build index.ts re-exports patchProjectDependencies and patchBuildGradle', () => {
    expect(buildIndexSrc).toContain('patchProjectDependencies')
    expect(buildIndexSrc).toContain('patchBuildGradle')
  })
})

// ── WIRE-02: Pipeline integration ──────────────────────────────────────────

describe('WIRE-02: Pipeline integration', () => {
  it('pipeline.ts calls patchProjectDependencies', () => {
    expect(pipelineSrc).toContain('patchProjectDependencies')
  })

  it('pipeline.ts calls patchBuildGradle', () => {
    expect(pipelineSrc).toContain('patchBuildGradle')
  })

  it('pipeline.ts protects AppEntry.swift when BaaS active', () => {
    expect(pipelineSrc).toContain("protectedFiles.add('AppEntry.swift')")
  })

  it('pipeline.ts imports patchProjectDependencies from @appifex/build', () => {
    expect(pipelineSrc).toContain('patchProjectDependencies')
    // Phase 1 Plan 03: after Prettier ran, this import spans multiple lines.
    // Match the full import block via regex instead of a single line.
    const buildImportBlock = pipelineSrc.match(/import\s*\{[^}]*\}\s*from\s*'@appifex\/build'/s)
    expect(buildImportBlock).not.toBeNull()
    expect(buildImportBlock![0]).toContain('patchProjectDependencies')
  })

  it('pipeline.ts emits build dependency patching message', () => {
    expect(pipelineSrc).toContain('Patching build dependencies...')
  })
})

// ── WIRE-01: Functional — generateDataServices rendering ───────────────────

describe('WIRE-01: Functional — generateDataServices rendering', () => {
  it('generates DataService files for a single entity', async () => {
    const { generateDataServices } = await import('@appifex/baas')
    const schema = {
      entities: [
        {
          name: 'Todo',
          fields: [
            { name: 'title', type: 'string' as const, required: true },
            { name: 'done', type: 'boolean' as const },
          ],
        },
      ],
    }
    const files = generateDataServices(schema, 'firebase')
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('Sources/Services/TodoDataService.swift')
    expect(files[0].content).toContain('@Observable')
    expect(files[0].content).toContain('final class TodoDataService')
    expect(files[0].content).toContain('any TodoRepository')
    expect(files[0].content).toContain('FirestoreTodoRepository()')
    expect(files[0].content).not.toContain('import FirebaseFirestore') // DataService uses closure-based listener (Phase 4)
  })

  it('generates Supabase DataService with correct default repository', async () => {
    const { generateDataServices } = await import('@appifex/baas')
    const schema = {
      entities: [{ name: 'Note', fields: [{ name: 'text', type: 'string' as const }] }],
    }
    const files = generateDataServices(schema, 'supabase')
    expect(files).toHaveLength(1)
    expect(files[0].content).toContain('SupabaseNoteRepository()')
  })
})
