import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deliver } from '../src/deliver.js'
import { GitClient } from '../src/git-client.js'
import type { Runner, ExecResult, RunnerCapabilities } from '@appifex/core'

function createMockRunner(responses?: Record<string, ExecResult>): Runner {
  const defaultResult: ExecResult = { exitCode: 0, stdout: '', stderr: '', duration: 10 }
  const execHistory: Array<{ command: string; args: string[] }> = []

  return {
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      platform: 'darwin',
    },
    async exec(command: string, args: string[]) {
      execHistory.push({ command, args })
      const key = `${command} ${args.join(' ')}`
      // Match by prefix for flexibility
      for (const [pattern, result] of Object.entries(responses ?? {})) {
        if (key.startsWith(pattern) || key.includes(pattern)) {
          return result
        }
      }
      // Default responses for common git commands
      if (args.includes('rev-parse') && args.includes('--is-inside-work-tree')) {
        return { ...defaultResult, stdout: 'true' }
      }
      if (args.includes('rev-parse') && args.includes('HEAD')) {
        return { ...defaultResult, stdout: 'abc1234def5678' }
      }
      if (args.includes('--show-current')) {
        return { ...defaultResult, stdout: 'dtc/test-branch' }
      }
      if (args.includes('--porcelain')) {
        return { ...defaultResult, stdout: 'M file.ts\n' }
      }
      return defaultResult
    },
    async readFile() {
      return ''
    },
    async writeFile() {},
    async exists() {
      return true
    },
    async glob() {
      return []
    },
  }
}

describe('deliver', () => {
  it('commits code locally when skipPush is true', async () => {
    const runner = createMockRunner()
    const result = await deliver(runner, {
      projectDir: '/tmp/test-project',
      skipPush: true,
      summary: 'Test delivery',
    })

    expect(result.commitHash).toBe('abc1234def5678')
    expect(result.pushed).toBe(false)
    expect(result.pr).toBeUndefined()
  })

  it('skips commit when no changes exist', async () => {
    const runner = createMockRunner({
      '--porcelain': { exitCode: 0, stdout: '', stderr: '', duration: 10 },
    })
    const result = await deliver(runner, {
      projectDir: '/tmp/test-project',
      skipPush: true,
    })

    expect(result.pushed).toBe(false)
  })

  it('initializes git repo if not already one', async () => {
    const calls: string[][] = []
    const runner = createMockRunner({
      '--is-inside-work-tree': { exitCode: 1, stdout: '', stderr: 'not a git repo', duration: 10 },
    })
    const origExec = runner.exec.bind(runner)
    runner.exec = async (cmd, args, opts) => {
      calls.push([cmd, ...args])
      return origExec(cmd, args, opts)
    }

    await deliver(runner, {
      projectDir: '/tmp/test-project',
      skipPush: true,
    })

    const initCall = calls.find((c) => c[0] === 'git' && c[1] === 'init')
    expect(initCall).toBeTruthy()
  })

  it('creates PR and auto-merges when allTestsGreen is true', async () => {
    const calls: string[][] = []
    const runner = createMockRunner({
      'which gh': { exitCode: 0, stdout: '/usr/local/bin/gh', stderr: '', duration: 5 },
      'gh pr create': {
        exitCode: 0,
        stdout: 'https://github.com/owner/repo/pull/42',
        stderr: '',
        duration: 100,
      },
      'gh pr merge': { exitCode: 0, stdout: 'Merged', stderr: '', duration: 100 },
      'ls-remote': { exitCode: 0, stdout: 'abc123\trefs/heads/main', stderr: '', duration: 10 },
    })
    const origExec = runner.exec.bind(runner)
    runner.exec = async (cmd, args, opts) => {
      calls.push([cmd, ...args])
      return origExec(cmd, args, opts)
    }

    const result = await deliver(runner, {
      projectDir: '/tmp/test-project',
      remoteUrl: 'https://github.com/owner/repo.git',
      autoMerge: true,
      allTestsGreen: true,
      mergeMethod: 'squash',
    })

    expect(result.pr).toBeDefined()
    expect(result.pr!.merged).toBe(true)
    expect(result.pr!.mergeMethod).toBe('squash')
    const mergeCall = calls.find((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge')
    expect(mergeCall).toBeTruthy()
    expect(mergeCall).toContain('--squash')
  })

  it('creates PR but does NOT auto-merge when tests are failing', async () => {
    const calls: string[][] = []
    const runner = createMockRunner({
      'which gh': { exitCode: 0, stdout: '/usr/local/bin/gh', stderr: '', duration: 5 },
      'gh pr create': {
        exitCode: 0,
        stdout: 'https://github.com/owner/repo/pull/43',
        stderr: '',
        duration: 100,
      },
      'ls-remote': { exitCode: 0, stdout: 'abc123\trefs/heads/main', stderr: '', duration: 10 },
    })
    const origExec = runner.exec.bind(runner)
    runner.exec = async (cmd, args, opts) => {
      calls.push([cmd, ...args])
      return origExec(cmd, args, opts)
    }

    const result = await deliver(runner, {
      projectDir: '/tmp/test-project',
      remoteUrl: 'https://github.com/owner/repo.git',
      autoMerge: true,
      allTestsGreen: false,
    })

    expect(result.pr).toBeDefined()
    expect(result.pr!.merged).toBe(false)
    const mergeCall = calls.find((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge')
    expect(mergeCall).toBeUndefined()
  })

  it('uses custom branch name', async () => {
    const calls: string[][] = []
    const runner = createMockRunner()
    const origExec = runner.exec.bind(runner)
    runner.exec = async (cmd, args, opts) => {
      calls.push([cmd, ...args])
      return origExec(cmd, args, opts)
    }

    await deliver(runner, {
      projectDir: '/tmp/test-project',
      branch: 'feat/my-app',
      skipPush: true,
    })

    const branchCall = calls.find(
      (c) => c[0] === 'git' && c[1] === 'checkout' && c[2] === '-b' && c[3] === 'feat/my-app',
    )
    expect(branchCall).toBeTruthy()
  })
})

describe('GitClient', () => {
  it('detects existing git repo', async () => {
    const runner = createMockRunner()
    const git = new GitClient(runner, '/tmp/test')
    expect(await git.isRepo()).toBe(true)
  })

  it('detects non-git directory', async () => {
    const runner = createMockRunner({
      '--is-inside-work-tree': { exitCode: 1, stdout: '', stderr: 'fatal', duration: 10 },
    })
    const git = new GitClient(runner, '/tmp/test')
    expect(await git.isRepo()).toBe(false)
  })
})
