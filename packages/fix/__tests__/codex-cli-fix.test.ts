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

function makeFakeCodexChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    writtenPrompt: string
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
      child.emit('close', 0)
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function fakeRunner(): Runner {
  return {
    exec: vi.fn(async (command: string, args: string[]) => {
      if (command === 'git' && args.join(' ') === 'diff --name-only') {
        return {
          command: 'git diff --name-only',
          exitCode: 0,
          stdout: 'Sources/AppView.swift\n',
          stderr: '',
          duration: 0,
        }
      }
      if (command === 'git' && args.join(' ') === 'ls-files --others --exclude-standard') {
        return {
          command: 'git ls-files --others --exclude-standard',
          exitCode: 0,
          stdout: 'Tests/AppViewTests.swift\n',
          stderr: '',
          duration: 0,
        }
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
    const runner = fakeRunner()
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
})
