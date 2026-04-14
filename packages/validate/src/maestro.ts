import type { Runner, Platform, FlowResult } from '@appifex/core'
import { findOrBootEmulator } from '@appifex/build'
import { parseJunitXml } from './junit-parser.js'

export interface MaestroOpts {
  flowDir: string
  projectDir: string
  reportDir: string
  platform?: Platform
  appId?: string
  simulatorId?: string
  /** Timeout in ms for the entire maestro test run. Default: 300_000 (5 minutes) */
  timeoutMs?: number
}

export interface MaestroResult {
  total: number
  passed: number
  failed: number
  results: FlowResult[]
  error?: string
  /** iOS accessibility hierarchy captured when tests fail — helps fix loop understand what Maestro can see */
  hierarchy?: string
}

async function findSimulatorAndApp(runner: Runner, projectDir: string): Promise<{ simId: string; appPath: string; appId: string } | null> {
  // Find the built .app in project build dir or DerivedData
  const derivedDataApps = await runner.glob(`${projectDir}/build/Build/Products/Debug-iphonesimulator/*.app`)
  const defaultApps = await runner.glob(`${process.env.HOME}/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphonesimulator/*.app`)
  const appPath = derivedDataApps[0] ?? defaultApps[0]

  if (!appPath) return null

  // Read bundle ID from Info.plist
  const plistResult = await runner.exec('defaults', ['read', `${appPath}/Info`, 'CFBundleIdentifier'])
  const appId = plistResult.exitCode === 0 ? plistResult.stdout.trim() : 'com.dtc.App'

  const simId = await findOrBootSimulator(runner)
  if (!simId) return null

  return { simId, appPath, appId }
}

async function findOrBootSimulator(runner: Runner): Promise<string | null> {
  const { findOrBootBestSimulator } = await import('@appifex/build')
  return findOrBootBestSimulator(runner)
}

