import type { Runner, ExecResult, ExecOpts, RunnerCapabilities } from '@appifex/core'

type FetchFn = typeof globalThis.fetch

export interface E2BRunnerOpts {
  sandboxId: string
  apiKey: string
  apiUrl?: string
  fetchImpl?: FetchFn
}

export class E2BRunner implements Runner {
  private sandboxId: string
  private apiKey: string
  private baseUrl: string
  private fetch: FetchFn

  readonly capabilities: RunnerCapabilities = {
    hasMaestro: true,
    hasXcode: false,
    hasNode: true,
    hasSemgrep: false,
    hasXcodegen: false,
    hasJava: false,
    hasAndroidSdk: false,
    hasGradle: false,
    hasAdb: false,
    hasEmulator: false,
    platform: 'linux',
  }

  constructor(opts: E2BRunnerOpts) {
    this.sandboxId = opts.sandboxId
    this.apiKey = opts.apiKey
    this.baseUrl = opts.apiUrl ?? 'https://api.e2b.dev'
    this.fetch = opts.fetchImpl ?? globalThis.fetch
  }

  private url(path: string): string {
    return `${this.baseUrl}/sandboxes/${this.sandboxId}${path}`
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
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
    const data = (await resp.json()) as { exitCode: number; stdout: string; stderr: string }
    return {
      command: shellCommand,
      exitCode: data.exitCode,
      stdout: data.stdout,
      stderr: data.stderr,
      duration: performance.now() - start,
    }
  }

  async readFile(path: string): Promise<string> {
    const resp = await this.fetch(this.url(`/files?path=${encodeURIComponent(path)}`), {
      headers: this.headers(),
    })
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
    const resp = await this.fetch(this.url(`/files?path=${encodeURIComponent(path)}`), {
      method: 'HEAD',
      headers: this.headers(),
    })
    return resp.ok
  }

  async glob(pattern: string): Promise<string[]> {
    const result = await this.exec('sh', ['-c', `ls -1 ${pattern} 2>/dev/null`])
    if (result.exitCode !== 0) return []
    return result.stdout.trim().split('\n').filter(Boolean)
  }
}
