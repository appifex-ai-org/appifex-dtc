// Phase 5 Plan 05 (TF-01, Pitfall 4, Pitfall 7/Q3, Pitfall 8): Wave-0 RED tests for altool
// subprocess driver. Tests lock in the canonical 2026 hyphenated flag set, the
// ~/.appstoreconnect/private_keys symlink preparation, and the 3-tier parseAltoolOutput
// detection chain (JSON product-errors → ITMS regex → ContentDelivery regex).
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock node:fs/promises for symlink testing. vi.mock is hoisted above this file's
// top-level statements, so the mock factory cannot reference local consts. Use
// vi.hoisted so the mock registry is created together with the hoisted vi.mock call.
const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  symlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('node:fs/promises', () => fsMocks)

import { uploadIpa, parseAltoolOutput, ensureKeyAtStandardPath } from '../src/altool.js'
import type { Runner } from '@appifex/core'

beforeEach(() => {
  fsMocks.mkdir.mockClear()
  fsMocks.symlink.mockClear()
  fsMocks.stat.mockReset()
  fsMocks.unlink.mockClear()
})

function makeRunner(execResult: { exitCode: number; stdout: string; stderr: string }) {
  const execCalls: Array<{ cmd: string; args: string[]; opts?: unknown }> = []
  return {
    _execCalls: execCalls,
    exec: vi.fn(async (cmd: string, args: string[], opts?: unknown) => {
      execCalls.push({ cmd, args, opts })
      return execResult
    }),
    readFile: async () => '',
    writeFile: async () => {},
    exists: async () => false,
    glob: async () => [],
  } as unknown as Runner & {
    _execCalls: Array<{ cmd: string; args: string[]; opts?: unknown }>
    exec: ReturnType<typeof vi.fn>
  }
}

const STANDARD_ARGS = {
  ipaPath: '/tmp/App.ipa',
  ascAppId: '123456789',
  bundleId: 'com.example.App',
  buildNumber: '47',
  marketingVersion: '1.0.3',
  keyId: 'KEY1',
  issuerId: 'ISS1',
  keyPath: '/user/keys/AuthKey_KEY1.p8',
}

