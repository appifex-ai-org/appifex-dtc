// Phase 03 Plan 01 (SETUP-02, D-03/D-04/D-05): CredentialRegistry contract.
// Phase 03 Plan 02 (SETUP-02): Full probe implementations.
// Phase 03 Plan 02 (SETUP-02, D-03/D-04/D-05): runCredentialChecks gates pipeline start —
// throws PreflightError before any LLM spend. Fixture mode short-circuits per RESEARCH Pitfall 7.
import { access } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import type { DtcConfig } from './types.js'
import { isFixtureMode } from './llm-fixture.js'
import { probeAscOffline, probeAscLive, signAscJwt } from './asc-jwt.js'

export type CredentialStatus = 'OK' | 'MISSING' | 'INVALID' | 'EXPIRED'

export interface CredentialCheck {
  name: string
  severity: 'critical' | 'warning' | 'info'
  status: CredentialStatus
  message: string
  transientError?: boolean
  remedy?: string
}

export interface CredentialReport {
  checks: CredentialCheck[]
  hasBlockingFailures: boolean
}

export interface CredentialCheckOpts {
  deep: boolean
}

// ── probeLlm ───────────────────────────────────────────────────────────────
// Shallow: validates API key shape (non-empty, min length).
// Deep: performs a 1-token ping to the LLM endpoint per RESEARCH D-03.
// Transient network errors (ECONNRESET/ETIMEDOUT/ENOTFOUND) → OK transientError:true (Pitfall 3).
// Message field MUST NOT contain the API key itself (T-03-02-01).

export async function probeLlm(
  config: DtcConfig | undefined,
  opts: CredentialCheckOpts,
): Promise<CredentialCheck> {
  const base = { name: 'llm', severity: 'critical' as const }
  const key = config?.llm?.apiKey
  if (!key || key.length === 0) {
    return {
      ...base,
      status: 'MISSING',
      message: 'LLM provider key not set',
      remedy: 'Run `dtc setup llm` to configure an API key.',
    }
  }
  if (typeof key !== 'string' || key.length < 10) {
    return { ...base, status: 'INVALID', message: 'API key format looks wrong (too short)' }
  }
  if (!opts.deep) {
    return { ...base, status: 'OK', message: `${config?.llm?.provider ?? 'anthropic'} (shape-valid)` }
  }
  // Deep probe — 1-token ping per RESEARCH D-03.
  // T-03-02-03: explicit AbortSignal.timeout(5000) prevents infinite hang.
  try {
    const signal = AbortSignal.timeout(5_000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config?.llm?.model ?? 'claude-3-5-haiku-latest',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal,
    })
    if (res.ok) return { ...base, status: 'OK', message: 'live probe passed' }
    if (res.status === 401 || res.status === 403) {
      return { ...base, status: 'INVALID', message: `HTTP ${res.status}` }
    }
    if (res.status >= 500) {
      return { ...base, status: 'OK', message: `transient ${res.status}`, transientError: true }
    }
    return { ...base, status: 'INVALID', message: `HTTP ${res.status}` }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'ABORT_ERR' ||
        (err as Error).name === 'TimeoutError') {
      return { ...base, status: 'OK', message: `transient network error: ${code ?? 'timeout'}`, transientError: true }
    }
    return { ...base, status: 'INVALID', message: `probe error: ${(err as Error).message ?? String(err)}` }
  }
}

// ── probeAsc ───────────────────────────────────────────────────────────────
// Shallow: validates .p8 key exists + is parseable PKCS#8 EC key (via probeAscOffline).
// Deep: additionally calls probeAscLive (GET /v1/apps) — maps TRANSIENT → OK transientError:true.
// Severity: critical when ascKeyPath is configured; info when Apple section absent.

