import type { Runner } from '@appifex/core'

export interface AscCredentials {
  keyId: string
  issuerId: string
  keyPath: string
}

export interface AscResult {
  success: boolean
  output?: string
  error?: string
}

export interface AppInfo {
  id: string
  name: string
  bundleId: string
}

export interface SubmitTestFlightOpts {
  /** Numeric App Store Connect app ID (e.g. "123456789") */
  appId: string
  /** Path to the .ipa file */
  ipaPath: string
  /** TestFlight beta group name to distribute to (e.g. "App Store Connect Users") */
  group?: string
  /** Block until processing is complete (default: true) */
  wait?: boolean
}

export class AscClient {
  constructor(
    private runner: Runner,
    private creds: AscCredentials,
  ) {}

  /** Environment variables for asc CLI authentication (rudrankriyam/App-Store-Connect-CLI) */
  private env(): Record<string, string> {
    return {
      ASC_KEY_ID: this.creds.keyId,
      ASC_ISSUER_ID: this.creds.issuerId,
      ASC_PRIVATE_KEY_PATH: this.creds.keyPath,
      ASC_BYPASS_KEYCHAIN: '1',
      ASC_NO_UPDATE: '1',
    }
  }

  /** Upload and distribute an IPA to TestFlight via `asc publish testflight` */
  async submitTestFlight(opts: SubmitTestFlightOpts): Promise<AscResult> {
    const args = [
      'publish', 'testflight',
      '--app', opts.appId,
      '--ipa', opts.ipaPath,
      '--group', opts.group ?? 'App Store Connect Users',
    ]
    if (opts.wait !== false) args.push('--wait')

    const result = await this.runner.exec('asc', args, {
      env: this.env(),
      timeout: 600_000, // uploads can take a while
    })

    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr || result.stdout }
    }
    return { success: true, output: result.stdout }
  }

  /** List all apps via `asc apps list --output json` */
  async listApps(): Promise<AppInfo[]> {
    const result = await this.runner.exec('asc', [
      'apps', 'list', '--output', 'json', '--pretty',
    ], { env: this.env() })

    if (result.exitCode !== 0) return []
    try {
      return JSON.parse(result.stdout) as AppInfo[]
    } catch {
      return []
    }
  }

  /** List provisioning profiles via `asc profiles list` */
  async listProfiles(): Promise<AscResult> {
    const result = await this.runner.exec('asc', [
      'profiles', 'list',
    ], { env: this.env() })

    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr }
    }
    return { success: true, output: result.stdout }
  }

  /** Get the next valid build number for an app */
  async nextBuildNumber(appId: string): Promise<string | undefined> {
    const result = await this.runner.exec('asc', [
      'builds', 'next-build-number', '--app', appId,
    ], { env: this.env() })

    if (result.exitCode !== 0) return undefined
    return result.stdout.trim()
  }
}
