import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Platform, DtcConfig, PrereqCheck, PrereqReport } from './types.js'
import { isFixtureMode } from './llm-fixture.js'

function which(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function execCapture(cmd: string, opts?: { stderr?: boolean }): string | null {
  try {
    // Merge stderr into stdout via shell redirection when needed (java -version writes to stderr)
    const finalCmd = opts?.stderr ? `${cmd} 2>&1` : cmd
    const result = execSync(finalCmd, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.trim()
  } catch {
    return null
  }
}

// ── Individual Checks ──

function checkMacOS(): PrereqCheck {
  const isDarwin = process.platform === 'darwin'
  return {
    name: 'macOS',
    description: 'macOS is required for SwiftUI development',
    severity: 'critical',
    status: isDarwin ? 'pass' : 'fail',
    message: isDarwin
      ? `${process.platform} ${execCapture('sw_vers -productVersion') ?? ''}`.trim()
      : `Current platform: ${process.platform}`,
    installHint: isDarwin
      ? undefined
      : 'SwiftUI development requires macOS. Use --platform kotlin-compose for non-Mac systems.',
  }
}

function checkXcode(): PrereqCheck {
  const has = which('xcodebuild')
  let version = ''
  if (has) {
    const raw = execCapture('xcodebuild -version')
    version = raw?.split('\n')[0] ?? ''
  }
  return {
    name: 'Xcode',
    description: 'Xcode build tools for SwiftUI compilation',
    severity: 'critical',
    status: has ? 'pass' : 'fail',
    message: has ? version : 'xcodebuild not found',
    installHint: 'Install Xcode from the App Store, then run: sudo xcode-select --install',
  }
}

function checkXcodegen(): PrereqCheck {
  const has = which('xcodegen')
  return {
    name: 'xcodegen',
    description: 'Generates .xcodeproj from project.yml',
    severity: 'critical',
    status: has ? 'pass' : 'fail',
    message: has ? 'installed' : 'not found',
    installHint: 'brew install xcodegen',
  }
}

function checkSimulatorRuntime(): PrereqCheck {
  try {
    const raw = execCapture('xcrun simctl list runtimes -j')
    if (!raw)
      return {
        name: 'iOS Simulator',
        description: '',
        severity: 'critical',
        status: 'fail',
        message: 'Could not query simulator runtimes',
        installHint: 'Install Xcode first, then: open Xcode > Settings > Platforms > Download iOS',
      }

    const data = JSON.parse(raw) as {
      runtimes: Array<{ name: string; isAvailable: boolean; identifier: string }>
    }
    const iosRuntimes = data.runtimes.filter((r) => r.isAvailable && r.identifier.includes('iOS'))

    if (iosRuntimes.length === 0) {
      return {
        name: 'iOS Simulator',
        description: 'iOS simulator runtime for testing',
        severity: 'critical',
        status: 'fail',
        message: 'No iOS simulator runtime installed',
        installHint: 'Open Xcode > Settings > Platforms > Download an iOS simulator runtime',
      }
    }
    return {
      name: 'iOS Simulator',
      description: 'iOS simulator runtime for testing',
      severity: 'critical',
      status: 'pass',
      message: iosRuntimes[0].name,
    }
  } catch {
    return {
      name: 'iOS Simulator',
      description: 'iOS simulator runtime for testing',
      severity: 'critical',
      status: 'fail',
      message: 'Could not detect simulator runtimes (is Xcode installed?)',
      installHint: 'Install Xcode, then: open Xcode > Settings > Platforms > Download iOS',
    }
  }
}

function checkJava(): PrereqCheck {
  const raw = execCapture('java -version', { stderr: true })
  if (!raw) {
    return {
      name: 'Java 17+',
      description: 'Java runtime for Gradle builds',
      severity: 'critical',
      status: 'fail',
      message: 'java not found',
      installHint: 'brew install openjdk@17',
    }
  }

  const match = raw.match(/version "(\d+)/)
  const major = match ? parseInt(match[1], 10) : 0
  if (major < 17) {
    return {
      name: 'Java 17+',
      description: 'Java runtime for Gradle builds',
      severity: 'critical',
      status: 'fail',
      message: `Java ${major} found — version 17+ required`,
      installHint: 'brew install openjdk@17',
    }
  }
  return {
    name: 'Java 17+',
    description: 'Java runtime for Gradle builds',
    severity: 'critical',
    status: 'pass',
    message: `Java ${major}`,
  }
}

function checkAndroidSdk(): PrereqCheck {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!home) {
    return {
      name: 'Android SDK',
      description: 'Android SDK for Kotlin Compose builds',
      severity: 'critical',
      status: 'fail',
      message: 'ANDROID_HOME not set',
      installHint: 'Install Android Studio from developer.android.com/studio — it includes the SDK',
    }
  }
  const hasPlatformTools = existsSync(`${home}/platform-tools`)
  if (!hasPlatformTools) {
    return {
      name: 'Android SDK',
      description: 'Android SDK for Kotlin Compose builds',
      severity: 'critical',
      status: 'fail',
      message: `ANDROID_HOME=${home} but platform-tools/ missing`,
      installHint: 'Open Android Studio > SDK Manager > install Android SDK Platform-Tools',
    }
  }
  return {
    name: 'Android SDK',
    description: 'Android SDK for Kotlin Compose builds',
    severity: 'critical',
    status: 'pass',
    message: home,
  }
}

function checkGradle(): PrereqCheck {
  // Projects ship their own gradlew wrapper, so global `gradle` is optional.
  // Android SDK via Android Studio includes a bundled Gradle distribution.
  const has = which('gradle')
  return {
    name: 'Gradle',
    description: 'Build system for Kotlin Compose (projects use gradlew wrapper)',
    severity: 'warning',
    status: has ? 'pass' : 'fail',
    message: has
      ? 'installed globally'
      : 'Not installed globally (projects will use bundled gradlew wrapper)',
    installHint: 'Optional: brew install gradle',
  }
}

function checkAndroidDevice(): PrereqCheck {
  // Check for running emulator or connected device
  const adbOutput = execCapture('adb devices')
  if (adbOutput) {
    const lines = adbOutput.split('\n').filter((l) => l.includes('device') && !l.startsWith('List'))
    if (lines.length > 0) {
      return {
        name: 'Android device',
        description: 'Emulator or physical device for testing',
        severity: 'critical',
        status: 'pass',
        message: 'Device connected',
      }
    }
  }

  // Check for AVDs
  const avdOutput = execCapture('emulator -list-avds')
  if (avdOutput && avdOutput.trim().length > 0) {
    const avds = avdOutput.trim().split('\n').filter(Boolean)
    return {
      name: 'Android device',
      description: 'Emulator or physical device for testing',
      severity: 'critical',
      status: 'pass',
      message: `${avds.length} AVD(s) available (will auto-boot)`,
    }
  }

  return {
    name: 'Android device',
    description: 'Emulator or physical device for testing',
    severity: 'critical',
    status: 'fail',
    message: 'No emulator AVD or connected device found',
    installHint: 'Open Android Studio > Device Manager > Create a Virtual Device',
  }
}

function checkLlmAccess(config?: DtcConfig): PrereqCheck {
  // Phase 1 Plan 01-10 (GATE-02 fix): in fixture mode every LLM call is
  // replayed from a committed cassette — no provider key required.
  if (isFixtureMode()) {
    return {
      name: 'LLM access',
      description: 'AI model for code generation',
      severity: 'critical',
      status: 'pass',
      message: 'fixture mode (no key required)',
    }
  }
  if (!config) {
    return {
      name: 'LLM access',
      description: 'AI model for code generation',
      severity: 'critical',
      status: 'fail',
      message: 'No configuration found',
      installHint: 'Run `dtc setup` to configure your LLM provider',
    }
  }

  const { provider, apiKey } = config.llm
  if (provider === 'claude-cli') {
    const has = which('claude')
    return {
      name: 'LLM access',
      description: 'AI model for code generation',
      severity: 'critical',
      status: has ? 'pass' : 'fail',
      message: has ? 'Claude CLI available' : 'claude CLI not found',
      installHint: 'Install Claude Code: npm install -g @anthropic-ai/claude-code',
    }
  }

  if (provider === 'copilot') {
    return {
      name: 'LLM access',
      description: 'AI model for code generation',
      severity: 'critical',
      status: 'pass',
      message: 'GitHub Copilot (OAuth configured)',
    }
  }

  const hasKey = !!apiKey && apiKey.length > 0
  return {
    name: 'LLM access',
    description: 'AI model for code generation',
    severity: 'critical',
    status: hasKey ? 'pass' : 'fail',
    message: hasKey ? `${provider} API key configured` : `${provider} API key missing`,
    installHint: 'Run `dtc setup` to configure your API key',
  }
}

function checkDesignTool(config?: DtcConfig): PrereqCheck {
  if (!config) {
    return {
      name: 'Design tool',
      description: 'UI design generation tool',
      severity: 'warning',
      status: 'skip',
      message: 'Run `dtc setup` to configure',
    }
  }

  const { tool } = config.design
  if (tool === 'pencil') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const has = existsSync(
      `/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-${arch}`,
    )
    return {
      name: 'Design tool',
      description: 'Pencil design application',
      severity: 'warning',
      status: has ? 'pass' : 'fail',
      message: has ? 'Pencil installed' : 'Pencil app not found',
      installHint: 'Install from https://pencil.li',
    }
  }

  if (tool === 'stitch') {
    const hasKey = !!config.design.apiKey
    return {
      name: 'Design tool',
      description: 'Google Stitch API',
      severity: 'warning',
      status: hasKey ? 'pass' : 'fail',
      message: hasKey ? 'Stitch API key configured' : 'Stitch API key missing',
      installHint: 'Run `dtc setup` and enter your Stitch API key',
    }
  }

  // figma-make
  const hasToken = !!config.design.figmaToken
  return {
    name: 'Design tool',
    description: 'Figma Make integration',
    severity: 'warning',
    status: hasToken ? 'pass' : 'fail',
    message: hasToken ? 'Figma token configured' : 'Figma token missing',
    installHint: 'Run `dtc setup` and enter your Figma Personal Access Token',
  }
}

function checkMaestro(): PrereqCheck {
  const has = which('maestro')
  return {
    name: 'Maestro',
    description: 'UI test runner (auto-installs if missing)',
    severity: 'warning',
    status: has ? 'pass' : 'fail',
    message: has ? 'installed' : 'Not installed (will auto-install during pipeline)',
    installHint: 'curl -Ls "https://get.maestro.mobile.dev" | bash',
  }
}

function checkSemgrep(): PrereqCheck {
  const has = which('semgrep')
  return {
    name: 'Semgrep',
    description: 'Security scanner',
    severity: 'warning',
    status: has ? 'pass' : 'fail',
    message: has ? 'installed' : 'Not installed (security scan will be skipped)',
    installHint: 'pipx install semgrep',
  }
}

function checkAgentCli(config?: DtcConfig): PrereqCheck {
  if (!config?.agent || config.agent.type === 'api') {
    return {
      name: 'Agent CLI',
      description: 'AI agent CLI for code generation',
      severity: 'info',
      status: 'skip',
      message: 'Using API mode (no agent CLI needed)',
    }
  }

  const type = config.agent.type
  if (type === 'auto') {
    const hasClaude = which('claude')
    const hasCodex = which('codex')
    const hasGemini = which('gemini')
    const found = [hasClaude && 'claude', hasCodex && 'codex', hasGemini && 'gemini'].filter(
      Boolean,
    )
    return {
      name: 'Agent CLI',
      description: 'AI agent CLI for code generation',
      severity: 'info',
      status: found.length > 0 ? 'pass' : 'fail',
      message:
        found.length > 0
          ? `Available: ${found.join(', ')}`
          : 'No agent CLI found (will fall back to API)',
      installHint: 'Install one: npm i -g @anthropic-ai/claude-code, or npx codex, or gemini',
    }
  }

  const has = which(type)
  return {
    name: 'Agent CLI',
    description: `${type} CLI for code generation`,
    severity: 'info',
    status: has ? 'pass' : 'fail',
    message: has ? `${type} installed` : `${type} not found`,
    installHint:
      type === 'claude'
        ? 'npm install -g @anthropic-ai/claude-code'
        : type === 'codex'
          ? 'npm install -g @openai/codex'
          : type === 'gemini'
            ? 'npm install -g @anthropic-ai/gemini-cli'
            : `Install ${type}`,
  }
}

// ── Main Entry Points ──

function buildChecks(
  platform: Platform,
  config?: DtcConfig,
  criticalOnly?: boolean,
): PrereqCheck[] {
  const checks: PrereqCheck[] = []

  if (platform === 'swiftui') {
    checks.push(checkMacOS())
    checks.push(checkXcode())
    checks.push(checkXcodegen())
    checks.push(checkSimulatorRuntime())
  }

  if (platform === 'kotlin-compose') {
    checks.push(checkJava())
    checks.push(checkAndroidSdk())
    checks.push(checkGradle())
    checks.push(checkAndroidDevice())
  }

  checks.push(checkLlmAccess(config))

  if (!criticalOnly) {
    checks.push(checkDesignTool(config))
    checks.push(checkMaestro())
    checks.push(checkSemgrep())
    checks.push(checkAgentCli(config))
  }

  return checks
}

function buildReport(platform: Platform, checks: PrereqCheck[]): PrereqReport {
  return {
    platform,
    checks,
    hasCriticalFailures: checks.some((c) => c.status === 'fail' && c.severity === 'critical'),
    hasWarnings: checks.some((c) => c.status === 'fail' && c.severity === 'warning'),
  }
}

export function checkPrerequisites(platform: Platform, config?: DtcConfig): PrereqReport {
  const checks = buildChecks(platform, config, false)
  return buildReport(platform, checks)
}

export function checkCriticalPrerequisites(platform: Platform, config?: DtcConfig): PrereqReport {
  const checks = buildChecks(platform, config, true)
  return buildReport(platform, checks)
}
