import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertSafeGlobPattern } from '../src/shell-safe.js'
import { E2BRunner } from '../src/e2b-runner.js'
import { RemoteRunner } from '../src/remote-runner.js'

// Phase 04 (SEC-02, T-04-07) — exercises the shared glob-pattern allowlist +
// its wiring into both network runners. Proves legitimate glob patterns pass
// through unchanged AND that injection payloads throw BEFORE any HTTP exec
// call is made (fail-closed — no partial work on the sandbox).

describe('assertSafeGlobPattern (shared helper)', () => {
  describe('accepts legitimate glob patterns unchanged', () => {
    it('returns recursive glob "src/**/*.ts" verbatim', () => {
      expect(assertSafeGlobPattern('src/**/*.ts')).toBe('src/**/*.ts')
    })

    it('returns flat wildcard "Sources/*.swift" verbatim', () => {
      expect(assertSafeGlobPattern('Sources/*.swift')).toBe('Sources/*.swift')
    })

    it('returns brace-expansion + absolute path verbatim', () => {
      const pattern = '/abs/path/{a,b}/*.ts'
      expect(assertSafeGlobPattern(pattern)).toBe(pattern)
    })

    it('returns character-class pattern "[Aa]pp/*.tsx" verbatim', () => {
      const pattern = '[Aa]pp/*.tsx'
      expect(assertSafeGlobPattern(pattern)).toBe(pattern)
    })

    it('returns single-char wildcard "file?.swift" verbatim', () => {
      expect(assertSafeGlobPattern('file?.swift')).toBe('file?.swift')
    })

    it('accepts empty string (edge case)', () => {
      expect(assertSafeGlobPattern('')).toBe('')
    })
  })

  describe('rejects shell-injection payloads', () => {
    it('throws on command separator `;`', () => {
      expect(() => assertSafeGlobPattern('src/*.ts; rm -rf /')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on command substitution `$(…)`', () => {
      expect(() => assertSafeGlobPattern('$(whoami)')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on backtick command substitution', () => {
      expect(() => assertSafeGlobPattern('`evil`')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on pipe `|`', () => {
      expect(() => assertSafeGlobPattern('x | y')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on background `&`', () => {
      expect(() => assertSafeGlobPattern('x & y')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on redirection `>`', () => {
      expect(() => assertSafeGlobPattern('x > /etc/passwd')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on single-quote', () => {
      expect(() => assertSafeGlobPattern("file'name")).toThrow(/Unsafe glob pattern/)
    })

    it('throws on backslash escape (could break out of glob context)', () => {
      expect(() => assertSafeGlobPattern('foo\\;bar')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on embedded newline (multi-command)', () => {
      expect(() => assertSafeGlobPattern('src/*.ts\nrm -rf /')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on embedded space (shell arg-splitting disclosure)', () => {
      // Prevents `foo.ts /etc/passwd` from passing the allowlist and causing
      // `ls -1` to list a second path. Arg splitting, not command injection,
      // but still unintended filesystem disclosure.
      expect(() => assertSafeGlobPattern('foo.ts /etc/passwd')).toThrow(/Unsafe glob pattern/)
    })

    it('throws on embedded tab', () => {
      expect(() => assertSafeGlobPattern('foo.ts\t/etc/passwd')).toThrow(/Unsafe glob pattern/)
    })
  })
})

describe('E2BRunner.glob — injection fail-closed (SEC-02)', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let runner: E2BRunner

  beforeEach(() => {
    mockFetch = vi.fn()
    runner = new E2BRunner({
      sandboxId: 'sbx-test',
      apiKey: 'e2b-key',
      apiUrl: 'https://api.e2b.dev',
      fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
    })
  })

  it('calls exec with the validated pattern on a legitimate glob', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exitCode: 0, stdout: 'a.ts\nb.ts', stderr: '' }),
    })

    const result = await runner.glob('src/*.ts')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.command).toBe('sh')
    expect(body.args).toEqual(['-c', 'ls -1 src/*.ts 2>/dev/null'])
    expect(result).toEqual(['a.ts', 'b.ts'])
  })

  it('throws BEFORE any HTTP call when pattern contains `;`', async () => {
    await expect(runner.glob('src/*.ts; rm -rf /')).rejects.toThrow(/Unsafe glob pattern/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws BEFORE any HTTP call when pattern contains $(…)', async () => {
    await expect(runner.glob('$(whoami)')).rejects.toThrow(/Unsafe glob pattern/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('RemoteRunner.glob — injection fail-closed (SEC-02)', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let runner: RemoteRunner

  beforeEach(() => {
    mockFetch = vi.fn()
    runner = new RemoteRunner({
      runnerUrl: 'https://runner.example.com',
      runnerToken: 'tok',
      fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
    })
  })

  it('calls exec with the validated pattern on a legitimate glob', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exitCode: 0, stdout: 'one.swift\ntwo.swift', stderr: '' }),
    })

    const result = await runner.glob('Sources/*.swift')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [, opts] = mockFetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.command).toBe('sh')
    expect(body.args).toEqual(['-c', 'ls -1 Sources/*.swift 2>/dev/null'])
    expect(result).toEqual(['one.swift', 'two.swift'])
  })

  it('throws BEFORE any HTTP call when pattern contains backtick substitution', async () => {
    await expect(runner.glob('`evil`')).rejects.toThrow(/Unsafe glob pattern/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws BEFORE any HTTP call when pattern contains `|`', async () => {
    await expect(runner.glob('x | y')).rejects.toThrow(/Unsafe glob pattern/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
