import type { Runner, ExecResult, ExecOpts, RunnerCapabilities } from '@appifex/core'

type FetchFn = typeof globalThis.fetch

export interface RemoteRunnerOpts {
  runnerUrl: string
  runnerToken: string
  fetchImpl?: FetchFn
}

export class RemoteRunner implements Runner {
  private baseUrl: string
  private token: string
  private fetch: FetchFn

  readonly capabilities: RunnerCapabilities = {
    hasMaestro: true,
    hasXcode: true,
    hasNode: true,
    hasSemgrep: false,
    hasXcodegen: true,
    hasJava: false,
    hasAndroidSdk: false,
    hasGradle: false,
    hasAdb: false,
    hasEmulator: false,
    platform: 'darwin',
  }

  constructor(opts: RemoteRunnerOpts) {
    this.baseUrl = opts.runnerUrl.replace(/\/$/, '')
    this.token = opts.runnerToken
    this.fetch = opts.fetchImpl ?? globalThis.fetch
  }

  private url(path: string): string {
    return `${this.baseUrl}/api${path}`
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  async exec(command: string, args: string[], opts?: ExecOpts): Promise<ExecResult> {
    const start = performance.now()
    const shellCommand = [command, ...args].join(' ')
    const resp = await this.fetch(this.url('/exec'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        command,
        args,
        cwd: opts?.cwd,
        env: opts?.env,
        timeout: opts?.timeout,
      }),
    })
    const data = await resp.json() as { exitCode: number; stdout: string; stderr: string }
    return {
      command: shellCommand,
      exitCode: data.exitCode,
      stdout: data.stdout,
      stderr: data.stderr,
      duration: performance.now() - start,
    }
  }

  async readFile(path: string): Promise<string> {
    const resp = await this.fetch(
      this.url(`/files?path=${encodeURIComponent(path)}`),
      { headers: this.headers() },
    )
    return resp.text()
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.fetch(this.url('/files'), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ path, content }),
    })
  }

  async exists(path: string): Promise<boolean> {
    const resp = await this.fetch(
      this.url(`/files?path=${encodeURIComponent(path)}`),
      { method: 'HEAD', headers: this.headers() },
    )
    return resp.ok
  }

  async glob(pattern: string): Promise<string[]> {
    const result = await this.exec('sh', ['-c', `ls -1 ${pattern} 2>/dev/null`])
    if (result.exitCode !== 0) return []
    return result.stdout.trim().split('\n').filter(Boolean)
  }
}
