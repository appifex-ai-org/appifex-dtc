import type { Runner, Platform, UnitTestFailure } from '@appifex/core'
import { findOrBootEmulator } from '@appifex/build'
import { parseJunitXml } from './junit-parser.js'

export interface UnitTestOpts {
  platform: Platform
  projectDir: string
  testDir: string
  scheme?: string
}

export interface UnitTestResult {
  total: number
  passed: number
  failed: number
  failures: UnitTestFailure[]
}

export async function runUnitTests(runner: Runner, opts: UnitTestOpts): Promise<UnitTestResult> {
  if (opts.platform === 'swiftui') {
    return runXCTest(runner, opts)
  }
  return runKotlinTest(runner, opts)
}

async function runKotlinTest(runner: Runner, opts: UnitTestOpts): Promise<UnitTestResult> {
  // Copy any generated tests from testDir into the Gradle test source set
  const gradleTestDir = `${opts.projectDir}/app/src/test/java/com/dtc/app`
  const generatedTests = await runner.glob(`${opts.testDir}/*.kt`)
  if (generatedTests.length > 0) {
    const { mkdir } = await import('node:fs/promises')
    const { copyFile } = await import('node:fs/promises')
    const { basename } = await import('node:path')
    try { await mkdir(gradleTestDir, { recursive: true }) } catch { /* may exist */ }
    for (const src of generatedTests) {
      await copyFile(src, `${gradleTestDir}/${basename(src)}`)
    }
  }

  const unitTestFiles = await runner.glob(`${opts.projectDir}/app/src/test/**/*.kt`)
  if (unitTestFiles.length === 0) {
    return { total: 0, passed: 0, failed: 0, failures: [] }
  }

  const gradlew = await runner.exists(`${opts.projectDir}/gradlew`) ? './gradlew' : 'gradle'
  const result = await runner.exec(gradlew, ['test', '--no-daemon'], {
    cwd: opts.projectDir,
    timeout: 180_000,
  })

  const unitResult = parseGradleTestOutput(result, unitTestFiles.length)

  // Run instrumentation tests if androidTest sources exist and a device is available
  const androidTestFiles = await runner.glob(`${opts.projectDir}/app/src/androidTest/**/*.kt`)
  if (androidTestFiles.length > 0) {
    const emulatorSerial = await findOrBootEmulator(runner)
    if (emulatorSerial) {
      const instrResult = await runner.exec(gradlew, ['connectedAndroidTest', '--no-daemon'], {
        cwd: opts.projectDir,
        timeout: 300_000,
      })
      const instrParsed = parseGradleTestOutput(instrResult, androidTestFiles.length)
      return {
        total: unitResult.total + instrParsed.total,
        passed: unitResult.passed + instrParsed.passed,
        failed: unitResult.failed + instrParsed.failed,
        failures: [...unitResult.failures, ...instrParsed.failures],
      }
    }
    // No device available — skip instrumentation tests with a warning
  }

  return unitResult
}

function parseGradleTestOutput(result: { exitCode: number; stdout: string; stderr: string }, fallbackTotal: number): UnitTestResult {
  if (result.exitCode === 0) {
    const totalMatch = result.stdout.match(/(\d+) tests? completed/)
    const failedMatch = result.stdout.match(/(\d+) tests? failed/)
    const total = totalMatch ? parseInt(totalMatch[1], 10) : fallbackTotal
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0
    return { total, passed: total - failed, failed, failures: [] }
  }

  const failures: import('@appifex/core').UnitTestFailure[] = []
  const failRegex = /> (.+?)\.(\w+)\s+FAILED/g
  let match
  while ((match = failRegex.exec(result.stdout + result.stderr)) !== null) {
    failures.push({ testName: match[2], suiteName: match[1], error: `${match[1]}.${match[2]} FAILED` })
  }
  if (failures.length === 0 && result.exitCode !== 0) {
    failures.push({ testName: 'build', suiteName: 'gradle', error: result.stderr.slice(-500) || 'Test execution failed' })
  }

  return { total: Math.max(failures.length, 1), passed: 0, failed: Math.max(failures.length, 1), failures }
}

