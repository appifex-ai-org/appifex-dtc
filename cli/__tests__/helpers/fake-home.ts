// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function createFakeHome(): { dir: string; cleanup: () => Promise<void> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtc-test-'))
  return {
    dir,
    cleanup: async () => {
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
