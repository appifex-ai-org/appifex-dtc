import type { Runner, ExecResult } from '@appifex/core'

export interface GitConfig {
  /** Git user name for commits */
  userName?: string
  /** Git user email for commits */
  userEmail?: string
}

export class GitClient {
  constructor(
    private runner: Runner,
    private projectDir: string,
    private config?: GitConfig,
  ) {}

  private async git(args: string[]): Promise<ExecResult> {
    return this.runner.exec('git', args, { cwd: this.projectDir })
  }

  async isRepo(): Promise<boolean> {
    const result = await this.git(['rev-parse', '--is-inside-work-tree'])
    return result.exitCode === 0 && result.stdout.trim() === 'true'
  }

  async init(): Promise<void> {
    await this.git(['init'])
    await this.ensureIdentity()
  }

  /** Apply git user.name/user.email config. Safe to call multiple times. */
  async ensureIdentity(): Promise<void> {
    if (this.config?.userName) {
      await this.git(['config', 'user.name', this.config.userName])
    }
    if (this.config?.userEmail) {
      await this.git(['config', 'user.email', this.config.userEmail])
    }
  }

  async addAll(): Promise<void> {
    await this.git(['add', '-A'])
  }

  async commit(message: string): Promise<string> {
    const result = await this.git(['commit', '-m', message])
    if (result.exitCode !== 0) {
      throw new Error(`git commit failed: ${result.stderr}`)
    }
    // Extract commit hash
    const hashResult = await this.git(['rev-parse', 'HEAD'])
    return hashResult.stdout.trim()
  }

  async currentBranch(): Promise<string> {
    const result = await this.git(['branch', '--show-current'])
    return result.stdout.trim()
  }

  async createBranch(name: string): Promise<void> {
    const result = await this.git(['checkout', '-b', name])
    if (result.exitCode !== 0) {
      // Branch may already exist — try switching to it
      const switchResult = await this.git(['checkout', name])
      if (switchResult.exitCode !== 0) {
        throw new Error(`Failed to create/switch to branch ${name}: ${switchResult.stderr}`)
      }
    }
  }

  async getRemoteUrl(name: string): Promise<string | undefined> {
    const result = await this.git(['remote', 'get-url', name])
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim()
    }
    return undefined
  }

  async remoteBranchExists(remote: string, branch: string): Promise<boolean> {
    const result = await this.git(['ls-remote', '--heads', remote, branch])
    return result.exitCode === 0 && result.stdout.trim().length > 0
  }

  async addRemote(name: string, url: string): Promise<void> {
    // Check if remote already exists
    const result = await this.git(['remote', 'get-url', name])
    if (result.exitCode === 0) {
      // Remote exists — update it
      await this.git(['remote', 'set-url', name, url])
    } else {
      await this.git(['remote', 'add', name, url])
    }
  }

  async push(remote: string, branch: string, setUpstream?: boolean): Promise<void> {
    const args = ['push']
    if (setUpstream) args.push('-u')
    args.push(remote, branch)
    const result = await this.git(args)
    if (result.exitCode !== 0) {
      throw new Error(`git push failed: ${result.stderr}`)
    }
  }

  async hasChanges(): Promise<boolean> {
    const result = await this.git(['status', '--porcelain'])
    return result.stdout.trim().length > 0
  }

  async log(count: number = 1): Promise<string> {
    const result = await this.git(['log', `--oneline`, `-${count}`])
    return result.stdout.trim()
  }

  async diff(staged?: boolean): Promise<string> {
    const args = ['diff', '--stat']
    if (staged) args.splice(1, 0, '--cached')
    const result = await this.git(args)
    return result.stdout.trim()
  }
}
