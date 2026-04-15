// Phase 03 Plan 01 (SETUP-02): Wave-0 test scaffold — downstream plans fill in bodies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { signAscJwt, probeAscOffline, decodeJwt } from '../src/asc-jwt.js'

let tmpDir: string
let pemPath: string
const KEY_ID = 'TESTKEYID1'
const ISSUER_ID = 'test-issuer-uuid'

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtc-asc-test-'))
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  pemPath = path.join(tmpDir, 'AuthKey_TESTKEYID1.p8')
  fs.writeFileSync(pemPath, pem, 'utf-8')
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('asc-jwt', () => {
  it('signs ES256 JWT from PKCS#8 PEM', async () => {
    const jwt = await signAscJwt({ keyPath: pemPath, keyId: KEY_ID, issuerId: ISSUER_ID })
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)
    // each part should be non-empty base64url
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0)
    }
  })

  it('signed JWT has correct aud appstoreconnect-v1', async () => {
    const jwt = await signAscJwt({ keyPath: pemPath, keyId: KEY_ID, issuerId: ISSUER_ID })
    const claims = decodeJwt(jwt)
    expect(claims.aud).toContain('appstoreconnect-v1')
  })

  it('signed JWT has correct iss and kid claims', async () => {
    const jwt = await signAscJwt({ keyPath: pemPath, keyId: KEY_ID, issuerId: ISSUER_ID })
    const claims = decodeJwt(jwt)
    expect(claims.iss).toBe(ISSUER_ID)
    // kid is in the header, not payload — check the raw header
    const header = JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString('utf-8')) as {
      kid: string
    }
    expect(header.kid).toBe(KEY_ID)
  })

  it('probeAscOffline returns OK for valid key', async () => {
    const result = await probeAscOffline({ keyPath: pemPath, keyId: KEY_ID, issuerId: ISSUER_ID })
    expect(result).toBe('OK')
  })

  it('probeAscOffline returns INVALID for malformed PEM', async () => {
    const result = await probeAscOffline({
      keyPath: '/no/such/path.p8',
      keyId: 'K',
      issuerId: 'I',
    })
    expect(result).toBe('INVALID')
  })

  it.todo('probeAscLive returns TRANSIENT on network error')
})
