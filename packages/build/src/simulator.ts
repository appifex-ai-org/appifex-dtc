import type { Runner } from '@appifex/core'

interface SimDevice {
  name: string
  udid: string
  isAvailable: boolean
  state?: string
}

/**
 * Parse an iOS version number from a runtime identifier.
 * e.g., "com.apple.CoreSimulator.SimRuntime.iOS-26-2" → [26, 2]
 *       "com.apple.CoreSimulator.SimRuntime.iOS-18-1" → [18, 1]
 */
function parseIosVersion(runtime: string): number[] {
  const match = runtime.match(/iOS[- ](\d+)[.-](\d+)/)
  if (!match) return [0, 0]
  return [parseInt(match[1], 10), parseInt(match[2], 10)]
}

/**
 * Score an iPhone model — higher is better/newer.
 * Prefers Pro > Pro Max > regular > Plus > Air > SE/e
 * Within same tier, higher number is better.
 */
function scoreIphoneModel(name: string): number {
  // Extract model number (e.g., "iPhone 17 Pro" → 17)
  const numMatch = name.match(/iPhone\s+(\d+)/)
  const modelNum = numMatch ? parseInt(numMatch[1], 10) : 0

  // Tier bonus
  let tierBonus = 0
  if (name.includes('Pro Max')) tierBonus = 2
  else if (name.includes('Pro'))
    tierBonus = 3 // Pro preferred over Pro Max for standard screen size
  else if (name.includes('Plus')) tierBonus = 0
  else if (name.includes('Air')) tierBonus = 0
  else if (name.includes('SE') || name.includes('16e')) tierBonus = -10
  else tierBonus = 1 // regular iPhone (e.g., "iPhone 17")

  return modelNum * 10 + tierBonus
}

/**
 * Find the best available iPhone simulator: latest iOS runtime, newest Pro model.
 * Returns { udid, name, runtime } or null.
 */
export async function findBestSimulator(
  runner: Runner,
): Promise<{ udid: string; name: string; runtime: string } | null> {
  const result = await runner.exec('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])
  if (result.exitCode !== 0) return null

  try {
    const data = JSON.parse(result.stdout) as { devices: Record<string, SimDevice[]> }

    // Sort runtimes by iOS version descending
    const iosRuntimes = Object.entries(data.devices)
      .filter(([runtime]) => runtime.includes('iOS'))
      .sort((a, b) => {
        const va = parseIosVersion(a[0])
        const vb = parseIosVersion(b[0])
        return vb[0] - va[0] || vb[1] - va[1] // highest version first
      })

    // From the latest runtime, pick the best iPhone
    for (const [runtime, devices] of iosRuntimes) {
      const iphones = devices
        .filter((d) => d.isAvailable && d.name.includes('iPhone'))
        .sort((a, b) => scoreIphoneModel(b.name) - scoreIphoneModel(a.name))

      if (iphones.length > 0) {
        return { udid: iphones[0].udid, name: iphones[0].name, runtime }
      }
    }
  } catch {
    /* fall through */
  }

  return null
}

/**
 * Find a booted simulator, or boot the best available one.
 * Returns the simulator UDID or null.
 */
export async function findOrBootBestSimulator(runner: Runner): Promise<string | null> {
  // Check for already-booted simulator first
  const bootedResult = await runner.exec('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'])
  if (bootedResult.exitCode === 0) {
    try {
      const data = JSON.parse(bootedResult.stdout) as { devices: Record<string, SimDevice[]> }

      // Find booted iPhones, prefer the best one
      const bootedIphones: Array<{ udid: string; name: string; runtime: string }> = []
      for (const [runtime, devices] of Object.entries(data.devices)) {
        if (!runtime.includes('iOS')) continue
        for (const d of devices) {
          if (d.state === 'Booted' && d.name.includes('iPhone')) {
            bootedIphones.push({ udid: d.udid, name: d.name, runtime })
          }
        }
      }

      if (bootedIphones.length > 0) {
        // If multiple booted, pick the best one
        bootedIphones.sort((a, b) => {
          const va = parseIosVersion(a.runtime)
          const vb = parseIosVersion(b.runtime)
          const versionDiff = vb[0] - va[0] || vb[1] - va[1]
          if (versionDiff !== 0) return versionDiff
          return scoreIphoneModel(b.name) - scoreIphoneModel(a.name)
        })
        return bootedIphones[0].udid
      }
    } catch {
      /* fall through */
    }
  }

  // No booted simulator — boot the best available
  const best = await findBestSimulator(runner)
  if (!best) return null

  await runner.exec('xcrun', ['simctl', 'boot', best.udid])
  await new Promise((r) => setTimeout(r, 3000))
  return best.udid
}