export async function probeAsc(
  config: DtcConfig | undefined,
  opts: CredentialCheckOpts,
): Promise<CredentialCheck> {
  const base = { name: 'asc', severity: 'critical' as const }
  const keyPath = config?.apple?.ascKeyPath
  const keyId = config?.apple?.ascKeyId
  const issuerId = config?.apple?.ascIssuerId

  if (!keyPath || !keyId || !issuerId) {
    return {
      name: 'asc',
      severity: 'info' as const,
      status: 'MISSING',
      message: 'ASC .p8 key not configured (required for TestFlight delivery)',
      remedy: 'Run `dtc setup apple` to enter your App Store Connect key.',
    }
  }

  // Check file existence separately so we can return MISSING vs INVALID
  try {
    await access(keyPath)
  } catch {
    return {
      ...base,
      status: 'MISSING',
      message: `ASC key file not found at configured path`,
      remedy: `Verify the path in your config or run \`dtc setup apple\`.`,
    }
  }

  // Offline validation — try to sign a JWT with the key
  const offlineResult = await probeAscOffline({ keyPath, keyId, issuerId })
  if (offlineResult === 'INVALID') {
    return {
      ...base,
      status: 'INVALID',
      message: 'ASC .p8 key file is not a valid PKCS#8 EC key',
      remedy: 'Download the .p8 file from App Store Connect > Users > Keys.',
    }
  }

  if (!opts.deep) {
    return { ...base, status: 'OK', message: 'ASC key valid (offline)' }
  }

  // Deep probe — sign JWT and call live endpoint
  try {
    const jwt = await signAscJwt({ keyPath, keyId, issuerId })
    const liveResult = await probeAscLive(jwt)
    if (liveResult === 'OK') return { ...base, status: 'OK', message: 'ASC live probe passed' }
    if (liveResult === 'EXPIRED') return { ...base, status: 'EXPIRED', message: 'ASC JWT rejected — key may be revoked or expired' }
    if (liveResult === 'TRANSIENT') return { ...base, status: 'OK', message: 'transient network error on ASC probe', transientError: true }
    return { ...base, status: 'INVALID', message: 'ASC live probe returned unexpected status' }
  } catch (err) {
    return { ...base, status: 'OK', message: `transient: ${(err as Error).message}`, transientError: true }
  }
}

// ── probeFirebase ──────────────────────────────────────────────────────────
// Returns the primary check (firebase-plist) directly.
// A companion firebase-sa check is handled separately in runCredentialChecks.
// Severity: critical when baas.provider === 'firebase' or firebase config is present.

export async function probeFirebase(
  config: DtcConfig | undefined,
  _opts: CredentialCheckOpts,
): Promise<CredentialCheck> {
  // Non-firebase BaaS provider — skip entirely
  if (config?.baas?.provider && config.baas.provider !== 'firebase') {
    return {
      name: 'firebase-plist',
      severity: 'info' as const,
      status: 'OK',
      message: `non-firebase provider (${config.baas.provider})`,
    }
  }

  // No firebase config at all — not critical unless provider explicitly set to firebase
  if (!config?.firebase) {
    const severity = config?.baas?.provider === 'firebase' ? 'critical' as const : 'info' as const
    return {
      name: 'firebase-plist',
      severity,
      status: 'MISSING',
      message: 'Firebase configuration not set up',
      remedy: 'Run `dtc setup firebase` to create a Firebase project.',
    }
  }

  const plistPath = config.firebase.plistPath
  if (!plistPath) {
    return {
      name: 'firebase-plist',
      severity: 'critical' as const,
      status: 'MISSING',
      message: 'Firebase plist path not configured',
      remedy: 'Run `dtc setup firebase` to register your iOS app and download GoogleService-Info.plist.',
    }
  }

  try {
    await access(plistPath)
  } catch {
    return {
      name: 'firebase-plist',
      severity: 'critical' as const,
      status: 'MISSING',
      message: `GoogleService-Info.plist not found at configured path`,
      remedy: `Run \`dtc setup firebase\` to re-download the plist, or verify the path in config.`,
    }
  }

  return {
    name: 'firebase-plist',
    severity: 'critical' as const,
    status: 'OK',
    message: 'GoogleService-Info.plist found',
  }
}

// ── probeFirebaseSa ────────────────────────────────────────────────────────
// Optional service account JSON check per RESEARCH §Code Examples.
// Returns as a separate check entry (name: 'firebase-sa').
// Absent → OK severity info (optional field).
// Present but malformed → INVALID warning.
// Present + valid (type/client_email/private_key) → OK warning.

async function probeFirebaseSa(config: DtcConfig | undefined): Promise<CredentialCheck> {
  const saPath = config?.firebase?.serviceAccountKeyPath
  if (!saPath) {
    return {
      name: 'firebase-sa',
      severity: 'info' as const,
      status: 'OK',
      message: 'service account key not configured (optional — only needed for --deep probes)',
    }
  }

  try {
    await access(saPath)
  } catch {
    return {
      name: 'firebase-sa',
      severity: 'warning' as const,
      status: 'MISSING',
      message: 'Firebase service account key file not found at configured path',
      remedy: 'Verify the path in your config or run `dtc setup firebase`.',
    }
  }

  let parsed: unknown
  try {
    const raw = readFileSync(saPath, 'utf-8')
    parsed = JSON.parse(raw)
  } catch {
    return {
      name: 'firebase-sa',
      severity: 'warning' as const,
      status: 'INVALID',
      message: 'Firebase service account key file is not valid JSON',
      remedy: 'Download a fresh service account key from Firebase Console > Project Settings > Service accounts.',
    }
  }

  const sa = parsed as Record<string, unknown>
  if (sa.type !== 'service_account' || !sa.client_email || !sa.private_key) {
    return {
      name: 'firebase-sa',
      severity: 'warning' as const,
      status: 'INVALID',
      message: 'Firebase service account JSON is missing required fields (type, client_email, private_key)',
      remedy: 'Download a fresh service account key from Firebase Console > Project Settings > Service accounts.',
    }
  }

  return {
    name: 'firebase-sa',
    severity: 'warning' as const,
    status: 'OK',
    message: `service account valid (${String(sa.client_email)})`,
  }
}