export async function runMaestro(runner: Runner, opts: MaestroOpts): Promise<MaestroResult> {
  // Check Maestro is installed, auto-install if missing
  const maestroCheck = await runner.exec('which', ['maestro'])
  if (maestroCheck.exitCode !== 0) {
    const install = await runner.exec('bash', ['-c', 'curl -Ls "https://get.maestro.mobile.dev" | bash'], { timeout: 120_000 })
    if (install.exitCode !== 0) {
      return { total: 0, passed: 0, failed: 0, results: [], error: 'Maestro auto-install failed — install manually: curl -Ls "https://get.maestro.mobile.dev" | bash' }
    }
    // Add to PATH for this session
    const home = process.env.HOME ?? ''
    process.env.PATH = `${process.env.PATH}:${home}/.maestro/bin`
  }

  // Check flows exist
  const flows = await runner.glob(`${opts.flowDir}/*.yaml`)
  if (flows.length === 0) {
    return { total: 0, passed: 0, failed: 0, results: [], error: 'No Maestro flow files found' }
  }

  // Snapshot crash log count before launching — use wildcard to match any app name
  const crashDir = `${process.env.HOME}/Library/Logs/DiagnosticReports`
  const crashLogsBefore = await runner.glob(`${crashDir}/*.ips`).catch(() => [] as string[])

  let appId = opts.appId ?? ''
  let simId = opts.simulatorId ?? ''

  if (!appId && opts.platform === 'kotlin-compose') {
    // Kotlin Compose: install APK on Android emulator
    const apkGlob = await runner.glob(`${opts.projectDir}/app/build/outputs/apk/debug/*.apk`)
    if (apkGlob.length === 0) {
      return { total: 0, passed: 0, failed: 0, results: [], error: 'No debug APK found. Run buildKotlin() first.' }
    }
    // Infer applicationId from app/build.gradle.kts; fall back to default
    const gradleFile = `${opts.projectDir}/app/build.gradle.kts`
    if (await runner.exists(gradleFile)) {
      const content = await runner.readFile(gradleFile)
      const match = content.match(/applicationId\s*=\s*"([^"]+)"/)
      appId = match?.[1] ?? 'com.dtc.app'
    } else {
      appId = 'com.dtc.app'
    }
    // Ensure an Android emulator is running
    const emulatorSerial = await findOrBootEmulator(runner)
    if (!emulatorSerial) {
      return { total: 0, passed: 0, failed: 0, results: [], error: 'No Android emulator found and unable to boot one. Create an AVD or connect a device.' }
    }
    await runner.exec('adb', ['-s', emulatorSerial, 'install', '-r', apkGlob[0]])
    await runner.exec('adb', ['-s', emulatorSerial, 'shell', 'am', 'start', '-n', `${appId}/.MainActivity`])
    await new Promise(r => setTimeout(r, 3000))
  } else if (!appId) {
    // SwiftUI: find built .app and install on simulator
    const found = await findSimulatorAndApp(runner, opts.projectDir)
    if (!found) {
      return { total: 0, passed: 0, failed: 0, results: [], error: 'Could not find built .app or available simulator. Build the app first.' }
    }
    appId = found.appId
    simId = found.simId

    // Install app on simulator
    await runner.exec('xcrun', ['simctl', 'install', simId, found.appPath])

    // Launch app
    await runner.exec('xcrun', ['simctl', 'launch', simId, appId])

    // Wait for app to start
    await new Promise(r => setTimeout(r, 2000))
  }

  await runner.exec('mkdir', ['-p', opts.reportDir])
  const junitPath = `${opts.reportDir}/maestro-results.xml`
  const maestroTimeout = opts.timeoutMs ?? 300_000 // 5 minutes default
  const result = await runner.exec('maestro', [
    'test',
    opts.flowDir,
    '--format', 'junit',
    '--output', junitPath,
    ...(appId ? ['-e', `APP_ID=${appId}`] : []),
    ...(simId ? ['--udid', simId] : []),
  ], {
    cwd: opts.projectDir,
    env: { APP_ID: appId },
    timeout: maestroTimeout,
  })

  // If Maestro was killed by timeout, report it cleanly
  if (result.exitCode === 124) {
    // Clean up: terminate the app so it doesn't leak resources
    if (simId) {
      await runner.exec('xcrun', ['simctl', 'terminate', simId, appId]).catch(() => {})
    }
    return {
      total: flows.length, passed: 0, failed: flows.length,
      results: [{ flowName: 'maestro-timeout', passed: false, duration: maestroTimeout, error: `Maestro timed out after ${Math.round(maestroTimeout / 1000)}s — possible memory leak. Try running fewer flows or restarting the simulator.`, assertions: [] }],
      error: `Maestro timed out after ${Math.round(maestroTimeout / 1000)}s`,
    }
  }

  // Check for runtime crashes FIRST — app may have crashed before Maestro produced any results
  const crashInfo = await detectRuntimeCrash(runner, crashDir, crashLogsBefore, appId)

  // Find JUNIT XML files
  const xmlFiles = await runner.glob(`${opts.reportDir}/*.xml`)

  if (xmlFiles.length === 0) {
    // No JUNIT results — if we detected a crash, report it
    if (crashInfo) {
      return {
        total: 1, passed: 0, failed: 1,
        results: [{ flowName: 'runtime-crash', passed: false, duration: 0, error: crashInfo, assertions: [] }],
        error: crashInfo,
      }
    }
    return { total: 0, passed: 0, failed: 0, results: [], error: result.stderr || 'No JUNIT results found' }
  }

  // Parse all JUNIT files
  let total = 0
  let passed = 0
  let failed = 0
  const allResults: FlowResult[] = []

  for (const xmlFile of xmlFiles) {
    const xml = await runner.readFile(xmlFile)
    const parsed = parseJunitXml(xml)
    total += parsed.total
    passed += parsed.passed
    failed += parsed.failed
    allResults.push(...parsed.results)
  }

  // Append crash info to results if we also got JUNIT data
  if (crashInfo) {
    allResults.push({ flowName: 'runtime-crash', passed: false, duration: 0, error: crashInfo, assertions: [] })
    failed++
    total++
  }

  // If UI tests failed, capture the accessibility hierarchy for the fix loop
  let hierarchy: string | undefined
  if (failed > 0) {
    const hierResult = await runner.exec('maestro', ['hierarchy', '--compact'], {
      cwd: opts.projectDir,
      timeout: 15_000,
    })
    if (hierResult.exitCode === 0) {
      hierarchy = hierResult.stdout
    }
  }

  // Clean up: terminate the app to free simulator resources
  if (simId && appId) {
    await runner.exec('xcrun', ['simctl', 'terminate', simId, appId]).catch(() => {})
  }

  return { total, passed, failed, results: allResults, hierarchy }
}

