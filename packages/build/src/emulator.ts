import type { Runner } from '@appifex/core'
// Phase 04 (SEC-02, T-04-08): shell-quote the AVD name before interpolation.
import { quote } from 'shell-quote'

export interface EmulatorInfo {
  name: string
  apiLevel: number
}

/** List available Android AVDs */
export async function listAvds(runner: Runner): Promise<string[]> {
  const result = await runner.exec('emulator', ['-list-avds'])
  if (result.exitCode !== 0) return []
  return result.stdout.trim().split('\n').filter(Boolean)
}

/** Find the best available AVD (highest API level, prefers Pixel) */
export async function findBestEmulator(runner: Runner): Promise<string | null> {
  const avds = await listAvds(runner)
  if (avds.length === 0) return null

  // Score AVDs: prefer higher API level + "Pixel" in name
  let best = avds[0]
  let bestScore = 0
  for (const avd of avds) {
    let score = 0
    const apiMatch = avd.match(/API_(\d+)/)
    if (apiMatch) score += parseInt(apiMatch[1], 10)
    if (avd.toLowerCase().includes('pixel')) score += 5
    if (score > bestScore) {
      bestScore = score
      best = avd
    }
  }
  return best
}

/** Find a running emulator or boot the best available one */
export async function findOrBootEmulator(runner: Runner): Promise<string | null> {
  // Check for already-running emulator
  const devices = await runner.exec('adb', ['devices'])
  if (devices.exitCode === 0) {
    const lines = devices.stdout.trim().split('\n').slice(1)
    const emulator = lines.find((l) => l.includes('emulator') && l.includes('device'))
    if (emulator) return emulator.split('\t')[0]
  }

  // Boot the best AVD
  const avd = await findBestEmulator(runner)
  if (!avd) return null

  // Phase 04 (SEC-02, T-04-08): quote `avd` before shell interpolation. The
  // background launch genuinely requires a shell (nohup + stdio redirection +
  // `&`), so we keep `sh -c` but remove the caller-controlled interpolation
  // hole. AVD names are plain identifiers (not globs), so `shell-quote` is the
  // right tool — it single-quotes values containing shell metacharacters so a
  // poisoned name like `$(whoami)` cannot escape the quoted argument.
  const avdQuoted = quote([avd])
  // Launch emulator in the background via sh — runner.exec would kill it on timeout
  await runner.exec('sh', [
    '-c',
    `nohup emulator -avd ${avdQuoted} -no-window -no-audio -no-boot-anim </dev/null >/dev/null 2>&1 &`,
  ])

  // Wait for device to come online
  const waitResult = await runner.exec('adb', ['wait-for-device'], { timeout: 60_000 })
  if (waitResult.exitCode !== 0) return null

  // Poll for boot completion
  const bootResult = await runner.exec(
    'adb',
    ['shell', 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done; echo 1'],
    {
      timeout: 120_000,
    },
  )

  if (bootResult.exitCode === 0 && bootResult.stdout.trim().includes('1')) {
    const devicesAfter = await runner.exec('adb', ['devices'])
    const line = devicesAfter.stdout
      .trim()
      .split('\n')
      .slice(1)
      .find((l) => l.includes('emulator'))
    if (line) return line.split('\t')[0]
  }

  return null
}
