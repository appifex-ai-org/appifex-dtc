// Phase 4 Wave-0 stubs — FIRE-05: two new hard-fail lint patterns added in Phase 4.
// Bodies implemented in Phase 4 Plan 05.
import { describe, it } from 'vitest'

describe('lintSecurityRules — Phase 4 patterns (FIRE-05)', () => {
  it.todo('hard-fails when rules allow cross-user reads without ownership check (request.auth.uid == resource.data.ownerId absent)')
  it.todo('hard-fails when rules are missing deny-all default (match /{document=**} allow read, write: if false)')
  it.todo('lint runs before firebase-admin deploys rules; failure throws SecurityLintError with violations list')
  it.todo('pipeline aborts and rules are never deployed when SecurityLintError is thrown')
})