async function detectRuntimeCrash(
  runner: Runner,
  crashDir: string,
  crashLogsBefore: string[],
  appId?: string,
): Promise<string | null> {
  try {
    // Match any .ips crash log — not just "App-*"
    const crashLogsAfter = await runner.glob(`${crashDir}/*.ips`)
    const newCrashLogs = crashLogsAfter.filter(f => !crashLogsBefore.includes(f))
    if (newCrashLogs.length === 0) return null

    // Parse the most recent crash log
    const latestCrash = newCrashLogs.sort().pop()!
    const content = await runner.readFile(latestCrash)

    // If we know the app ID, verify this crash is from our app
    if (appId) {
      // JSON .ips files have "bundleID" field; text format has "Identifier:"
      const isOurApp = content.includes(appId) ||
        content.includes(appId.split('.').pop() ?? '')  // match app name portion
      if (!isOurApp) return null
    }

    // Try JSON .ips format first (modern macOS/iOS)
    try {
      const json = JSON.parse(content)
      const exception = json.exception?.type ?? json.termination?.reason ?? ''
      const crashThread = json.threads?.find((t: { triggered?: boolean }) => t.triggered)
      const frames = crashThread?.frames ?? []
      const topFrame = frames.find((f: { sourceFile?: string }) => f.sourceFile?.endsWith('.swift'))
      const crashFrame = topFrame
        ? `${topFrame.sourceFile}:${topFrame.sourceLine ?? '?'} ${topFrame.symbol ?? ''}`
        : ''

      const parts = [
        'RUNTIME CRASH',
        exception ? `Exception: ${exception}` : '',
        crashFrame ? `At: ${crashFrame}` : '',
      ].filter(Boolean)

      if (parts.length > 1) return parts.join(' | ')
    } catch { /* not JSON — try text format below */ }

    // Legacy text .ips format
    const exceptionMatch = content.match(/Exception Type:\s*(.+)/)
    const terminationMatch = content.match(/Termination Reason:\s*(.+)/)

    // Find the crashing frame with source file info
    let crashFrame = ''
    const frameRegex = /sourceLine.*?(\d+).*?sourceFile.*?"([^"]+)".*?symbol.*?"([^"]+)"/g
    const match = frameRegex.exec(content)
    if (match) {
      crashFrame = `${match[2]}:${match[1]} ${match[3]}`
    }

    // Fallback: try the translated report format
    if (!crashFrame) {
      const translatedFrame = content.match(/Thread 0 Crashed[\s\S]*?\n.*?(\S+\.swift):(\d+)/)
      if (translatedFrame) {
        crashFrame = `${translatedFrame[1]}:${translatedFrame[2]}`
      }
    }

    const parts = [
      'RUNTIME CRASH',
      exceptionMatch ? `Exception: ${exceptionMatch[1].trim()}` : '',
      terminationMatch ? `Reason: ${terminationMatch[1].trim()}` : '',
      crashFrame ? `At: ${crashFrame}` : '',
    ].filter(Boolean)

    return parts.length > 1 ? parts.join(' | ') : null
  } catch {
    return null
  }
}
