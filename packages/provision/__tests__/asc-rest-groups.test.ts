// Phase 5 Plan 03 (TF-04 Wave-0): RED tests for internal beta-group CRUD.
// Validates Q1 resolution (hasAccessToAllBuilds: true) and idempotent find-or-create.
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
  findInternalGroup,
  createInternalGroup,
  findOrCreateInternalGroup,
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

describe('findInternalGroup', () => {
  it('URL contains filter[app], filter[name], filter[isInternalGroup]=true, limit=1', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    await findInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/betaGroups')
    expect(url).toContain('filter%5Bapp%5D=123')
    expect(url).toContain('filter%5Bname%5D=dtc-internal')
    expect(url).toContain('filter%5BisInternalGroup%5D=true')
    expect(url).toContain('limit=1')
  })

  it('returns null for empty data', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    const group = await findInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    expect(group).toBeNull()
  })

  it('returns BetaGroup with id when data is present', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: [
          {
            id: 'group-1',
            type: 'betaGroups',
            attributes: {
              name: 'dtc-internal',
              isInternalGroup: true,
              hasAccessToAllBuilds: true,
            },
          },
        ],
      }),
    )
    const group = await findInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    expect(group?.id).toBe('group-1')
    expect(group?.attributes.isInternalGroup).toBe(true)
  })
})

describe('createInternalGroup — Q1: hasAccessToAllBuilds true', () => {
  it('POST /v1/betaGroups with correct body shape', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: {
          id: 'group-new',
          type: 'betaGroups',
          attributes: {
            name: 'dtc-internal',
            isInternalGroup: true,
            hasAccessToAllBuilds: true,
          },
        },
      }),
    )
    const group = await createInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/betaGroups')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({
      data: {
        type: 'betaGroups',
        attributes: {
          name: 'dtc-internal',
          isInternalGroup: true,
          hasAccessToAllBuilds: true,
        },
        relationships: {
          app: { data: { type: 'apps', id: '123' } },
        },
      },
    })
    expect(group.id).toBe('group-new')
  })
})

describe('findOrCreateInternalGroup — idempotency', () => {
  it('issues POST when GET returns empty', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonRes({ data: [] })) // GET
      .mockResolvedValueOnce(
        jsonRes({
          data: {
            id: 'group-new',
            type: 'betaGroups',
            attributes: {
              name: 'dtc-internal',
              isInternalGroup: true,
              hasAccessToAllBuilds: true,
            },
          },
        }),
      )
    const group = await findOrCreateInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][1].method ?? 'GET').toBe('GET')
    expect(mockFetch.mock.calls[1][1].method).toBe('POST')
    expect(group.id).toBe('group-new')
  })

  it('does NOT issue POST when GET returns an existing group', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: [
          {
            id: 'group-existing',
            type: 'betaGroups',
            attributes: {
              name: 'dtc-internal',
              isInternalGroup: true,
              hasAccessToAllBuilds: true,
            },
          },
        ],
      }),
    )
    const group = await findOrCreateInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method ?? 'GET').toBe('GET')
    expect(group.id).toBe('group-existing')
  })

  it('second run does NOT duplicate: two sequential invocations return existing group without POST', async () => {
    mockFetch.mockResolvedValue(
      jsonRes({
        data: [
          {
            id: 'group-existing',
            type: 'betaGroups',
            attributes: {
              name: 'dtc-internal',
              isInternalGroup: true,
              hasAccessToAllBuilds: true,
            },
          },
        ],
      }),
    )
    await findOrCreateInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    await findOrCreateInternalGroup(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      'dtc-internal',
    )
    // Two invocations → two GETs; no POSTs at all.
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const methods = mockFetch.mock.calls.map(([, opts]) => opts.method ?? 'GET')
    expect(methods.every((m: string) => m === 'GET')).toBe(true)
  })
})
