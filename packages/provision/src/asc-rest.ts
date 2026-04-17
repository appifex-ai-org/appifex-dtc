// Phase 5 (TF-01, TF-04): App Store Connect REST client.
// Replaces the community `asc` CLI subprocess in packages/provision/src/asc-client.ts
// (Plan 06 will delete that file).  JWT is minted FRESH per request via signAscJwt()
// (19m expiry, ~5ms sign cost — never cached).  fetchImpl is dependency-injected for
// testing (see packages/runner/src/remote-runner.ts precedent for the repo pattern).
// Endpoints verified 2026-04-17 against ASC OpenAPI v4.3.

import { signAscJwt, TestFlightError } from '@appifex/core'
import type { AscJwtArgs } from '@appifex/core'
import { errors as joseErrors } from 'jose'

type FetchFn = typeof globalThis.fetch

const BASE = 'https://api.appstoreconnect.apple.com'

export interface AscRestOpts {
  creds: AscJwtArgs
  fetchImpl?: FetchFn
}

// Phase 5 (D-05, Pitfall 7/Q2): discriminated-union outcome. Callers decide whether to
// throw or soft-fail based on `kind`. The client itself never throws on HTTP errors —
// it maps them to a typed outcome so the phase handler can shape the user-facing message.
export type AscCallOutcome =
  | { ok: true; status: number; body: unknown; headers: Headers }
  | { ok: false; kind: 'KEY_MISSING'; path: string }
  | { ok: false; kind: 'KEY_INVALID'; detail: string }
  | { ok: false; kind: 'AUTH_REJECTED'; detail: string }
  | { ok: false; kind: 'TRANSIENT'; detail: string }
  | { ok: false; kind: 'OTHER'; status: number; detail: string }

export async function callAsc(
  opts: AscRestOpts,
  method: string,
  path: string,
  body?: unknown,
): Promise<AscCallOutcome> {
  // Step 1: sign JWT — may throw if .p8 is gone (ENOENT) or garbled (jose error).
  let jwt: string
  try {
    jwt = await signAscJwt(opts.creds)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e && e.code === 'ENOENT') {
      return { ok: false, kind: 'KEY_MISSING', path: opts.creds.keyPath }
    }
    if (err instanceof joseErrors.JOSEError) {
      return {
        ok: false,
        kind: 'KEY_INVALID',
        detail: (err as { code?: string }).code ?? (err as Error).message,
      }
    }
    throw err
  }

  // Step 2: HTTP round-trip.
  const fetchFn = opts.fetchImpl ?? globalThis.fetch
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const res = await fetchFn(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })

  if (res.ok) {
    const json = res.status === 204 ? null : await res.json()
    return { ok: true, status: res.status, body: json, headers: res.headers }
  }

  // Extract `detail` from the first error object if the body is JSON-shaped per ASC.
  let detail = res.statusText
  try {
    const errBody = (await res.json()) as { errors?: Array<{ code: string; detail: string }> }
    if (errBody.errors?.[0]) detail = errBody.errors[0].detail
  } catch {
    /* non-JSON body — keep statusText */
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: 'AUTH_REJECTED', detail }
  }
  if (res.status >= 500) {
    return { ok: false, kind: 'TRANSIENT', detail }
  }
  return { ok: false, kind: 'OTHER', status: res.status, detail }
}

// ── Build queries (D-06, D-16) ────────────────────────────────────────────

export interface Build {
  id: string
  type: 'builds'
  attributes: {
    version: string
    uploadedDate: string
    processingState: 'PROCESSING' | 'FAILED' | 'INVALID' | 'VALID'
    expired: boolean
  }
}

export async function getLatestBuild(
  opts: AscRestOpts,
  ascAppId: string,
): Promise<Build | null> {
  const qs = new URLSearchParams({
    'filter[app]': ascAppId,
    sort: '-uploadedDate',
    limit: '1',
    'fields[builds]': 'version,uploadedDate,processingState,expired',
  })
  const r = await callAsc(opts, 'GET', `/v1/builds?${qs.toString()}`)
  if (!r.ok) throw new TestFlightError(`getLatestBuild failed: ${JSON.stringify(r)}`)
  const data = (r.body as { data: Build[] }).data
  return data[0] ?? null
}

