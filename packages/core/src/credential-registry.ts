// Phase 03 Plan 01 (SETUP-02, D-03/D-04/D-05): CredentialRegistry contract.
// Probe bodies filled in by Plan 03-02.
import type { DtcConfig } from './types.js'
import { isFixtureMode } from './llm-fixture.js'
import { probeAscOffline } from './asc-jwt.js'

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

// ── Individual probe stubs ──
// Each returns MISSING with a remedy when the config field is absent,
// and OK with transientError:true when the field is present.
// Plan 03-02 replaces these with real probe implementations.

export async function probeLlm(config: DtcConfig | undefined): Promise<CredentialCheck> {
  const key = config?.llm?.apiKey
  if (!key) {
    return {
      name: 'llm-api-key',
      severity: 'critical',
      status: 'MISSING',
      message: 'LLM API key is not configured',
      remedy: 'Run `dtc setup` and enter your LLM API key, or set llm.apiKey in ~/.dtc/config.json',
    }
  }
  return {
    name: 'llm-api-key',
    severity: 'critical',
    status: 'OK',
    message: 'skeleton — implemented in plan 03-02',
    transientError: true,
  }
}

export async function probeAsc(config: DtcConfig | undefined): Promise<CredentialCheck> {
  const keyPath = config?.apple?.ascKeyPath
  if (!keyPath) {
    return {
      name: 'asc-key',
      severity: 'critical',
      status: 'MISSING',
      message: 'ASC .p8 key path is not configured',
      remedy: 'Run `dtc setup apple` and enter your App Store Connect key path',
    }
  }
  const keyId = config?.apple?.ascKeyId ?? ''
  const issuerId = config?.apple?.ascIssuerId ?? ''
  const result = await probeAscOffline({ keyPath, keyId, issuerId })
  if (result === 'INVALID') {
    return {
      name: 'asc-key',
      severity: 'critical',
      status: 'INVALID',
      message: 'ASC .p8 key file is invalid or not a valid PKCS#8 EC key',
      remedy: 'Verify the key file at the configured ascKeyPath is the correct .p8 from App Store Connect',
    }
  }
  return {
    name: 'asc-key',
    severity: 'critical',
    status: 'OK',
    message: 'skeleton — implemented in plan 03-02',
    transientError: true,
  }
}

export async function probeFirebase(config: DtcConfig | undefined): Promise<CredentialCheck> {
  if (!config?.firebase) {
    return {
      name: 'firebase',
      severity: 'critical',
      status: 'MISSING',
      message: 'Firebase configuration is not set up',
      remedy: 'Run `dtc setup firebase` to create a Firebase project and register your iOS app',
    }
  }
  return {
    name: 'firebase',
    severity: 'critical',
    status: 'OK',
    message: 'skeleton — implemented in plan 03-02',
    transientError: true,
  }
}

export async function probeGoogleOauth(_config: DtcConfig | undefined): Promise<CredentialCheck> {
  // Google OAuth is auto-provisioned via Firebase (D-06) — no separate wizard step.
  return {
    name: 'google-oauth',
    severity: 'info',
    status: 'OK',
    message: 'skeleton — implemented in plan 03-02',
    transientError: true,
  }
}

export async function probeAppleOauth(config: DtcConfig | undefined): Promise<CredentialCheck> {
  // Apple OAuth is opt-in (D-07). If not configured, it's info-only (not critical for v1).
  if (!config?.oauth?.apple) {
    return {
      name: 'apple-oauth',
      severity: 'info',
      status: 'OK',
      message: 'Apple Sign In not configured (optional for v1 TestFlight)',
    }
  }
  return {
    name: 'apple-oauth',
    severity: 'warning',
    status: 'OK',
    message: 'skeleton — implemented in plan 03-02',
    transientError: true,
  }
}

/**
 * Run all credential checks and return a consolidated report.
 * Short-circuits to all-OK in fixture mode (DTC_LLM_MODE=fixture) per RESEARCH Common Pitfall 7.
 */
export async function runCredentialChecks(
  config: DtcConfig | undefined,
  _opts: CredentialCheckOpts,
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

  const checks = await Promise.all([
    probeLlm(config),
    probeAsc(config),
    probeFirebase(config),
    probeGoogleOauth(config),
    probeAppleOauth(config),
  ])

  const hasBlockingFailures = checks.some(
    (c) => c.severity === 'critical' && c.status !== 'OK' && !c.transientError,
  )

  return { checks, hasBlockingFailures }
}
