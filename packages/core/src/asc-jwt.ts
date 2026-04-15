// Phase 03 Plan 01 (SETUP-02, D-03/D-04): ASC JWT signing + offline/live probes.
// signAscJwt: produces an ES256 JWT for App Store Connect API authentication.
// probeAscOffline: validates a .p8 key file by attempting to sign — no network.
// probeAscLive: performs a 1-request GET /v1/apps to verify live key acceptance.
import { readFile } from 'node:fs/promises'
import { SignJWT, importPKCS8, decodeJwt } from 'jose'

export interface AscJwtArgs {
  keyPath: string
  keyId: string
  issuerId: string
}

/**
 * Sign an ES256 JWT for the App Store Connect API.
 * Expiry is fixed at 19m per Apple spec (max 20m); never persist the JWT.
 */
export async function signAscJwt(args: AscJwtArgs): Promise<string> {
  const pem = await readFile(args.keyPath, 'utf-8')
  const key = await importPKCS8(pem, 'ES256')
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: args.keyId, typ: 'JWT' })
    .setIssuer(args.issuerId)
    .setIssuedAt()
    .setExpirationTime('19m')
    .setAudience('appstoreconnect-v1')
    .sign(key)
}

/**
 * Validate an ASC .p8 key file offline by attempting to sign.
 * Returns 'OK' if the key is a valid PKCS#8 EC P-256 PEM; 'INVALID' otherwise.
 * Never throws — errors are caught without including key material in messages.
 */
export async function probeAscOffline(args: AscJwtArgs): Promise<'OK' | 'INVALID'> {
  try {
    await signAscJwt(args)
    return 'OK'
  } catch {
    return 'INVALID'
  }
}

/**
 * Probe ASC live via GET /v1/apps?limit=1.
 * Returns 'OK', 'EXPIRED' (401), 'INVALID' (403/4xx), or 'TRANSIENT' (5xx/network).
 * Apple returns 401 for expired JWTs per ASC API docs (Pitfall 5 in RESEARCH).
 */
export async function probeAscLive(
  jwt: string,
): Promise<'OK' | 'INVALID' | 'EXPIRED' | 'TRANSIENT'> {
  try {
    const res = await fetch('https://api.appstoreconnect.apple.com/v1/apps?limit=1', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    if (res.ok) return 'OK'
    if (res.status === 401) return 'EXPIRED'
    if (res.status === 403) return 'INVALID'
    if (res.status >= 500) return 'TRANSIENT'
    return 'INVALID'
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return 'TRANSIENT'
    return 'INVALID'
  }
}

// Re-export decodeJwt for test convenience
export { decodeJwt }
