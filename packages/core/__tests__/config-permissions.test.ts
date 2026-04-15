// Phase 03 Plan 01 (SETUP-02, RESEARCH Pitfall 8): config file 0600 permission tests.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveConfig } from '../src/config.js'
import type { DtcConfig } from '../src/types.js'

const baseConfig: DtcConfig = {
  llm: { provider: 'anthropic', apiKey: 'sk-test' },
  design: { tool: 'pencil' },
  runner: { type: 'local' },
}

describe('config permissions', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'dtc-perm-test-'))
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
  })

  it.skipIf(process.platform === 'win32')(
    'saveConfig writes file with mode 0600',
    async () => {
      await saveConfig(configDir, baseConfig)
      const mode = statSync(join(configDir, 'config.json')).mode & 0o777
      expect(mode).toBe(0o600)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'saveConfig is idempotent — second write still yields 0600',
    async () => {
      await saveConfig(configDir, baseConfig)
      await saveConfig(configDir, { ...baseConfig, llm: { ...baseConfig.llm, apiKey: 'sk-updated' } })
      const mode = statSync(join(configDir, 'config.json')).mode & 0o777
      expect(mode).toBe(0o600)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'overwriting a pre-existing 0644 file results in 0600',
    async () => {
      // Create a world-readable file first
      const filePath = join(configDir, 'config.json')
      writeFileSync(filePath, '{}', 'utf-8')
      chmodSync(filePath, 0o644)
      // Now save — should tighten permissions to 0600
      await saveConfig(configDir, baseConfig)
      const mode = statSync(filePath).mode & 0o777
      expect(mode).toBe(0o600)
    },
  )
})