// ── probeGoogleOauth ───────────────────────────────────────────────────────
// Google Sign In is auto-provisioned via Firebase (D-06) — presence of plist implies
// Google OAuth is available. Severity: warning (not critical — Google Sign In is
// optional for TestFlight v1).

export async function probeGoogleOauth(
  config: DtcConfig | undefined,
  _opts: CredentialCheckOpts,
): Promise<CredentialCheck> {
  const plistPath = config?.firebase?.plistPath
  if (!plistPath) {
    return {
      name: 'google-oauth',
      severity: 'warning' as const,
      status: 'MISSING',
      message: 'Google Sign In requires Firebase plist (configure Firebase first)',
    }
  }

  try {
    await access(plistPath)
    return {
      name: 'google-oauth',
      severity: 'warning' as const,
      status: 'OK',
      message: 'auto-provisioned via Firebase (D-06)',
    }
  } catch {
    return {
      name: 'google-oauth',
      severity: 'warning' as const,
      status: 'MISSING',
      message: 'GoogleService-Info.plist not found — Google Sign In unavailable',
    }
  }
}

// ── probeAppleOauth ────────────────────────────────────────────────────────
// Apple Sign In is opt-in (D-07). If not configured, returns OK severity info.
// When configured, validates the .p8 via probeAscOffline.
// Severity: info when absent; warning when configured but probe fails.
// Never critical — TestFlight v1 does not require Apple Sign In per D-07.

export async function probeAppleOauth(
  config: DtcConfig | undefined,
  _opts: CredentialCheckOpts,
): Promise<CredentialCheck> {
  if (!config?.oauth?.apple) {
    return {
      name: 'apple-oauth',
      severity: 'info' as const,
      status: 'OK',
      message: 'Apple Sign In not configured (optional)',
    }
  }

  const { p8Path, keyId, teamId } = config.oauth.apple

  // Check file exists before probing
  try {
    await access(p8Path)
  } catch {
    return {
      name: 'apple-oauth',
      severity: 'warning' as const,
      status: 'INVALID',
      message: 'Apple Sign In .p8 key file not found at configured path',
      remedy: 'Verify the p8Path in your config or re-run `dtc setup oauth`.',
    }
  }

  // Reuse probeAscOffline — teamId-as-issuer matches Apple Sign In JWT convention
  const result = await probeAscOffline({ keyPath: p8Path, keyId, issuerId: teamId })
  if (result === 'INVALID') {
    return {
      name: 'apple-oauth',
      severity: 'warning' as const,
      status: 'INVALID',
      message: 'Apple Sign In .p8 key is not a valid PKCS#8 EC key',
      remedy: 'Re-download the .p8 from App Store Connect > Certificates, Identifiers & Profiles.',
    }
  }

  return {
    name: 'apple-oauth',
    severity: 'warning' as const,
    status: 'OK',
    message: 'Apple Sign In key valid (offline)',
  }
}

/**
 * Run all credential checks and return a consolidated report.
 * Short-circuits to all-OK in fixture mode (DTC_LLM_MODE=fixture) per RESEARCH Common Pitfall 7.
 * LLM check is first so it's always the first line user sees — matches "fail before LLM spend" UX.
 */
export async function runCredentialChecks(
  config: DtcConfig | undefined,
  opts: CredentialCheckOpts,
): Promise<CredentialReport> {
  if (isFixtureMode()) {
    return {
      checks: [
        {
          name: 'all',
          severity: 'info',
          status: 'OK',
          message: 'fixture mode — all credential checks skipped',
        },
      ],
      hasBlockingFailures: false,
    }
  }

  // LLM first (fail-before-spend), then ASC, then Firebase + SA, then OAuth
  const [llm, asc, firebase, googleOauth, appleOauth, firebaseSa] = await Promise.all([
    probeLlm(config, opts),
    probeAsc(config, opts),
    probeFirebase(config, opts),
    probeGoogleOauth(config, opts),
    probeAppleOauth(config, opts),
    probeFirebaseSa(config),
  ])

  const checks = [llm, asc, firebase, firebaseSa, googleOauth, appleOauth]

  const hasBlockingFailures = checks.some(
    (c) => c.severity === 'critical' && c.status !== 'OK' && !c.transientError,
  )

  return { checks, hasBlockingFailures }
}
