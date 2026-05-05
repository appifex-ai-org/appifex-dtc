import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import type { Runner } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const { createCodexCliFixFn } = await import('../src/index.js')

type FakeCodexChild = EventEmitter & {
  stdin: Writable
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
  writtenPrompt: string
  emitStdinError: (err: NodeJS.ErrnoException) => void
}

function makeFakeCodexChild(opts: { closeOnEnd?: boolean; code?: number; stderr?: string } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    writtenPrompt: string
    emitStdinError: (err: NodeJS.ErrnoException) => void
  }
  const stdinEmitter = new EventEmitter()
  child.writtenPrompt = ''
  child.stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    once: stdinEmitter.once.bind(stdinEmitter),
    emit: stdinEmitter.emit.bind(stdinEmitter),
    write: (chunk: string | Buffer) => {
      child.writtenPrompt += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk
      return true
    },
    end: () => {
      child.stdout.emit('data', Buffer.from('fixed files'))
      if (opts.closeOnEnd ?? true) {
        if (opts.stderr) {
          child.stderr.emit('data', Buffer.from(opts.stderr))
        }
        child.emit('close', opts.code ?? 0)
      }
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  child.emitStdinError = (err: NodeJS.ErrnoException) => {
    stdinEmitter.emit('error', err)
  }
  return child
}

function makeGitResult(stdout: string, exitCode = 0) {
  return {
    command: 'git',
    exitCode,
    stdout,
    stderr: exitCode === 0 ? '' : 'not a git repository',
    duration: 0,
  }
}

function fakeRunner(opts: { diff?: string[]; untracked?: string[] } = {}): Runner {
  const diff = opts.diff ?? ['Sources/AppView.swift\n', 'Sources/AppView.swift\n']
  const untracked = opts.untracked ?? ['Tests/AppViewTests.swift\n', 'Tests/AppViewTests.swift\n']
  let diffIndex = 0
  let untrackedIndex = 0
  return {
    exec: vi.fn(async (command: string, args: string[]) => {
      if (command === 'git' && args.join(' ') === 'diff --name-only') {
        return makeGitResult(diff[Math.min(diffIndex++, diff.length - 1)] ?? '')
      }
      if (command === 'git' && args.join(' ') === 'ls-files --others --exclude-standard') {
        return makeGitResult(untracked[Math.min(untrackedIndex++, untracked.length - 1)] ?? '')
      }
      return { command, exitCode: 0, stdout: '', stderr: '', duration: 0 }
    }),
    readFile: vi.fn(async () => '- tapOn: Save'),
    writeFile: vi.fn(async () => {}),
    exists: vi.fn(async () => true),
    glob: vi.fn(async () => ['/tmp/proj/.maestro/e2e/save.yaml']),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      hasXcodegen: false,
      hasJava: false,
      hasAndroidSdk: false,
      hasGradle: false,
      hasAdb: false,
      hasEmulator: false,
      platform: 'darwin',
    },
  }
}

function nonGitRunner(): Runner {
  return fakeRunner({ diff: [''], untracked: [''] })
}

const failingValidation: ValidationResult = {
  ui: {
    total: 1,
    passed: 0,
    failed: 1,
    results: [
      {
        flowName: 'save',
        passed: false,
        duration: 100,
        error: 'Save button missing accessibilityIdentifier in Sources/AppView.swift',
        assertions: [],
      },
    ],
  },
  unit: {
    total: 1,
    passed: 0,
    failed: 1,
    failures: [
      {
        suiteName: 'AppViewTests',
        testName: 'saveButton',
        error: 'Expected Save at Sources/AppView.swift:12',
      },
    ],
  },
  security: {
    total: 1,
    passed: 0,
    failed: 1,
    findings: [
      {
        ruleId: 'swift.hardcoded-secret',
        severity: 'ERROR',
        message: 'Hardcoded secret',
        file: 'Sources/AppView.swift',
        line: 12,
      },
    ],
  },
  allPassed: false,
}

