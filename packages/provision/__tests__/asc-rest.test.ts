// Phase 5 Plan 03 (TF-01 Wave-0): RED tests for the ASC REST client core.
// fetchImpl DI pattern mirrors packages/runner/__tests__/remote-runner.test.ts (repo convention).
// signAscJwt is mocked via vi.mock('@appifex/core', ...) so no real .p8 key is needed.
// Endpoints verified 2026-04-17 against ASC OpenAPI v4.3.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errors as joseErrors } from 'jose'

vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return {
    ...actual,
    signAscJwt: vi.fn().mockResolvedValue('mock.jwt.token'),
  }
})

// Import after vi.mock so the mocked signAscJwt is wired into asc-rest.
import { signAscJwt } from '@appifex/core'
import {
  callAsc,
  getLatestBuild,
  findBuildByVersion,
  getBuildProcessingState,
} from '../src/asc-rest.js'

const mockFetch = vi.fn()
const STUB_CREDS = { keyPath: '/tmp/AuthKey_ABC.p8', keyId: 'ABC123', issuerId: 'iss-1' }

function jsonRes(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: 'STATUS',
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.mocked(signAscJwt).mockReset()
  vi.mocked(signAscJwt).mockResolvedValue('mock.jwt.token')
})

describe('callAsc — GET success', () => {
  it('returns { ok: true } with decoded body and headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/builds')
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.status).toBe(200)
      expect(out.body).toEqual({ data: [] })
    }
  })
})

describe('callAsc — auth errors', () => {
  it('returns AUTH_REJECTED on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(
        { errors: [{ code: 'NOT_AUTHORIZED', detail: 'expired token' }] },
        { status: 401, ok: false },
      ),
    )
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.kind).toBe('AUTH_REJECTED')
      if (out.kind === 'AUTH_REJECTED') {
        expect(out.detail).toBe('expired token')
      }
    }
  })

  it('returns AUTH_REJECTED on 403 (revoked keys can transiently 403 — Q2)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({ errors: [{ code: 'FORBIDDEN', detail: 'revoked' }] }, { status: 403, ok: false }),
    )
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.kind).toBe('AUTH_REJECTED')
    }
  })
})

describe('callAsc — server + other errors', () => {
  it('returns TRANSIENT on 500', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes(
        { errors: [{ code: 'SERVER_ERROR', detail: 'internal' }] },
        { status: 500, ok: false },
      ),
    )
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.kind).toBe('TRANSIENT')
    }
  })

  it('returns OTHER with status on 404', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({ errors: [{ code: 'NOT_FOUND', detail: 'missing' }] }, { status: 404, ok: false }),
    )
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/nonexistent')
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'OTHER') {
      expect(out.status).toBe(404)
    } else {
      throw new Error(`expected OTHER, got ${JSON.stringify(out)}`)
    }
  })
})

describe('callAsc — JWT signing failures', () => {
  it('returns KEY_MISSING when .p8 path does not exist (ENOENT)', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    vi.mocked(signAscJwt).mockRejectedValueOnce(enoent)
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'KEY_MISSING') {
      expect(out.path).toBe(STUB_CREDS.keyPath)
    } else {
      throw new Error(`expected KEY_MISSING, got ${JSON.stringify(out)}`)
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns KEY_INVALID when jose JOSEError is thrown', async () => {
    // JWSInvalid extends JOSEError in jose ^6.
    const joseErr = new joseErrors.JWSInvalid('invalid PKCS8 key')
    vi.mocked(signAscJwt).mockRejectedValueOnce(joseErr)
    const out = await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    expect(out.ok).toBe(false)
    if (!out.ok && out.kind === 'KEY_INVALID') {
      expect(typeof out.detail).toBe('string')
      expect(out.detail.length).toBeGreaterThan(0)
    } else {
      throw new Error(`expected KEY_INVALID, got ${JSON.stringify(out)}`)
    }
  })
})

describe('callAsc — JWT per request (no caching)', () => {
  it('passes Authorization: Bearer <jwt> on every call', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer mock.jwt.token')
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('calls signAscJwt twice when callAsc is invoked twice (no JWT cache)', async () => {
    mockFetch.mockResolvedValue(jsonRes({ data: [] }))
    await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    await callAsc({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'GET', '/v1/apps')
    expect(vi.mocked(signAscJwt)).toHaveBeenCalledTimes(2)
  })
})

describe('getLatestBuild', () => {
  it('queries /v1/builds with filter[app], sort=-uploadedDate, limit=1, fields[builds]', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: [
          {
            id: 'b1',
            type: 'builds',
            attributes: {
              version: '42',
              uploadedDate: '2026-04-17T00:00:00Z',
              processingState: 'VALID',
              expired: false,
            },
          },
        ],
      }),
    )
    const build = await getLatestBuild({ creds: STUB_CREDS, fetchImpl: mockFetch }, '123456789')
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/builds')
    expect(url).toContain('filter%5Bapp%5D=123456789')
    expect(url).toContain('sort=-uploadedDate')
    expect(url).toContain('limit=1')
    expect(url).toContain('fields%5Bbuilds%5D=version')
    expect(opts.headers['Authorization']).toBe('Bearer mock.jwt.token')
    expect(build?.attributes.version).toBe('42')
  })

  it('returns null when data is empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    const build = await getLatestBuild({ creds: STUB_CREDS, fetchImpl: mockFetch }, '123')
    expect(build).toBeNull()
  })
})

describe('findBuildByVersion', () => {
  it('URL contains filter[version]=<build number>', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: [
          {
            id: 'b47',
            type: 'builds',
            attributes: {
              version: '47',
              uploadedDate: '2026-04-17T00:00:00Z',
              processingState: 'VALID',
              expired: false,
            },
          },
        ],
      }),
    )
    const build = await findBuildByVersion({ creds: STUB_CREDS, fetchImpl: mockFetch }, '123', '47')
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('filter%5Bversion%5D=47')
    expect(build?.attributes.version).toBe('47')
  })

  it('returns null when data is empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    const build = await findBuildByVersion({ creds: STUB_CREDS, fetchImpl: mockFetch }, '123', '99')
    expect(build).toBeNull()
  })
})

describe('getBuildProcessingState', () => {
  it('URL is /v1/builds/{id}?fields[builds]=processingState and returns state', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: {
          id: 'b1',
          type: 'builds',
          attributes: { processingState: 'PROCESSING' },
        },
      }),
    )
    const state = await getBuildProcessingState({ creds: STUB_CREDS, fetchImpl: mockFetch }, 'b1')
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/builds/b1')
    expect(url).toContain('fields%5Bbuilds%5D=processingState')
    expect(state).toBe('PROCESSING')
  })
})