export async function computeNextBuildNumber(
  opts: AscRestOpts,
  ascAppId: string,
): Promise<string> {
  const latest = await getLatestBuild(opts, ascAppId)
  if (!latest) return '1'
  const current = parseInt(latest.attributes.version, 10)
  if (isNaN(current)) {
    throw new TestFlightError(
      `ASC build version is not numeric: ${latest.attributes.version}`,
    )
  }
  return String(current + 1)
}

export async function findBuildByVersion(
  opts: AscRestOpts,
  ascAppId: string,
  version: string,
): Promise<Build | null> {
  const qs = new URLSearchParams({
    'filter[app]': ascAppId,
    'filter[version]': version,
    limit: '1',
  })
  const r = await callAsc(opts, 'GET', `/v1/builds?${qs.toString()}`)
  if (!r.ok) throw new TestFlightError(`findBuildByVersion failed: ${JSON.stringify(r)}`)
  return (r.body as { data: Build[] }).data[0] ?? null
}

export async function getBuildProcessingState(
  opts: AscRestOpts,
  buildId: string,
): Promise<'PROCESSING' | 'VALID' | 'INVALID' | 'FAILED'> {
  const qs = new URLSearchParams({ 'fields[builds]': 'processingState' })
  const r = await callAsc(opts, 'GET', `/v1/builds/${buildId}?${qs.toString()}`)
  if (!r.ok) throw new TestFlightError(`getBuildProcessingState failed: ${JSON.stringify(r)}`)
  const state = (r.body as { data: { attributes: { processingState: string } } }).data
    .attributes.processingState
  return state as 'PROCESSING' | 'VALID' | 'INVALID' | 'FAILED'
}

export function isDuplicateVersionError(code: string | null): boolean {
  if (!code) return false
  return /^ITMS-(90189|90478)$|^ENTITY_ERROR\.ATTRIBUTE\.INVALID\.DUPLICATE$/.test(code)
}

// ── Beta Groups (D-19, Q1) ────────────────────────────────────────────────

export interface BetaGroup {
  id: string
  type: 'betaGroups'
  attributes: {
    name: string
    isInternalGroup: boolean
    hasAccessToAllBuilds?: boolean
  }
}

export async function findInternalGroup(
  opts: AscRestOpts,
  ascAppId: string,
  groupName: string,
): Promise<BetaGroup | null> {
  const qs = new URLSearchParams({
    'filter[app]': ascAppId,
    'filter[name]': groupName,
    'filter[isInternalGroup]': 'true',
    limit: '1',
  })
  const r = await callAsc(opts, 'GET', `/v1/betaGroups?${qs.toString()}`)
  if (!r.ok) throw new TestFlightError(`findInternalGroup failed: ${JSON.stringify(r)}`)
  return (r.body as { data: BetaGroup[] }).data[0] ?? null
}

export async function createInternalGroup(
  opts: AscRestOpts,
  ascAppId: string,
  groupName: string,
): Promise<BetaGroup> {
  // Phase 5 (TF-04 Q1): hasAccessToAllBuilds=true mirrors fastlane convention and
  // OpenAPI v4.3 semantics. Retroactive: applies to past and future builds, saving
  // an explicit assign call after upload.
  const r = await callAsc(opts, 'POST', '/v1/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: {
        name: groupName,
        isInternalGroup: true,
        hasAccessToAllBuilds: true,
      },
      relationships: {
        app: { data: { type: 'apps', id: ascAppId } },
      },
    },
  })
  if (!r.ok) throw new TestFlightError(`createInternalGroup failed: ${JSON.stringify(r)}`)
  return (r.body as { data: BetaGroup }).data
}

export async function findOrCreateInternalGroup(
  opts: AscRestOpts,
  ascAppId: string,
  groupName: string,
): Promise<BetaGroup> {
  const existing = await findInternalGroup(opts, ascAppId, groupName)
  if (existing) return existing
  return createInternalGroup(opts, ascAppId, groupName)
}

// ── Beta Testers (D-20, D-21, Pitfall 3) ──────────────────────────────────

