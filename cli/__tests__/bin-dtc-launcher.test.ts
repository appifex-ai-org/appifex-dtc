import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, lstatSync } from 'node:fs'

describe('bin/dtc launcher (FOUND-01)', () => {
  const binPath = resolve(process.cwd(), 'bin/dtc')

  it('exists as a regular file, not a symlink', () => {
    expect(existsSync(binPath)).toBe(true)
    expect(lstatSync(binPath).isSymbolicLink()).toBe(false)
  })

  it('is executable and exits 0 on --help', async () => {
    // --help is confirmed supported by cli/src/cli.ts:37 (parseArgs returns command:'help')
    // and handled by cli/src/entry.ts:121 (case 'help': printHelp(); break) — exits 0.
    const { code, stdout } = await new Promise<{ code: number | null; stdout: string }>((res) => {
      const child = spawn(binPath, ['--help'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (d) => {
        out += d.toString()
      })
      child.on('close', (code) => res({ code, stdout: out }))
    })
    expect(code).toBe(0)
    expect(stdout).toContain('dtc')
  })
})
