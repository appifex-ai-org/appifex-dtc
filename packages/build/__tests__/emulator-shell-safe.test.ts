import { describe, it, expect, vi } from 'vitest'
import { findOrBootEmulator } from '../src/emulator.js'
import type { Runner, ExecResult } from '@appifex/core'

// Phase 04 (SEC-02, T-04-08) — proves the AVD name is shell-quoted before the
// `nohup emulator -avd ${avd} ...` interpolation reaches `sh -c`. Legitimate
// identifiers (`Pixel_API_34`) pass through unquoted; anything containing
// shell metacharacters gets single-quoted by `shell-quote` so the `;`, `$`,
// backtick etc. cannot escape the quoted context.

/**
 * Build a Runner stub that (a) returns the crafted AVD name from
 * `emulator -list-avds`, (b) reports no already-running emulators from
 * `adb devices`, (c) captures the `sh -c ...` launch-command string for
 * assertion, then (d) returns exitCode !== 0 from `adb wait-for-device` to
 * abort the rest of the flow — we only care about the launcher.
 */
function makeCapturingRunner(avdName: string): {
  runner: Runner
  launchCommands: string[]
} {
  const launchCommands: string[] = []
  const runner: Runner = {
    exec: vi.fn(async (cmd: string, args: string[]): Promise<ExecResult> => {
      // `adb devices` — return empty device list so no already-running
      // emulator short-circuits the flow.
      if (cmd === 'adb' && args[0] === 'devices') {
        return {
          command: 'adb devices',
          exitCode: 0,
          stdout: 'List of devices attached\n',
          stderr: '',
          duration: 0,
        }
      }
      // `emulator -list-avds` — return our crafted AVD name.
      if (cmd === 'emulator' && args[0] === '-list-avds') {
        return {
          command: 'emulator -list-avds',
          exitCode: 0,
          stdout: avdName + '\n',
          stderr: '',
          duration: 0,
        }
      }
      // `sh -c ...nohup emulator -avd...` — capture the full shell string.
      if (cmd === 'sh' && args[0] === '-c' && args[1].includes('nohup emulator')) {
        launchCommands.push(args[1])
        return { command: 'sh -c <launcher>', exitCode: 0, stdout: '', stderr: '', duration: 0 }
      }
      // `adb wait-for-device` — fail so the rest of the flow aborts.
      if (cmd === 'adb' && args[0] === 'wait-for-device') {
        return {
          command: 'adb wait-for-device',
          exitCode: 1,
          stdout: '',
          stderr: 'timeout',
          duration: 0,
        }
      }
      return { command: '', exitCode: 0, stdout: '', stderr: '', duration: 0 }
    }) as unknown as Runner['exec'],
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue([]),
    capabilities: {
      hasMaestro: false,
      hasXcode: false,
      hasNode: true,
      hasSemgrep: false,
      hasXcodegen: false,
      hasJava: false,
      hasAndroidSdk: false,
      hasGradle: false,
      hasAdb: true,
      hasEmulator: true,
      platform: 'linux',
    },
  }
  return { runner, launchCommands }
}

describe('findOrBootEmulator — shell-quote the AVD name (SEC-02)', () => {
  it('leaves plain identifier "Pixel_API_34" unquoted (shell-quote only quotes when needed)', async () => {
    const { runner, launchCommands } = makeCapturingRunner('Pixel_API_34')

    await findOrBootEmulator(runner)

    expect(launchCommands).toHaveLength(1)
    // `shell-quote` returns `Pixel_API_34` unchanged for a safe identifier —
    // no surrounding quotes.
    expect(launchCommands[0]).toContain('-avd Pixel_API_34 ')
    expect(launchCommands[0]).not.toContain(`-avd 'Pixel_API_34'`)
  })

  it('single-quotes AVD containing command separator `;` so shell treats it literally', async () => {
    const evil = 'my evil; rm -rf /'
    const { runner, launchCommands } = makeCapturingRunner(evil)

    await findOrBootEmulator(runner)

    expect(launchCommands).toHaveLength(1)
    // shell-quote wraps the whole value in single quotes because it contains
    // `;` and spaces. The `;` is now INSIDE the quotes, so the shell cannot
    // treat it as a command separator — `emulator` receives it as a literal
    // (and will fail with "unknown AVD", but no command injection occurred).
    expect(launchCommands[0]).toContain(`-avd 'my evil; rm -rf /'`)
    // Critical: the `;` in the output MUST be inside single quotes — a POSIX
    // shell parsing the launcher will treat the entire quoted run as one
    // argument to `emulator -avd`. Assert by confirming the `;` appears only
    // inside the `'...'` context (everything from `-avd '` to the closing `'`).
    const avdMatch = launchCommands[0].match(/-avd '([^']*)'/)
    expect(avdMatch).not.toBeNull()
    expect(avdMatch![1]).toBe('my evil; rm -rf /')
  })

  it('neutralises command substitution `$(…)` via backslash-escaping', async () => {
    const evil = '$(whoami)'
    const { runner, launchCommands } = makeCapturingRunner(evil)

    await findOrBootEmulator(runner)

    expect(launchCommands).toHaveLength(1)
    // `shell-quote` chooses between single-quoting and backslash-escaping
    // depending on input. For `$(whoami)` it produces `\$\(whoami\)` — the `$`
    // and `(` are each individually escaped so the shell never invokes
    // command substitution. The test asserts the `$` is preceded by `\`,
    // which is the specific mitigation.
    expect(launchCommands[0]).toMatch(/-avd \\\$\\\(whoami\\\)/)
    // Critical negative assertion: the raw unescaped `$(whoami)` MUST NOT
    // appear in the launcher — that would be an active command substitution.
    expect(launchCommands[0]).not.toMatch(/-avd\s+\$\(whoami\)/)
  })

  it('neutralises backtick substitution via backslash-escaping', async () => {
    const evil = '`id`'
    const { runner, launchCommands } = makeCapturingRunner(evil)

    await findOrBootEmulator(runner)

    expect(launchCommands).toHaveLength(1)
    // `shell-quote` backslash-escapes each backtick: `` \`id\` ``. Shell
    // treats a backslashed backtick as a literal character, not as a command
    // substitution opener — so `id` is NOT invoked.
    expect(launchCommands[0]).toMatch(/-avd \\`id\\`/)
    // Critical negative assertion: a bare `` `id` `` MUST NOT appear after
    // `-avd`, because that WOULD fire command substitution.
    expect(launchCommands[0]).not.toMatch(/-avd\s+`id`/)
  })
})
