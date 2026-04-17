// Phase 5 Plan 03 (TF-03 Wave-0): RED tests for computeNextBuildNumber + findBuildByVersion
// and the isDuplicateVersionError helper that classifies ITMS-90189 / ITMS-90478 / ASC dup codes.
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
  computeNextBuildNumber,
  findBuildByVersion,
  isDuplicateVersionError,
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

describe('computeNextBuildNumber', () => {
  it('returns "1" when getLatestBuild returns null', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    const next = await computeNextBuildNumber(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
    )
    expect(next).toBe('1')
  })

  it('returns "43" when latest version is "42"', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: [
          {
            id: 'b42',
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
    const next = await computeNextBuildNumber(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
    )
    expect(next).toBe('43')
  })

  it('throws when latest version is non-numeric (message contains "not numeric")', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonRes({
        data: [
          {
            id: 'bX',
            type: 'builds',
            attributes: {
              version: 'abc',
              uploadedDate: '2026-04-17T00:00:00Z',
              processingState: 'VALID',
              expired: false,
            },
          },
        ],
      }),
    )
    await expect(
      computeNextBuildNumber({ creds: STUB_CREDS, fetchImpl: mockFetch }, '123'),
    ).rejects.toThrow(/not numeric/i)
  })
})

describe('findBuildByVersion', () => {
  it('returns the build when data has one entry', async () => {
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
    const build = await findBuildByVersion(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      '47',
    )
    expect(build?.id).toBe('b47')
  })

  it('returns null when data is empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes({ data: [] }))
    const build = await findBuildByVersion(
      { creds: STUB_CREDS, fetchImpl: mockFetch },
      '123',
      '99',
    )
    expect(build).toBeNull()
  })
})

describe('isDuplicateVersionError', () => {
  it('recognises ITMS-90189 as duplicate', () => {
    expect(isDuplicateVersionError('ITMS-90189')).toBe(true)
  })

  it('recognises ITMS-90478 as duplicate', () => {
    expect(isDuplicateVersionError('ITMS-90478')).toBe(true)
  })

  it('recognises ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE as duplicate', () => {
    expect(isDuplicateVersionError('ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE')).toBe(true)
  })

  it('rejects unrelated codes like ITMS-90683', () => {
    expect(isDuplicateVersionError('ITMS-90683')).toBe(false)
  })

  it('rejects null input safely', () => {
    expect(isDuplicateVersionError(null)).toBe(false)
  })
})
