// Phase 03 Plan 01 (SETUP-02): Integration tests for runCredentialChecks — real probes, real temp files.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runCredentialChecks } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtc-cred-gate-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DTC_LLM_MODE
})

function makeValidP8(dir: string, filename = 'AuthKey_TEST.p8'): string {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const p = path.join(dir, filename)
  fs.writeFileSync(p, pem, 'utf-8')
  return p
}

describe('preflight credential gate', () => {
  it('fails before LLM spend on MISSING ASC key', async () => {
    const config: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test-anthropic-1234567890' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
      apple: {
        teamId: 'TESTTEAM1',
        bundleId: 'com.test.app',
        ascKeyPath: '/no/such/key.p8',
        ascKeyId: 'TESTKID1',
        ascIssuerId: 'test-issuer-id',
      },
    }
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(true)
    expect(report.checks.some((c) => c.name === 'asc' && c.status === 'MISSING')).toBe(true)
  })

  it('fails before LLM spend on MISSING LLM API key', async () => {
    const config: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: '' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(true)
    expect(report.checks.some((c) => c.name === 'llm' && c.status === 'MISSING')).toBe(true)
  })

  it('passes when all credentials are OK', async () => {
    const p8Path = makeValidP8(tmpDir, 'AuthKey_PASS.p8')
    const config: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test-anthropic-1234567890' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
      apple: {
        teamId: 'TESTTEAM1',
        bundleId: 'com.test.app',
        ascKeyPath: p8Path,
        ascKeyId: 'TESTKID1',
        ascIssuerId: 'test-issuer-id',
      },
    }
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(false)
  })

  it('returns INVALID status for malformed ASC key path', async () => {
    const malformedPath = path.join(tmpDir, 'malformed.p8')
    fs.writeFileSync(malformedPath, 'not a valid pem', 'utf-8')
    const config: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test-anthropic-1234567890' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
      apple: {
        teamId: 'TESTTEAM1',
        bundleId: 'com.test.app',
        ascKeyPath: malformedPath,
        ascKeyId: 'TESTKID1',
        ascIssuerId: 'test-issuer-id',
      },
    }
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.checks.some((c) => c.name === 'asc' && c.status === 'INVALID')).toBe(true)
  })

  it('returns EXPIRED status for past-expiry ASC JWT', async () => {
    const p8Path = makeValidP8(tmpDir, 'AuthKey_EXPIRED.p8')

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('api.anthropic.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
          })
        }
        // appstoreconnect — simulate expired JWT
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
        })
      }),
    )

    const config: DtcConfig = {
      llm: { provider: 'anthropic', apiKey: 'sk-test-anthropic-1234567890' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
      apple: {
        teamId: 'TESTTEAM1',
        bundleId: 'com.test.app',
        ascKeyPath: p8Path,
        ascKeyId: 'TESTKID1',
        ascIssuerId: 'test-issuer-id',
      },
    }
    const report = await runCredentialChecks(config, { deep: true })
    expect(report.checks.some((c) => c.name === 'asc' && c.status === 'EXPIRED')).toBe(true)
  })
})
