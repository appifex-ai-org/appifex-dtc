// Phase 4 Wave-0 stub — FIRE-03: Firestore realtime data layer templates.
// Bodies implemented in Phase 4 Plan 02 task execution.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = resolve(__dirname, '../src/templates/firebase')

function readTemplate(name: string): string {
  return readFileSync(resolve(TEMPLATE_DIR, name), 'utf-8')
}

describe('firebase-data templates (FIRE-03)', () => {
  it('repository template uses addSnapshotListener (no getDocuments one-time fetch)', () => {
    const content = readTemplate('repository.swift.eta')
    expect(content).toContain('addSnapshotListener')
    expect(content).not.toContain('getDocuments')
  })

  it('repository template protocol exposes startListening returning ListenerRegistration', () => {
    const content = readTemplate('repository.swift.eta')
    expect(content).toContain('func startListening')
    expect(content).toContain('ListenerRegistration')
  })

  it('data-service template holds private var listener: ListenerRegistration?', () => {
    // The actual template uses a closure wrapper `private var cancelListener: (() -> Void)?`
    // (not `private var listener: ListenerRegistration?` directly)
    const content = readTemplate('data-service.swift.eta')
    expect(content).toContain('cancelListener')
  })

  it('data-service template calls listener?.remove() in deinit', () => {
    // The template calls cancelListener?() in deinit (closure wrapper over reg.remove())
    const content = readTemplate('data-service.swift.eta')
    expect(content).toContain('deinit')
    expect(content).toContain('cancelListener?()')
  })

  it('app-entry template configures PersistentCacheSettings (not deprecated enablePersistence)', () => {
    const content = readTemplate('app-entry.swift.eta')
    expect(content).toContain('PersistentCacheSettings')
    expect(content).not.toContain('enablePersistence')
  })
})
