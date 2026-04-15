// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import { describe, it } from 'vitest'

describe('asc-jwt', () => {
  it.todo('signs ES256 JWT from PKCS#8 PEM')
  it.todo('probeAscOffline returns OK for valid key')
  it.todo('probeAscOffline returns INVALID for malformed PEM')
  it.todo('signed JWT has correct aud appstoreconnect-v1')
  it.todo('signed JWT has correct iss and kid claims')
  it.todo('probeAscLive returns TRANSIENT on network error')
})
