import { describe, it, expect, vi } from 'vitest'
import { AscClient } from '../src/index.js'
import type { Runner } from '@appifex/core'

function mockRunner(overrides: Partial<{ exec: unknown }> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: { hasMaestro: true, hasXcode: true, hasNode: true, hasSemgrep: false, platform: 'darwin' },
    ...overrides,
  }
}

describe('AscClient', () => {
  describe('submitTestFlight', () => {
    it('calls asc publish testflight with app ID and IPA path', async () => {
      const runner = mockRunner({
        exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'Submitted v1.0.0', stderr: '', duration: 5000 }),
      })
      const client = new AscClient(runner, { keyId: 'KEY1', issuerId: 'ISS1', keyPath: '/keys/auth.p8' })

      const result = await client.submitTestFlight({ appId: '123456789', ipaPath: '/build/App.ipa' })

      expect(runner.exec).toHaveBeenCalledWith(
        'asc',
        expect.arrayContaining(['publish', 'testflight', '--app', '123456789', '--ipa', '/build/App.ipa', '--wait']),
        expect.objectContaining({
          env: expect.objectContaining({
            ASC_KEY_ID: 'KEY1',
            ASC_ISSUER_ID: 'ISS1',
            ASC_PRIVATE_KEY_PATH: '/keys/auth.p8',
            ASC_BYPASS_KEYCHAIN: '1',
          }),
        }),
      )
      expect(result.success).toBe(true)
    })

    it('returns failure on non-zero exit', async () => {
      const runner = mockRunner({
        exec: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'Invalid IPA', duration: 1000 }),
      })
      const client = new AscClient(runner, { keyId: 'K', issuerId: 'I', keyPath: '/k.p8' })

      const result = await client.submitTestFlight({ appId: '123', ipaPath: '/bad.ipa' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid IPA')
    })

    it('omits --wait when wait is false', async () => {
      const runner = mockRunner({
        exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'Uploaded', stderr: '', duration: 3000 }),
      })
      const client = new AscClient(runner, { keyId: 'K', issuerId: 'I', keyPath: '/k.p8' })

      await client.submitTestFlight({ appId: '123', ipaPath: '/build/App.ipa', wait: false })

      const callArgs = (runner.exec as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
      expect(callArgs).not.toContain('--wait')
    })
  })

  describe('listApps', () => {
    it('parses app list from asc output', async () => {
      const jsonOutput = JSON.stringify([
        { id: '123', name: 'Pet App', bundleId: 'com.example.pet' },
        { id: '456', name: 'Other App', bundleId: 'com.example.other' },
      ])
      const runner = mockRunner({
        exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: jsonOutput, stderr: '', duration: 500 }),
      })
      const client = new AscClient(runner, { keyId: 'K', issuerId: 'I', keyPath: '/k.p8' })

      const apps = await client.listApps()

      expect(apps).toHaveLength(2)
      expect(apps[0].name).toBe('Pet App')
      expect(apps[1].bundleId).toBe('com.example.other')
    })
  })

  describe('listProfiles', () => {
    it('calls asc profiles list', async () => {
      const runner = mockRunner({
        exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'Profile list', stderr: '', duration: 2000 }),
      })
      const client = new AscClient(runner, { keyId: 'K', issuerId: 'I', keyPath: '/k.p8' })

      const result = await client.listProfiles()

      expect(runner.exec).toHaveBeenCalledWith(
        'asc',
        ['profiles', 'list'],
        expect.anything(),
      )
      expect(result.success).toBe(true)
    })
  })
})