export interface BetaTester {
  id: string
  type: 'betaTesters'
  attributes: { email: string }
}

export async function findTesterByEmail(
  opts: AscRestOpts,
  email: string,
): Promise<BetaTester | null> {
  const qs = new URLSearchParams({ 'filter[email]': email, limit: '1' })
  const r = await callAsc(opts, 'GET', `/v1/betaTesters?${qs.toString()}`)
  if (!r.ok) throw new TestFlightError(`findTesterByEmail failed: ${JSON.stringify(r)}`)
  return (r.body as { data: BetaTester[] }).data[0] ?? null
}

export async function createTesterAndAddToGroup(
  opts: AscRestOpts,
  email: string,
  groupId: string,
): Promise<BetaTester> {
  const r = await callAsc(opts, 'POST', '/v1/betaTesters', {
    data: {
      type: 'betaTesters',
      attributes: { email },
      relationships: {
        betaGroups: { data: [{ type: 'betaGroups', id: groupId }] },
      },
    },
  })
  if (!r.ok) {
    // Phase 5 (D-21): attach the outcome shape to the error so reconcileTesters can
    // inspect status + detail and emit the team-membership remediation message.
    throw Object.assign(new Error(`createTesterAndAddToGroup failed`), r)
  }
  return (r.body as { data: BetaTester }).data
}

/**
 * Phase 5 (Pitfall 3 CORRECTS D-20): uses POST /v1/betaGroups/{id}/relationships/betaTesters
 * with a linkages-shaped body. The non-linkage endpoint DOES NOT EXIST in ASC v4.3.
 */
export async function addTestersToGroup(
  opts: AscRestOpts,
  groupId: string,
  testerIds: string[],
): Promise<void> {
  if (testerIds.length === 0) return
  const r = await callAsc(
    opts,
    'POST',
    `/v1/betaGroups/${groupId}/relationships/betaTesters`,
    {
      data: testerIds.map((id) => ({ type: 'betaTesters', id })),
    },
  )
  if (!r.ok) throw new TestFlightError(`addTestersToGroup failed: ${JSON.stringify(r)}`)
}

/**
 * Phase 5 (D-20): add-only reconciliation. Never removes existing testers (preserves
 * manual ASC UI additions). Returns { added, warnings } — warnings include the D-21
 * team-membership remediation for testers who aren't on the ASC team.
 */
export async function reconcileTesters(
  opts: AscRestOpts,
  groupId: string,
  emails: string[],
): Promise<{ added: string[]; warnings: string[] }> {
  const warnings: string[] = []
  const added: string[] = []
  const toAdd: string[] = []

  for (const email of emails) {
    const existing = await findTesterByEmail(opts, email)
    if (existing) {
      toAdd.push(existing.id)
      added.push(email)
    } else {
      try {
        await createTesterAndAddToGroup(opts, email, groupId)
        added.push(email)
      } catch (err) {
        const outcome = err as { kind?: string; status?: number; detail?: string }
        if (outcome.status === 409 && outcome.detail && /team/i.test(outcome.detail)) {
          warnings.push(
            `Tester ${email} is not in your App Store Connect team. Add them at ` +
              `https://appstoreconnect.apple.com/access/users first.`,
          )
          continue
        }
        throw err
      }
    }
    // Phase 5 (Pitfall 9): 100ms inter-request delay keeps tester-reconciliation well
    // below the undocumented ~300/min ASC rate cap.
    await new Promise((r) => setTimeout(r, 100))
  }

  if (toAdd.length > 0) {
    await addTestersToGroup(opts, groupId, toAdd)
  }
  return { added, warnings }
}

// ── Build-to-group assignment (belt-and-braces when hasAccessToAllBuilds was NOT set) ──

export async function assignBuildToGroups(
  opts: AscRestOpts,
  buildId: string,
  groupIds: string[],
): Promise<void> {
  if (groupIds.length === 0) return
  const r = await callAsc(opts, 'POST', `/v1/builds/${buildId}/relationships/betaGroups`, {
    data: groupIds.map((id) => ({ type: 'betaGroups', id })),
  })
  if (!r.ok) throw new TestFlightError(`assignBuildToGroups failed: ${JSON.stringify(r)}`)
}
