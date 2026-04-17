// Phase 4 Wave-0 stub — FIRE-03: Firestore realtime data layer templates.
// Bodies implemented in Phase 4 Plan 02 task execution.
import { describe, it } from 'vitest'

describe('firebase-data templates (FIRE-03)', () => {
  it.todo('repository template uses addSnapshotListener (no getDocuments one-time fetch)')
  it.todo('repository template protocol exposes startListening returning ListenerRegistration')
  it.todo('data-service template holds private var listener: ListenerRegistration?')
  it.todo('data-service template calls listener?.remove() in deinit')
  it.todo('app-entry template configures PersistentCacheSettings (not deprecated enablePersistence)')
})
