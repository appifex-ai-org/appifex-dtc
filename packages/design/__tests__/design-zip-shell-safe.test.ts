import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 04 (SEC-02, T-04-05) — contract tests proving `extractDesignZip` invokes
// `unzip` via array-args (execFileSync), never via a shell template string. The
// guarantee of safety is the call shape itself: execFileSync does NOT spawn a
// shell, so caller-controlled `zipPath` / `extractDir` cannot be interpreted as
// shell commands. We assert the shape, not the behaviour.

const execFileSyncMock = vi.fn()

vi.mock('node:child_process', () => ({
  execFileSync: execFileSyncMock,
}))

vi.mock('node:fs', () => ({
  // `existsSync` must return true so the guard clause passes; the rest is stubbed
  // so the post-unzip `readdirSync` walk is a no-op.
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
}))

describe('extractDesignZip — shell-safety contract (SEC-02)', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset()
    execFileSyncMock.mockReturnValue(Buffer.from(''))
  })

  async function loadFn() {
    const mod = await import('../src/design-zip.js')
    return mod.extractDesignZip
  }

  it('calls execFileSync with "unzip" as a literal command (not a shell string)', async () => {
    const extractDesignZip = await loadFn()
    await extractDesignZip('/tmp/plain.zip', '/tmp/out')

    expect(execFileSyncMock).toHaveBeenCalledTimes(1)
    const [cmd] = execFileSyncMock.mock.calls[0]
    expect(cmd).toBe('unzip')
    expect(cmd).not.toContain(' ') // not a shell command string
    expect(cmd).not.toContain('-o')
  })

  it('passes zipPath verbatim as args[2] (no quoting, no concatenation) — plain path', async () => {
    const extractDesignZip = await loadFn()
    const zipPath = '/tmp/plain.zip'

    await extractDesignZip(zipPath, '/tmp/out')

    const [, args] = execFileSyncMock.mock.calls[0]
    expect(Array.isArray(args)).toBe(true)
    expect(args).toEqual(['-o', '-q', zipPath, '-d', '/tmp/out/.design-import'])
    // Raw string — no surrounding quotes, no escaping, no expansion
    expect(args[2]).toBe(zipPath)
  })

  it('passes zipPath with spaces verbatim — NOT wrapped in quotes', async () => {
    const extractDesignZip = await loadFn()
    const zipPath = '/tmp/path with spaces/design.zip'

    await extractDesignZip(zipPath, '/tmp/out dir')

    const [, args] = execFileSyncMock.mock.calls[0]
    expect(args[2]).toBe(zipPath) // spaces preserved literally
    expect(args[4]).toBe('/tmp/out dir/.design-import')
    // The former execSync template would have required manual quoting;
    // execFileSync does not need (or use) quotes at all.
    expect(args[2]).not.toMatch(/^"/)
    expect(args[2]).not.toMatch(/"$/)
  })

  it('passes zipPath containing shell metacharacters as a LITERAL path (not a command)', async () => {
    const extractDesignZip = await loadFn()
    const evilPath = '/tmp/evil;rm -rf /tmp/victim.zip'

    await extractDesignZip(evilPath, '/tmp/out')

    const [cmd, args, opts] = execFileSyncMock.mock.calls[0]
    // The call shape guarantees safety — the `;` never reaches a shell because
    // execFileSync spawns the child with argv, not a /bin/sh -c string.
    expect(cmd).toBe('unzip')
    expect(args[2]).toBe(evilPath)
    // Ensure we are NOT passing a shell-like single-string form anywhere:
    expect(typeof cmd).toBe('string')
    expect(cmd.includes(';')).toBe(false)
    expect(opts).toEqual({ stdio: 'ignore' })
  })

  it('passes zipPath with $(…) substitution as a literal — never interpreted', async () => {
    const extractDesignZip = await loadFn()
    const substitutionPath = '/tmp/$(whoami).zip'

    await extractDesignZip(substitutionPath, '/tmp/out')

    const [, args] = execFileSyncMock.mock.calls[0]
    expect(args[2]).toBe(substitutionPath)
    // The entire string (including the `$(whoami)` fragment) is a literal
    // argument to `unzip`; it will be treated as a filename and almost certainly
    // fail with "file not found" — not as a command substitution.
  })
})
