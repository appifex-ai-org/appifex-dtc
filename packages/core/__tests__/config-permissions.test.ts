// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import { describe, it } from 'vitest'

describe('config permissions', () => {
  it.todo('saveConfig writes file with mode 0600')
  it.todo('saveConfig is idempotent — second write still yields 0600')
  it.todo('overwriting a pre-existing 0644 file results in 0600')
})
