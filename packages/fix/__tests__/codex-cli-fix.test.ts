import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Writable } from 'node:stream'
import type { Runner } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'

vi.mock('@appifex/analysis', () => ({
  scanProject: vi.fn(async () => ({ files: [] })),
  buildNavGraph: vi.fn(async () => []),
  rankFixContext: vi.fn(async () => ({ files: [], maxFiles: 0 })),
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const { createCodexCliFixFn } = await import('../src/codex-cli-fix.js')

function makeSuccessfulChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: EventEmitter
    stderr: EventEmitter
    kill: (sig?: string) => void
  }
  const stdinEmitter = new EventEmitter()
  child.stdin = {
    on: stdinEmitter.on.bind(stdinEmitter),
    write: () => true,
    end: () => {
      setImmediate(() => child.emit('close', 0))
    },
  } as unknown as Writable
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}
  return child
}

function fakeRunner(): Runner {
  let readCount = 0
  return {
    exec: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
    readFile: vi.fn(async (file: string) => {
      if (file.endsWith('ContentView.swift')) {
        readCount += 1
        return readCount === 1 ? 'old source' : 'fixed source'
      }
      return ''
    }),
    writeFile: vi.fn(async () => {}),
    glob: vi.fn(async (pattern: string) =>
      pattern.includes('/Sources/') ? ['/tmp/proj/Sources/ContentView.swift'] : [],
    ),
    mkdir: vi.fn(async () => {}),
    capabilities: vi.fn(async () => ({
      hasMaestro: false,
      hasXcodebuild: false,
      hasXcodegen: false,
      hasSemgrep: false,
      hasJava: false,
      hasGradle: false,
      hasAdb: false,
      hasEmulator: false,
      hasAndroidSdk: false,
    })),
  } as unknown as Runner
}

const failures: ValidationResult = {
  ui: {
    total: 1,
    passed: 0,
    failed: 1,
    results: [
      { flowName: 'weather', passed: false, duration: 0, error: 'id SearchButton missing' },
    ],
  },
  unit: { total: 0, passed: 0, failed: 0, failures: [] },
  allPassed: false,
}

describe('createCodexCliFixFn', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset()
  })

  it('uses codex exec and detects changed files without requiring a git repo', async () => {
    vi.mocked(spawn).mockReturnValueOnce(makeSuccessfulChild() as any)

    const fixFn = createCodexCliFixFn({
      runner: fakeRunner(),
      projectDir: '/tmp/proj',
      model: 'gpt-5.5',
    })

    const result = await fixFn(failures)

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      [
        'exec',
        '--full-auto',
        '--sandbox',
        'workspace-write',
        '--skip-git-repo-check',
        '--model',
        'gpt-5.5',
        '-',
      ],
      expect.objectContaining({ cwd: '/tmp/proj' }),
    )
    expect(result.filesChanged).toEqual(['Sources/ContentView.swift'])
  })
})