async function runXCTest(runner: Runner, opts: UnitTestOpts): Promise<UnitTestResult> {
  // Ensure test files are in Tests/ (xcodegen convention)
  const testSwiftFiles = await runner.glob(`${opts.testDir}/*.swift`)
  if (testSwiftFiles.length === 0) {
    return { total: 0, passed: 0, failed: 0, failures: [] }
  }
  const testsDir = `${opts.projectDir}/Tests`
  for (const file of testSwiftFiles) {
    const name = file.split('/').pop()!
    const content = await runner.readFile(file)
    await runner.writeFile(`${testsDir}/${name}`, content)
  }

  // Find the .xcodeproj
  const projs = await runner.glob(`${opts.projectDir}/*.xcodeproj`)
  if (projs.length === 0) {
    return { total: 0, passed: 0, failed: 0, failures: [{ testName: 'XCTest', suiteName: 'setup', error: 'No .xcodeproj found' }] }
  }
  const projName = projs[0].split('/').pop()!

  // Use the main App scheme — it includes the AppTests target
  const scheme = opts.scheme ?? 'App'

  // Auto-detect simulator
  let destination = 'generic/platform=iOS Simulator'
  const simResult = await runner.exec('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])
  if (simResult.exitCode === 0) {
    try {
      const data = JSON.parse(simResult.stdout) as { devices: Record<string, Array<{ name: string; udid: string; isAvailable: boolean }>> }
      for (const [runtime, devices] of Object.entries(data.devices).reverse()) {
        if (!runtime.includes('iOS')) continue
        const iphone = devices.find(d => d.isAvailable && d.name.includes('iPhone'))
        if (iphone) { destination = `platform=iOS Simulator,id=${iphone.udid}`; break }
      }
    } catch { /* use fallback */ }
  }

  // Regenerate xcodeproj to pick up test files copied to Tests/
  if (await runner.exists(`${opts.projectDir}/project.yml`)) {
    await runner.exec('xcodegen', ['generate', '--spec', 'project.yml'], { cwd: opts.projectDir })
  }

  // Remove old result bundle (xcodebuild fails if it exists)
  const resultBundle = `${opts.projectDir}/.build/results.xcresult`
  await runner.exec('rm', ['-rf', resultBundle])

  const result = await runner.exec('xcodebuild', [
    'test',
    '-project', projName,
    '-scheme', scheme,
    '-destination', destination,
    '-derivedDataPath', 'build',
    '-resultBundlePath', resultBundle,
  ], { cwd: opts.projectDir })

  // Parse test results from xcodebuild output
  const output = result.stdout + '\n' + result.stderr
  const testResults = parseXcodebuildOutput(output)
  if (testResults.total > 0) return testResults

  // Fallback: try xcresulttool
  const xcresult = await runner.exec('xcrun', [
    'xcresulttool', 'get', 'test-results', 'summary',
    '--path', resultBundle, '--format', 'json',
  ])
  if (xcresult.exitCode === 0) {
    try {
      return parseXcresultJson(xcresult.stdout)
    } catch { /* fall through */ }
  }

  // If build output has errors, report them
  if (result.exitCode !== 0) {
    const errors = output.match(/error: .+/g) ?? []
    return {
      total: 1, passed: 0, failed: 1,
      failures: [{ testName: 'XCTest', suiteName: scheme, error: errors.join('\n') || 'xcodebuild test failed' }],
    }
  }

  return { total: 0, passed: 0, failed: 0, failures: [] }
}

function parseXcodebuildOutput(output: string): UnitTestResult {
  // Parse lines like: "Test Case '-[AppTests.RequirementsTests testFoo]' passed (0.001 seconds)."
  const passRegex = /Test Case .+ passed/g
  const failRegex = /Test Case '-\[(\S+) (\S+)\]' failed/g
  const passed = (output.match(passRegex) ?? []).length

  const failures: UnitTestFailure[] = []
  let match: RegExpExecArray | null
  while ((match = failRegex.exec(output)) !== null) {
    failures.push({ testName: match[2], suiteName: match[1], error: 'Test failed' })
  }

  const total = passed + failures.length
  if (total === 0) return { total: 0, passed: 0, failed: 0, failures: [] }
  return { total, passed, failed: failures.length, failures }
}

function parseXcresultJson(json: string): UnitTestResult {
  const data = JSON.parse(json) as {
    testPlanSummary?: { testableSummaries?: Array<{
      tests?: Array<{ subtests?: Array<{ subtests?: Array<{
        name?: string; status?: string; identifier?: string
      }> }> }>
    }> }
  }

  let total = 0, passed = 0
  const failures: UnitTestFailure[] = []

  for (const testable of data.testPlanSummary?.testableSummaries ?? []) {
    for (const suite of testable.tests ?? []) {
      for (const group of suite.subtests ?? []) {
        for (const test of group.subtests ?? []) {
          total++
          if (test.status === 'Success') { passed++ }
          else { failures.push({ testName: test.name ?? 'unknown', suiteName: test.identifier ?? '', error: test.status ?? 'failed' }) }
        }
      }
    }
  }

  return { total, passed, failed: failures.length, failures }
}

