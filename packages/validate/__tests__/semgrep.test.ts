import { describe, it, expect, vi } from 'vitest'
import { runSemgrep } from '../src/semgrep.js'
import type { Runner } from '@appifex/core'

function mockRunner(overrides: Partial<{ exec: unknown; capabilities: unknown }> = {}): Runner {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', duration: 1000 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: true,
      platform: 'darwin',
    },
    ...overrides,
  } as Runner
}

const CLEAN_OUTPUT = JSON.stringify({ results: [], errors: [] })

const FINDINGS_OUTPUT = JSON.stringify({
  results: [
    {
      check_id: 'javascript.lang.security.detect-eval-with-expression',
      extra: { severity: 'ERROR', message: 'Detected eval() with user-controlled input' },
      path: 'src/utils.ts',
      start: { line: 42, col: 5 },
      end: { line: 42 },
    },
    {
      check_id: 'typescript.react.security.audit.react-dangerouslysetinnerhtml',
      extra: { severity: 'WARNING', message: 'Detected dangerouslySetInnerHTML usage' },
      path: 'src/components/RichText.tsx',
      start: { line: 15, col: 10 },
      end: { line: 15 },
    },
  ],
  errors: [],
})

describe('runSemgrep', () => {
  it('auto-installs semgrep when not found and pip succeeds', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'pipx not found', duration: 100 }) // pipx fails
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 5000 }) // pip install
      .mockResolvedValueOnce({ exitCode: 0, stdout: CLEAN_OUTPUT, stderr: '', duration: 3000 }) // semgrep scan

    const runner = mockRunner({
      exec,
      capabilities: {
        hasMaestro: false,
        hasXcode: false,
        hasNode: true,
        hasSemgrep: false,
        platform: 'darwin',
      },
    })

    const result = await runSemgrep(runner, { projectDir: '/app' })

    expect(exec).toHaveBeenCalledWith('pip', ['install', 'semgrep'], expect.anything())
    expect(exec).toHaveBeenCalledWith(
      'semgrep',
      expect.arrayContaining(['scan']),
      expect.anything(),
    )
    expect(result.failed).toBe(0)
    expect(result.passed).toBe(1)
  })

  it('falls back to pip3 when pip fails', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'pipx not found', duration: 100 }) // pipx fails
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'pip not found', duration: 100 }) // pip fails
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', duration: 5000 }) // pip3 succeeds
      .mockResolvedValueOnce({ exitCode: 0, stdout: CLEAN_OUTPUT, stderr: '', duration: 3000 }) // semgrep scan

    const runner = mockRunner({
      exec,
      capabilities: {
        hasMaestro: false,
        hasXcode: false,
        hasNode: true,
        hasSemgrep: false,
        platform: 'darwin',
      },
    })

    const result = await runSemgrep(runner, { projectDir: '/app' })

    expect(exec).toHaveBeenCalledWith('pip3', ['install', 'semgrep'], expect.anything())
    expect(result.failed).toBe(0)
  })

  it('returns error when install fails entirely', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'pipx not found', duration: 100 }) // pipx fails
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'pip not found', duration: 100 }) // pip fails
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'pip3 not found', duration: 100 }) // pip3 fails

    const runner = mockRunner({
      exec,
      capabilities: {
        hasMaestro: false,
        hasXcode: false,
        hasNode: true,
        hasSemgrep: false,
        platform: 'darwin',
      },
    })

    const result = await runSemgrep(runner, { projectDir: '/app' })

    expect(result.error).toContain('semgrep install failed')
    expect(result.total).toBe(0)
  })

  it('parses clean scan with 0 findings', async () => {
    const runner = mockRunner({
      exec: vi
        .fn()
        .mockResolvedValue({ exitCode: 0, stdout: CLEAN_OUTPUT, stderr: '', duration: 3000 }),
    })

    const result = await runSemgrep(runner, { projectDir: '/app' })

    expect(result.total).toBe(0)
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.findings).toHaveLength(0)
  })

  it('parses findings into SemgrepFinding objects', async () => {
    const runner = mockRunner({
      exec: vi
        .fn()
        .mockResolvedValue({ exitCode: 1, stdout: FINDINGS_OUTPUT, stderr: '', duration: 5000 }),
    })

    const result = await runSemgrep(runner, { projectDir: '/app' })

    expect(result.total).toBe(2)
    expect(result.passed).toBe(0)
    expect(result.failed).toBe(2)
    expect(result.findings).toHaveLength(2)

    expect(result.findings[0]).toEqual({
      ruleId: 'javascript.lang.security.detect-eval-with-expression',
      severity: 'ERROR',
      message: 'Detected eval() with user-controlled input',
      file: 'src/utils.ts',
      line: 42,
      endLine: 42,
      column: 5,
    })

    expect(result.findings[1].severity).toBe('WARNING')
    expect(result.findings[1].file).toBe('src/components/RichText.tsx')
  })

  it('handles JSON parse failure gracefully', async () => {
    const runner = mockRunner({
      exec: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: 'not json',
        stderr: 'semgrep error',
        duration: 1000,
      }),
    })

    const result = await runSemgrep(runner, { projectDir: '/app' })

    expect(result.error).toBe('semgrep error')
    expect(result.total).toBe(0)
    expect(result.findings).toHaveLength(0)
  })

  it('skips install when hasSemgrep is true', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: CLEAN_OUTPUT, stderr: '', duration: 3000 })
    const runner = mockRunner({ exec })

    await runSemgrep(runner, { projectDir: '/app' })

    // Should NOT have called pip install
    expect(exec).not.toHaveBeenCalledWith('pip', expect.anything(), expect.anything())
    // Should have called semgrep directly
    expect(exec).toHaveBeenCalledWith(
      'semgrep',
      expect.arrayContaining(['scan']),
      expect.anything(),
    )
  })

  it('uses custom config arg', async () => {
    const exec = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: CLEAN_OUTPUT, stderr: '', duration: 3000 })
    const runner = mockRunner({ exec })

    await runSemgrep(runner, { projectDir: '/app', configArg: 'p/owasp-top-ten' })

    expect(exec).toHaveBeenCalledWith(
      'semgrep',
      expect.arrayContaining(['--config', 'p/owasp-top-ten']),
      expect.anything(),
    )
  })
})
