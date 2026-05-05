// Phase 03 Plan 02 (SETUP-02): Full test suite for credential probe implementations.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DtcConfig } from '../src/types.js'
import {
  runCredentialChecks,
  probeLlm,
  probeAsc,
  probeFirebase,
  probeGoogleOauth,
  probeAppleOauth,
} from '../src/credential-registry.js'

// Helper: generate a valid PKCS#8 EC P-256 PEM key pair
function generateValidP8(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
}

describe('CredentialRegistry — probe implementations', () => {
  let savedMode: string | undefined
  let tmpDir: string

  beforeEach(async () => {
    savedMode = process.env.DTC_LLM_MODE
    delete process.env.DTC_LLM_MODE
    tmpDir = await mkdtemp(join(tmpdir(), 'dtc-cred-test-'))
  })

  afterEach(async () => {
    if (savedMode === undefined) {
      delete process.env.DTC_LLM_MODE
    } else {
      process.env.DTC_LLM_MODE = savedMode
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await rm(tmpDir, { recursive: true, force: true })
  })

  // ── Test 1: LLM shallow OK ──────────────────────────────────────────────
  it('Test 1 (llm shallow): apiKey present + deep=false → OK severity critical', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-valid-key-for-testing-1234' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const check = await probeLlm(config, { deep: false })
    expect(check.status).toBe('OK')
    expect(check.severity).toBe('critical')
    // Message must never contain the API key
    expect(check.message).not.toContain('sk-ant-api03-valid-key-for-testing-1234')
  })

  // ── Test 2: LLM missing ─────────────────────────────────────────────────
  it('Test 2 (llm missing): empty apiKey → MISSING with remedy mentioning dtc setup llm', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const check = await probeLlm(config, { deep: false })
    expect(check.status).toBe('MISSING')
    expect(check.severity).toBe('critical')
    expect(check.remedy).toBeDefined()
    expect(check.remedy).toMatch(/dtc setup/)
  })

  // ── Test 3: LLM deep probes ─────────────────────────────────────────────
  it('Test 3a (llm deep): 401 response → INVALID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-valid-key-for-testing-1234' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const check = await probeLlm(config, { deep: true })
    expect(check.status).toBe('INVALID')
    expect(check.transientError).toBeFalsy()
  })

  it('Test 3b (llm deep): ECONNRESET → OK with transientError=true', async () => {
    const networkError = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-valid-key-for-testing-1234' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const check = await probeLlm(config, { deep: true })
    expect(check.status).toBe('OK')
    expect(check.transientError).toBe(true)
  })

  // ── Test 4: ASC offline ─────────────────────────────────────────────────
  it('Test 4a (asc offline): valid p8 + keyId + issuerId → OK', async () => {
    const pem = generateValidP8()
    const p8Path = join(tmpDir, 'AuthKey_TESTKEY1.p8')
    await writeFile(p8Path, pem, 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      apple: {
        teamId: 'TESTTEAM',
        bundleId: 'com.test.app',
        ascKeyId: 'TESTKEY1',
        ascIssuerId: '12345678-1234-1234-1234-123456789012',
        ascKeyPath: p8Path,
      },
    } satisfies DtcConfig
    const check = await probeAsc(config, { deep: false })
    expect(check.status).toBe('OK')
  })

  it('Test 4b (asc offline): missing p8 file → MISSING', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      apple: {
        teamId: 'TESTTEAM',
        bundleId: 'com.test.app',
        ascKeyId: 'TESTKEY1',
        ascIssuerId: '12345678-1234-1234-1234-123456789012',
        ascKeyPath: join(tmpDir, 'nonexistent.p8'),
      },
    } satisfies DtcConfig
    const check = await probeAsc(config, { deep: false })
    expect(check.status).toBe('MISSING')
  })

  it('Test 4c (asc offline): malformed PEM → INVALID', async () => {
    const p8Path = join(tmpDir, 'AuthKey_BAD.p8')
    await writeFile(
      p8Path,
      '-----BEGIN PRIVATE KEY-----\nNOTVALID\n-----END PRIVATE KEY-----\n',
      'utf-8',
    )
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      apple: {
        teamId: 'TESTTEAM',
        bundleId: 'com.test.app',
        ascKeyId: 'TESTKEY1',
        ascIssuerId: '12345678-1234-1234-1234-123456789012',
        ascKeyPath: p8Path,
      },
    } satisfies DtcConfig
    const check = await probeAsc(config, { deep: false })
    expect(check.status).toBe('INVALID')
  })

  // ── Test 5: ASC deep ────────────────────────────────────────────────────
  it('Test 5a (asc deep): valid key + mocked 200 → OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response))
    const pem = generateValidP8()
    const p8Path = join(tmpDir, 'AuthKey_DEEPOK.p8')
    await writeFile(p8Path, pem, 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      apple: {
        teamId: 'TESTTEAM',
        bundleId: 'com.test.app',
        ascKeyId: 'TESTKEY1',
        ascIssuerId: '12345678-1234-1234-1234-123456789012',
        ascKeyPath: p8Path,
      },
    } satisfies DtcConfig
    const check = await probeAsc(config, { deep: true })
    expect(check.status).toBe('OK')
  })

  it('Test 5b (asc deep): valid key + mocked 401 → EXPIRED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response))
    const pem = generateValidP8()
    const p8Path = join(tmpDir, 'AuthKey_EXPIRED.p8')
    await writeFile(p8Path, pem, 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      apple: {
        teamId: 'TESTTEAM',
        bundleId: 'com.test.app',
        ascKeyId: 'TESTKEY1',
        ascIssuerId: '12345678-1234-1234-1234-123456789012',
        ascKeyPath: p8Path,
      },
    } satisfies DtcConfig
    const check = await probeAsc(config, { deep: true })
    expect(check.status).toBe('EXPIRED')
  })

  // ── Test 6: Firebase plist ──────────────────────────────────────────────
  it('Test 6 (firebase plist): non-existent plist → MISSING critical (when provider=firebase)', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      baas: { provider: 'firebase' as const },
      firebase: {
        projectId: 'test-project',
        iosAppId: '1:123:ios:abc',
        iosBundleId: 'com.test.app',
        plistPath: join(tmpDir, 'nonexistent-GoogleService-Info.plist'),
      },
    } satisfies DtcConfig
    const check = await probeFirebase(config, { deep: false })
    expect(check.name).toBe('firebase-plist')
    expect(check.status).toBe('MISSING')
    expect(check.severity).toBe('critical')
  })

  // ── Test 7: Firebase service account ───────────────────────────────────
  it('Test 7a (firebase sa): absent serviceAccountKeyPath → OK severity info', async () => {
    // Write a valid plist file so plist probe passes
    const plistPath = join(tmpDir, 'GoogleService-Info.plist')
    await writeFile(plistPath, '<plist></plist>', 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      firebase: {
        projectId: 'test-project',
        iosAppId: '1:123:ios:abc',
        iosBundleId: 'com.test.app',
        plistPath,
        // serviceAccountKeyPath is absent
      },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    const saCheck = report.checks.find((c) => c.name === 'firebase-sa')
    expect(saCheck).toBeDefined()
    expect(saCheck!.status).toBe('OK')
    expect(saCheck!.severity).toBe('info')
  })

  it('Test 7b (firebase sa): malformed JSON → INVALID', async () => {
    const plistPath = join(tmpDir, 'GoogleService-Info.plist')
    await writeFile(plistPath, '<plist></plist>', 'utf-8')
    const saPath = join(tmpDir, 'sa-malformed.json')
    await writeFile(saPath, '{ not valid json', 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      firebase: {
        projectId: 'test-project',
        iosAppId: '1:123:ios:abc',
        iosBundleId: 'com.test.app',
        plistPath,
        serviceAccountKeyPath: saPath,
      },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    const saCheck = report.checks.find((c) => c.name === 'firebase-sa')
    expect(saCheck).toBeDefined()
    expect(saCheck!.status).toBe('INVALID')
  })

  it('Test 7c (firebase sa): valid service account JSON → OK', async () => {
    const plistPath = join(tmpDir, 'GoogleService-Info.plist')
    await writeFile(plistPath, '<plist></plist>', 'utf-8')
    const saPath = join(tmpDir, 'sa-valid.json')
    await writeFile(
      saPath,
      JSON.stringify({
        type: 'service_account',
        client_email: 'test@project.iam.gserviceaccount.com',
        private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----',
      }),
      'utf-8',
    )
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      firebase: {
        projectId: 'test-project',
        iosAppId: '1:123:ios:abc',
        iosBundleId: 'com.test.app',
        plistPath,
        serviceAccountKeyPath: saPath,
      },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    const saCheck = report.checks.find((c) => c.name === 'firebase-sa')
    expect(saCheck).toBeDefined()
    expect(saCheck!.status).toBe('OK')
  })

  // ── Test 8: Google OAuth ─────────────────────────────────────────────────
  it('Test 8a (google-oauth): plist present → OK warning', async () => {
    const plistPath = join(tmpDir, 'GoogleService-Info.plist')
    await writeFile(plistPath, '<plist></plist>', 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      firebase: {
        projectId: 'test-project',
        iosAppId: '1:123:ios:abc',
        iosBundleId: 'com.test.app',
        plistPath,
      },
    } satisfies DtcConfig
    const check = await probeGoogleOauth(config, { deep: false })
    expect(check.status).toBe('OK')
    expect(check.severity).toBe('warning')
  })

  it('Test 8b (google-oauth): plist absent → MISSING warning (not critical)', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      firebase: {
        projectId: 'test-project',
        iosAppId: '1:123:ios:abc',
        iosBundleId: 'com.test.app',
        plistPath: join(tmpDir, 'missing.plist'),
      },
    } satisfies DtcConfig
    const check = await probeGoogleOauth(config, { deep: false })
    expect(check.status).toBe('MISSING')
    expect(check.severity).toBe('warning')
    // warning, not critical — Google Sign In is optional for TestFlight
    expect(check.severity).not.toBe('critical')
  })

  // ── Test 9: Apple OAuth ──────────────────────────────────────────────────
  it('Test 9a (apple-oauth): no oauth config → OK severity info message optional', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const check = await probeAppleOauth(config, { deep: false })
    expect(check.status).toBe('OK')
    expect(check.severity).toBe('info')
    expect(check.message).toMatch(/optional/i)
  })

  it('Test 9b (apple-oauth): configured with valid p8 → OK warning', async () => {
    const pem = generateValidP8()
    const p8Path = join(tmpDir, 'apple-oauth.p8')
    await writeFile(p8Path, pem, 'utf-8')
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      oauth: {
        apple: {
          servicesId: 'com.test.signin',
          teamId: 'TESTTEAM',
          keyId: 'TESTKEYID',
          p8Path,
        },
      },
    } satisfies DtcConfig
    const check = await probeAppleOauth(config, { deep: false })
    expect(check.status).toBe('OK')
    expect(check.severity).toBe('warning')
  })

  it('Test 9c (apple-oauth): configured but p8 missing → INVALID warning (never critical)', async () => {
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: 'sk-ant-api03-x' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
      oauth: {
        apple: {
          servicesId: 'com.test.signin',
          teamId: 'TESTTEAM',
          keyId: 'TESTKEYID',
          p8Path: join(tmpDir, 'nonexistent-apple-oauth.p8'),
        },
      },
    } satisfies DtcConfig
    const check = await probeAppleOauth(config, { deep: false })
    expect(check.status).toBe('INVALID')
    expect(check.severity).toBe('warning')
    // never critical — TestFlight v1 does not require Apple Sign In
    expect(check.severity).not.toBe('critical')
  })

  // ── Test 10: Fixture short-circuit ──────────────────────────────────────
  it('Test 10 (fixture short-circuit): DTC_LLM_MODE=fixture → hasBlockingFailures=false', async () => {
    process.env.DTC_LLM_MODE = 'fixture'
    // Pass config that would normally block (empty apiKey)
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(false)
  })

  // ── Test 11: hasBlockingFailures ────────────────────────────────────────
  it('Test 11 (blocking): critical MISSING without transientError → hasBlockingFailures=true', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(true)
  })

  // ── Legacy tests from plan 01 scaffold ──────────────────────────────────
  it('runCredentialChecks returns OK report in fixture mode', async () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const report = await runCredentialChecks(undefined, { deep: false })
    expect(report.hasBlockingFailures).toBe(false)
    expect(report.checks.length).toBeGreaterThan(0)
    expect(report.checks[0].status).toBe('OK')
  })

  it('runCredentialChecks returns MISSING for undefined config (llm probe)', async () => {
    delete process.env.DTC_LLM_MODE
    const report = await runCredentialChecks(undefined, { deep: false })
    const llmCheck = report.checks.find((c) => c.name === 'llm')
    expect(llmCheck).toBeDefined()
    expect(llmCheck!.status).toBe('MISSING')
    expect(llmCheck!.severity).toBe('critical')
  })

  it('runCredentialChecks hasBlockingFailures true when LLM key missing', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'anthropic' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig
    const report = await runCredentialChecks(config, { deep: false })
    expect(report.hasBlockingFailures).toBe(true)
  })

  it('codex-cli shallow LLM probe returns OK without apiKey', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'codex-cli' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig

    const report = await runCredentialChecks(config, { deep: false })
    const llmCheck = report.checks.find((c) => c.name === 'llm')

    expect(llmCheck).toBeDefined()
    expect(llmCheck!.status).toBe('OK')
    expect(llmCheck!.message).toBe('codex-cli (local auth)')
    expect(report.hasBlockingFailures).toBe(false)
  })

  it('codex-cli deep LLM probe skips API ping and returns OK', async () => {
    delete process.env.DTC_LLM_MODE
    const config = {
      llm: { provider: 'codex-cli' as const, apiKey: '' },
      design: { tool: 'pencil' as const },
      runner: { type: 'local' as const },
    } satisfies DtcConfig

    const report = await runCredentialChecks(config, { deep: true })
    const llmCheck = report.checks.find((c) => c.name === 'llm')

    expect(llmCheck).toBeDefined()
    expect(llmCheck!.status).toBe('OK')
    expect(llmCheck!.message).toBe('codex-cli (local auth)')
    expect(report.hasBlockingFailures).toBe(false)
  })
})
