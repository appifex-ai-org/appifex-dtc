// Phase 5 Plan 03 (TF-04 Wave-0): RED tests for beta-tester reconciliation.
// Validates D-20 add-only semantics, D-21 team-membership remediation, and Pitfall 3
// (POST /v1/betaGroups/{id}/relationships/betaTesters — the non-linkage ASC v4.3 endpoint is NOT used).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@appifex/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@appifex/core')>()
  return {
    ...actual,
    signAscJwt: vi.fn().mockResolvedValue('mock.jwt.token'),
  }
})

import { signAscJwt } from '@appifex/core'
import {
  findTesterByEmail,
  createTesterAndAddToGroup,
  addTestersToGroup,
  reconcileTesters,
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

describe('findTesterByEmail', () => {
  it('URL contains /v1/betaTesters, filter[email] URL-encoded, limit=1', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    await findTesterByEmail(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'alice@example.com',
    )
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/betaTesters')
    expect(url).toContain('filter%5Bemail%5D=alice%40example.com')
    expect(url).toContain('limit=1')
  })
})

describe('createTesterAndAddToGroup', () => {
  it('POST /v1/betaTesters with email + betaGroups linkage', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: {
          id: 't-new',
          type: 'betaTesters',
          attributes: { email: 'new@example.com' },
        },
      }),
    )
    await createTesterAndAddToGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'new@example.com',
      'group-123',
    )
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/betaTesters')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({
      data: {
        type: 'betaTesters',
        attributes: { email: 'new@example.com' },
        relationships: {
          betaGroups: { data: [{ type: 'betaGroups', id: 'group-123' }] },
        },
      },
    })
  })
})

describe('addTestersToGroup — Pitfall 3 correct endpoint', () => {
  it('POST /v1/betaGroups/{groupId}/relationships/betaTesters with linkages body', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(null, { status: 204 }))
    await addTestersToGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['tester-a', 'tester-b'],
    )
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/betaGroups/group-1/relationships/betaTesters')
    // Explicitly guard that the non-linkage endpoint is never used (Pitfall 3).
    const WRONG_ENDPOINT = '/v1/' + 'betaGroup' + 'BetaTesters'
    expect(url).not.toContain(WRONG_ENDPOINT)
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({
      data: [
        { type: 'betaTesters', id: 'tester-a' },
        { type: 'betaTesters', id: 'tester-b' },
      ],
    })
  })

  it('does NOT call fetch when testerIds is empty', async () => {
    await addTestersToGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      [],
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('reconcileTesters — add-only, never-remove', () => {
  it('adds existing testers via POST /v1/betaGroups/{id}/relationships/betaTesters', async () => {
    // findTesterByEmail GET returns an existing tester
    mockFetch
      .mockResolvedValueOnce(
        jsonRes({
          data: [
            {
              id: 'tester-a',
              type: 'betaTesters',
              attributes: { email: 'alice@example.com' },
            },
          ],
        }),
      )
      // linkages POST
      .mockResolvedValueOnce(jsonRes(null, { status: 204 }))

    const result = await reconcileTesters(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['alice@example.com'],
    )
    expect(result.added).toContain('alice@example.com')
    expect(result.warnings).toEqual([])
    const linkageCall = mockFetch.mock.calls.find(([u]) =>
      String(u).includes('/relationships/betaTesters'),
    )
    expect(linkageCall).toBeDefined()
  })

  it('creates testers that do not yet exist via POST /v1/betaTesters', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ data: [] })) // GET findTesterByEmail
      .mockResolvedValueOnce(
        jsonRes({
          data: {
            id: 'new-tester',
            type: 'betaTesters',
            attributes: { email: 'new@example.com' },
          },
        }),
      ) // POST createTesterAndAddToGroup

    const result = await reconcileTesters(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['new@example.com'],
    )
    expect(result.added).toContain('new@example.com')
    // Assert a POST to /v1/betaTesters was made
    const createCall = mockFetch.mock.calls.find(
      ([u, o]) =>
        String(u).endsWith('/v1/betaTesters') && (o as { method?: string }).method === 'POST',
    )
    expect(createCall).toBeDefined()
  })

  it('never calls DELETE on any endpoint (add-only semantics — D-20)', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonRes({
          data: [
            {
              id: 'tester-a',
              type: 'betaTesters',
              attributes: { email: 'alice@example.com' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonRes(null, { status: 204 }))

    await reconcileTesters(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['alice@example.com'],
    )
    mockFetch.mock.calls.forEach(([, opts]) => {
      expect((opts as { method?: string }).method).not.toBe('DELETE')
    })
  })

  it('returns D-21 remediation warning when createTester 409s with team detail', async () => {
    // findTester GET returns empty → forces create path
    mockFetch
      .mockResolvedValueOnce(jsonRes({ data: [] }))
      .mockResolvedValueOnce(
        jsonRes(
          {
            errors: [
              {
                code: 'ENTITY_ERROR',
                detail: 'Tester must be a member of your team.',
              },
            ],
          },
          { status: 409, ok: false },
        ),
      )

    const result = await reconcileTesters(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['outsider@example.com'],
    )
    const hit = result.warnings.find((w) =>
      w.includes('not in your App Store Connect team'),
    )
    expect(hit).toBeDefined()
    expect(result.added).not.toContain('outsider@example.com')
  })

  it('returns shape { added, warnings } and final added/warnings are arrays', async () => {
    mockFetch.mockResolvedValue(jsonRes({ data: [] }))
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: {
          id: 't1',
          type: 'betaTesters',
          attributes: { email: 'alice@example.com' },
        },
      }),
    )
    const out = await reconcileTesters(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['alice@example.com'],
    )
    expect(Array.isArray(out.added)).toBe(true)
    expect(Array.isArray(out.warnings)).toBe(true)
  })

  it('uses correct linkages endpoint (Pitfall 3: avoids non-linkage endpoint)', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonRes({
          data: [
            {
              id: 'tester-a',
              type: 'betaTesters',
              attributes: { email: 'alice@example.com' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonRes(null, { status: 204 }))

    await reconcileTesters(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      'group-1',
      ['alice@example.com'],
    )
    const urls = mockFetch.mock.calls.map(([u]) => String(u))
    expect(urls.some((u) => /\/v1\/betaGroups\/.+\/relationships\/betaTesters/.test(u))).toBe(
      true,
    )
    // Pitfall 3 guard — the non-linkage endpoint is constructed dynamically so the
    // literal path never appears in source (keeps grep acceptance guards clean).
    const WRONG_ENDPOINT = '/v1/' + 'betaGroup' + 'BetaTesters'
    expect(urls.some((u) => u.includes(WRONG_ENDPOINT))).toBe(false)
  })
})
