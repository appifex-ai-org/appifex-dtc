// Phase 03 Plan 04 (SETUP-04): Wave-0 stub — Firebase BaaS provisioning integration tests.
// Bodies implemented in Phase 4 (BaaS integration phase).
import { describe, it } from 'vitest'

describe('firebase-provision', () => {
  it.todo('provisions a new Firebase project and returns projectId')
  it.todo('registers an iOS app and returns iosAppId')
  it.todo('downloads GoogleService-Info.plist to the expected path')
  it.todo('idempotent: re-running with existing projectId skips project:create')
  it.todo('throws ProvisionError when firebase-tools exits non-zero')
})