describe('uploadIpa — canonical altool flag set (Pitfall 8)', () => {
  it('invokes xcrun altool with --upload-package and all canonical flags', async () => {
    fsMocks.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const runner = makeRunner({ exitCode: 0, stdout: '{"tool-version":"4.11.1"}', stderr: '' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadIpa({ runner, ...STANDARD_ARGS } as any)

    expect(runner.exec).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [cmd, args] = (runner.exec as any).mock.calls[0]
    expect(cmd).toBe('xcrun')
    expect(args).toContain('altool')
    expect(args).toContain('--upload-package')
    expect(args).toContain('/tmp/App.ipa')
    expect(args).toContain('--type')
    expect(args).toContain('ios')
    expect(args).toContain('--apple-id')
    expect(args).toContain('123456789')
    expect(args).toContain('--bundle-id')
    expect(args).toContain('com.example.App')
    expect(args).toContain('--bundle-version')
    expect(args).toContain('47')
    expect(args).toContain('--bundle-short-version-string')
    expect(args).toContain('1.0.3')
    expect(args).toContain('--api-key')
    expect(args).toContain('KEY1')
    expect(args).toContain('--api-issuer')
    expect(args).toContain('ISS1')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
  })

  it('does NOT use deprecated --upload-app or camelCase flags', async () => {
    fsMocks.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const runner = makeRunner({ exitCode: 0, stdout: '{}', stderr: '' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await uploadIpa({ runner, ...STANDARD_ARGS } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, args] = (runner.exec as any).mock.calls[0]
    expect(args).not.toContain('--upload-app')
    expect(args).not.toContain('--apiKey')
    expect(args).not.toContain('--apiIssuer')
    expect(args).not.toContain('--appleId')
  })
})

describe('ensureKeyAtStandardPath (Pitfall 4)', () => {
  it('creates symlink at ~/.appstoreconnect/private_keys/AuthKey_{keyId}.p8 when absent', async () => {
    fsMocks.stat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    await ensureKeyAtStandardPath('/user/keys/AuthKey_KEY1.p8', 'KEY1')
    expect(fsMocks.mkdir).toHaveBeenCalled()
    const mkdirCall = fsMocks.mkdir.mock.calls[0]
    expect(mkdirCall[0] as string).toContain('.appstoreconnect/private_keys')
    expect(fsMocks.symlink).toHaveBeenCalled()
    const symlinkCall = fsMocks.symlink.mock.calls[0]
    expect(symlinkCall[0]).toBe('/user/keys/AuthKey_KEY1.p8')
    expect(symlinkCall[1] as string).toContain('AuthKey_KEY1.p8')
  })

  it('is idempotent when the standard-path file already exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fsMocks.stat.mockResolvedValue({ isFile: () => true, isSymbolicLink: () => true } as any)
    await ensureKeyAtStandardPath('/user/keys/AuthKey_KEY1.p8', 'KEY1')
    // symlink must NOT be called when stat succeeds
    expect(fsMocks.symlink).not.toHaveBeenCalled()
  })
})

describe('parseAltoolOutput — 3-tier detection (Pitfall 7 / Q3)', () => {
  it('returns success=true on empty product-errors + exit 0', () => {
    const result = parseAltoolOutput('{"tool-version":"4.11.1","product-errors":[]}', '', 0)
    expect(result.success).toBe(true)
  })

  it('returns success=true when JSON has no product-errors key at all', () => {
    const result = parseAltoolOutput('{"tool-version":"4.11.1","tool-path":"/x"}', '', 0)
    expect(result.success).toBe(true)
  })

  it('returns success=false when JSON has product-errors with ITMS in message', () => {
    const stdout = JSON.stringify({
      'tool-version': '4.11.1',
      'product-errors': [{ message: 'ERROR ITMS-90189: Redundant Binary Upload', code: -1011 }],
    })
    const result = parseAltoolOutput(stdout, '', 1)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0].itmsCode).toBe('ITMS-90189')
    }
  })

  it('falls back to ITMS regex when JSON parse fails (Xcode 26 case)', () => {
    const stdout = 'Some non-json content\nERROR ITMS-90478: Bundle version must be higher than...'
    const result = parseAltoolOutput(stdout, '', 0)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0].itmsCode).toBe('ITMS-90478')
    }
  })

  it('Xcode 26 silent failure: exit 0 but ContentDelivery error in stderr → success=false', () => {
    const stdout = '{"tool-version":"4.11.1"}\nSuccessfully uploaded'
    const stderr = 'ERROR: [ContentDelivery.Uploader.102BA2C00] duplicate bundle version'
    const result = parseAltoolOutput(stdout, stderr, 0) // exit 0 — the bug
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors[0].message).toContain('ContentDelivery')
    }
  })

  it('returns success=false on non-zero exit with no parseable error', () => {
    const result = parseAltoolOutput('', 'generic failure', 1)
    expect(result.success).toBe(false)
  })
})

describe('isDuplicateVersionError classifier (D-09)', () => {
  it('matches ITMS-90189, ITMS-90478, and ENTITY_ERROR duplicate', async () => {
    // Re-exported from asc-rest for convenience — pull the helper from asc-rest.js.
    const { isDuplicateVersionError } = await import('../src/asc-rest.js')
    expect(isDuplicateVersionError('ITMS-90189')).toBe(true)
    expect(isDuplicateVersionError('ITMS-90478')).toBe(true)
    expect(isDuplicateVersionError('ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE')).toBe(true)
    expect(isDuplicateVersionError('ITMS-90683')).toBe(false)
    expect(isDuplicateVersionError(null)).toBe(false)
  })
})
