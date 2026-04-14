import type { Runner, ExecResult, ExecOpts, RunnerCapabilities } from '@appifex/core'

/**
 * Wraps any Runner to collect all shell commands executed during an operation.
 * After the operation completes, call `getCommands()` to retrieve the list.
 */
export class CommandCollectingRunner implements Runner {
  private commands: string[] = []

  constructor(private inner: Runner) {}

  get capabilities(): RunnerCapabilities {
    return this.inner.capabilities
  }

  async exec(command: string, args: string[], opts?: ExecOpts): Promise<ExecResult> {
    const result = await this.inner.exec(command, args, opts)
    this.commands.push(result.command)
    return result
  }

  /** Returns all shell commands collected so far */
  getCommands(): string[] {
    return [...this.commands]
  }

  readFile(path: string): Promise<string> {
    return this.inner.readFile(path)
  }

  writeFile(path: string, content: string): Promise<void> {
    return this.inner.writeFile(path, content)
  }

  exists(path: string): Promise<boolean> {
    return this.inner.exists(path)
  }

  glob(pattern: string): Promise<string[]> {
    return this.inner.glob(pattern)
  }
}
