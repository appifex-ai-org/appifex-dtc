import { spawn } from 'node:child_process'
import { readFile, writeFile, access, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { glob as globFn } from 'node:fs/promises'
import type { Runner, ExecResult, ExecOpts, RunnerCapabilities } from '@appifex/core'
import { execSync } from 'node:child_process'

function which(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export class LocalRunner implements Runner {
  readonly capabilities: RunnerCapabilities

  constructor(private defaultCwd: string) {
    const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
    this.capabilities = {
      hasMaestro: which('maestro'),
      hasXcode: which('xcodebuild'),
      hasNode: which('node'),
      hasSemgrep: which('semgrep'),
      hasXcodegen: which('xcodegen'),
      hasJava: which('java'),
      hasAndroidSdk: !!process.env.ANDROID_HOME,
      hasGradle: which('gradle') || which('gradlew'),
      hasAdb: which('adb'),
      hasEmulator: which('emulator'),
      platform,
    }
  }

  async exec(command: string, args: string[], opts?: ExecOpts): Promise<ExecResult> {
    const start = performance.now()
    const shellCommand = [command, ...args].join(' ')
    return new Promise<ExecResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: opts?.cwd ?? this.defaultCwd,
        env: opts?.env ? { ...process.env, ...opts.env } : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      if (opts?.timeout) {
        timer = setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, opts.timeout)
      }

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (timer) clearTimeout(timer)
        const msg = err.code === 'ENOENT'
          ? `Command not found: ${command}. Is it installed and in your PATH? (cwd: ${opts?.cwd ?? this.defaultCwd})`
          : err.message
        resolve({
          command: shellCommand,
          exitCode: 127,
          stdout: '',
          stderr: msg,
          duration: performance.now() - start,
        })
      })

      child.on('close', (code) => {
        if (timer) clearTimeout(timer)
        resolve({
          command: shellCommand,
          exitCode: timedOut ? 124 : (code ?? 1),
          stdout,
          stderr,
          duration: performance.now() - start,
        })
      })
    })
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf-8')
  }

  async writeFile(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  async glob(pattern: string): Promise<string[]> {
    const results: string[] = []
    for await (const entry of globFn(pattern, { cwd: this.defaultCwd })) {
      results.push(join(this.defaultCwd, entry))
    }
    return results.sort()
  }
}