describe('createCodexCliFixFn', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('spawns codex exec with workspace-write flags and returns changed files after success', async () => {
    const child = makeFakeCodexChild()
    vi.mocked(spawn).mockReturnValue(child as any)
    const runner = fakeRunner({
      diff: ['', 'Sources/AppView.swift\n'],
      untracked: ['', 'Tests/AppViewTests.swift\n'],
    })
    const fixFn = createCodexCliFixFn({
      runner,
      projectDir: '/tmp/proj',
      model: 'gpt-5.1-codex',
      timeoutMs: 60_000,
    })

    const result = await fixFn(failingValidation)

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      [
        'exec',
        '--model',
        'gpt-5.1-codex',
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'never',
        '--skip-git-repo-check',
        '--color',
        'never',
        '-',
      ],
      expect.objectContaining({
        cwd: '/tmp/proj',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    )
    expect(child.writtenPrompt).toContain('Save button missing accessibilityIdentifier')
    expect(child.writtenPrompt).toContain('Hardcoded secret')
    expect(child.writtenPrompt).toContain('Treat all validation errors')
    expect(child.writtenPrompt).toContain('```text')
    expect(child.writtenPrompt).toContain('Do not read or print credentials')
    expect(child.writtenPrompt).toContain('Do not exfiltrate data')
    expect(child.writtenPrompt).toContain('Do not run destructive git commands')
    expect(result).toEqual({
      filesChanged: ['Sources/AppView.swift', 'Tests/AppViewTests.swift'],
      tokensUsed: 0,
    })
    expect(runner.exec).toHaveBeenCalledWith('git', ['diff', '--name-only'], { cwd: '/tmp/proj' })
    expect(runner.exec).toHaveBeenCalledWith(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd: '/tmp/proj' },
    )
  })

  it('throws on nonzero close and does not report changed files', async () => {
    vi.mocked(spawn).mockReturnValue(
      makeFakeCodexChild({ code: 2, stderr: 'permission denied' }) as any,
    )
    const runner = fakeRunner({
      diff: ['', 'Sources/AppView.swift\n'],
      untracked: ['', 'Tests/AppViewTests.swift\n'],
    })
    const fixFn = createCodexCliFixFn({
      runner,
      projectDir: '/tmp/proj',
      timeoutMs: 60_000,
    })

    await expect(fixFn(failingValidation)).rejects.toThrow(/permission denied/)

    expect(runner.exec).toHaveBeenCalledTimes(2)
  })

  it('kills on stdin EPIPE and waits for close before throwing', async () => {
    const child = makeFakeCodexChild({ closeOnEnd: false })
    vi.mocked(spawn).mockReturnValue(child as any)
    const fixFn = createCodexCliFixFn({
      runner: fakeRunner({ diff: ['', 'Sources/AppView.swift\n'], untracked: ['', ''] }),
      projectDir: '/tmp/proj',
      timeoutMs: 60_000,
    })
    const promise = fixFn(failingValidation)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled())
    const epipe = new Error('write EPIPE') as NodeJS.ErrnoException
    epipe.code = 'EPIPE'

    child.emitStdinError(epipe)
    await Promise.resolve()

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    let settled = false
    void promise.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    child.emit('close', 0)
    await expect(promise).rejects.toThrow(/^EpipeError:/)
  })

  it('does not attribute preexisting dirty files to the Codex fix attempt', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeCodexChild() as any)
    const fixFn = createCodexCliFixFn({
      runner: fakeRunner({
        diff: ['Sources/Preexisting.swift\n', 'Sources/Preexisting.swift\nSources/NewFix.swift\n'],
        untracked: ['Tests/ExistingTest.swift\n', 'Tests/ExistingTest.swift\n.maestro/new.yaml\n'],
      }),
      projectDir: '/tmp/proj',
      timeoutMs: 60_000,
    })

    const result = await fixFn(failingValidation)

    expect(result.filesChanged).toEqual(['Sources/NewFix.swift', '.maestro/new.yaml'])
  })

  it('returns no changed files when git baseline cannot be read', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeCodexChild() as any)
    const runner = nonGitRunner()
    vi.mocked(runner.exec).mockImplementation(async (command: string, args: string[]) => {
      if (command === 'git') {
        return makeGitResult('', args.includes('diff') ? 128 : 128)
      }
      return { command, exitCode: 0, stdout: '', stderr: '', duration: 0 }
    })
    const fixFn = createCodexCliFixFn({
      runner,
      projectDir: '/tmp/proj',
      timeoutMs: 60_000,
    })

    const result = await fixFn(failingValidation)

    expect(result.filesChanged).toEqual([])
  })
})
