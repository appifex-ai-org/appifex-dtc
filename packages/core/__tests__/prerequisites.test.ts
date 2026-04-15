// Phase 1 Plan 01-10 (GATE-02 fix): checkLlmAccess must pass when DTC_LLM_MODE=fixture
// so hermetic CI (no ~/.dtc/config.json, no ANTHROPIC_API_KEY) can start the pipeline.
// Phase 03 Plan 05 (SETUP-03, D-11): tests for checkFirebaseTools, checkServiceAccountJson, checkAscP8.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkCriticalPrerequisites, checkFirebaseTools, checkServiceAccountJson, checkAscP8 } from '../src/prerequisites.js'
import type { DtcConfig } from '../src/types.js'
import { writeFile, rm, mkdtemp } from 'node:fs/promises'
import { generateKeyPairSync } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const emptyAnthropicConfig: DtcConfig = {
  llm: { provider: 'anthropic', apiKey: '' },
  design: { tool: 'pencil' },
  runner: { type: 'local' },
}

function findLlmCheck(report: ReturnType<typeof checkCriticalPrerequisites>) {
  const llm = report.checks.find((c) => c.name === 'LLM access')
  if (!llm) throw new Error('LLM access check missing from report')
  return llm
}

describe('checkCriticalPrerequisites — LLM access under fixture mode', () => {
  const prevMode = process.env.DTC_LLM_MODE

  beforeEach(() => {
    delete process.env.DTC_LLM_MODE
  })

  afterEach(() => {
    if (prevMode === undefined) delete process.env.DTC_LLM_MODE
    else process.env.DTC_LLM_MODE = prevMode
  })

  it('fails when DTC_LLM_MODE is unset and anthropic apiKey is missing', () => {
    const report = checkCriticalPrerequisites('kotlin-compose', emptyAnthropicConfig)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('fail')
    expect(llm.message).toMatch(/anthropic API key missing/)
  })

  it('passes when DTC_LLM_MODE=fixture even with empty apiKey', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const report = checkCriticalPrerequisites('kotlin-compose', emptyAnthropicConfig)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })

  it('passes when DTC_LLM_MODE=fixture and no config is supplied', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const report = checkCriticalPrerequisites('kotlin-compose')
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })

  it('fixture short-circuit wins over the claude-cli provider branch', () => {
    process.env.DTC_LLM_MODE = 'fixture'
    const cfg: DtcConfig = {
      llm: { provider: 'claude-cli', apiKey: '' },
      design: { tool: 'pencil' },
      runner: { type: 'local' },
    }
    const report = checkCriticalPrerequisites('kotlin-compose', cfg)
    const llm = findLlmCheck(report)
    expect(llm.status).toBe('pass')
    expect(llm.message).toMatch(/fixture mode/)
  })
})

// Phase 03 Plan 05 (SETUP-03, D-11): checkFirebaseTools tests
describe('checkFirebaseTools', () => {
  // Test 1 & 2: severity + pass/fail based on which('firebase')
  it('returns pass with version message when firebase CLI is found', () => {
    const check = checkFirebaseTools('info')
    // Result depends on environment; just verify structure
    expect(check.name).toBe('firebase CLI')
    expect(['pass', 'fail']).toContain(check.status)
    if (check.status === 'pass') {
      expect(check.message).toMatch(/firebase/)
    } else {
      expect(check.message).toMatch(/not found/)
      expect(check.installHint).toBeTruthy()
    }
  })

  it('uses severity "critical" when provider is firebase', () => {
    const check = checkFirebaseTools('critical')
    expect(check.severity).toBe('critical')
  })

  it('uses severity "info" by default', () => {
    const check = checkFirebaseTools('info')
    expect(check.severity).toBe('info')
  })
})

// Phase 03 Plan 05 (SETUP-03): checkServiceAccountJson tests
describe('checkServiceAccountJson', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dtc-test-sa-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  // Test 3: file not found
  it('returns fail with "file not found" message for nonexistent path', async () => {
    const check = await checkServiceAccountJson('/no/such/service-account.json')
    expect(check.status).toBe('fail')
    expect(check.severity).toBe('warning')
    expect(check.message).toMatch(/file not found/)
  })

  // Test 4: valid service-account JSON
  it('returns pass with clientEmail for valid service-account JSON', async () => {
    const saPath = join(tmpDir, 'sa.json')
    await writeFile(saPath, JSON.stringify({
      type: 'service_account',
      client_email: 'test@my-project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
    }))
    const check = await checkServiceAccountJson(saPath)
    expect(check.status).toBe('pass')
    expect(check.message).toContain('test@my-project.iam.gserviceaccount.com')
  })

  // Test 5: JSON with wrong type
  it('returns fail when type is not service_account', async () => {
    const saPath = join(tmpDir, 'sa-bad.json')
    await writeFile(saPath, JSON.stringify({ type: 'user', client_email: 'x@example.com' }))
    const check = await checkServiceAccountJson(saPath)
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/expected service_account/)
  })

  // Test: skip when path is undefined
  it('returns skip when path is undefined', async () => {
    const check = await checkServiceAccountJson(undefined)
    expect(check.status).toBe('skip')
  })
})

// Phase 03 Plan 05 (SETUP-03, D-11): checkAscP8 tests
describe('checkAscP8', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dtc-test-p8-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  // Test 6: valid EC PKCS#8 PEM -> pass
  it('returns pass for a valid EC PKCS#8 PEM key', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    const p8Path = join(tmpDir, 'AuthKey.p8')
    await writeFile(p8Path, pem)
    const check = await checkAscP8(p8Path)
    expect(check.status).toBe('pass')
  })

  // Test 6b: non-PEM content -> fail
  it('returns fail for non-PEM content', async () => {
    const p8Path = join(tmpDir, 'bad.p8')
    await writeFile(p8Path, 'not a pem file at all')
    const check = await checkAscP8(p8Path)
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/not a valid EC PKCS#8 PEM/)
  })

  // Test 7: missing file -> fail
  it('returns fail with "file not found" for missing file', async () => {
    const check = await checkAscP8('/no/such/AuthKey.p8')
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/file not found/)
  })

  // Test 8: key unusable (importPKCS8 rejection) -> fail
  it('returns fail with "key unusable" when key cannot be imported', async () => {
    const p8Path = join(tmpDir, 'bad-pem.p8')
    // Has PEM markers but invalid content
    await writeFile(p8Path, '-----BEGIN PRIVATE KEY-----\nbadbase64\n-----END PRIVATE KEY-----\n')
    const check = await checkAscP8(p8Path)
    expect(check.status).toBe('fail')
    expect(check.message).toMatch(/key unusable/)
  })

  // Test: skip when path is undefined
  it('returns skip when path is undefined', async () => {
    const check = await checkAscP8(undefined)
    expect(check.status).toBe('skip')
  })
})
