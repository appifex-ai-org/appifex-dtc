export interface BuildOpts {
  projectDir: string
}

export interface SwiftBuildOpts extends BuildOpts {
  scheme: string
  destination?: string
}

export interface BuildError {
  file: string
  line?: number
  message: string
}

export interface BuildResult {
  success: boolean
  error?: string
  errors?: BuildError[]
  duration: number
  /** Shell commands that were executed during the build */
  commands?: string[]
}

export interface BundleOpts {
  projectDir: string
  /** Path to .jks or .keystore file */
  keystorePath: string
  keystorePassword: string
  keyAlias: string
  keyPassword: string
  /** Application ID (defaults to com.dtc.app) */
  applicationId?: string
}

export interface BundleResult {
  success: boolean
  /** Path to the .aab file */
  aabPath?: string
  error?: string
  duration: number
  commands?: string[]
}

export interface ArchiveOpts {
  projectDir: string
  scheme?: string
  /** Apple Developer Team ID for code signing */
  teamId: string
  /** Bundle identifier (e.g. com.example.app) */
  bundleId: string
  /** Export method: app-store for TestFlight/App Store, ad-hoc for direct install */
  exportMethod?: 'app-store' | 'ad-hoc' | 'development'
  // Phase 5 (TF-03 D-07): marketing version (CFBundleShortVersionString), e.g. "1.0.3".
  // Sourced by runXcodeArchivePhase (Plan 04) from the generated app's package.json "version" field.
  marketingVersion: string
  // Phase 5 (TF-03 D-06): build number (CFBundleVersion / CURRENT_PROJECT_VERSION), e.g. "47".
  // Sourced by runXcodeArchivePhase (Plan 04) from ASC REST max + 1 via computeNextBuildNumber.
  buildNumber: string
}

export interface ArchiveResult {
  success: boolean
  /** Path to the exported .ipa file */
  ipaPath?: string
  /** Path to the .xcarchive bundle */
  archivePath?: string
  error?: string
  duration: number
  commands?: string[]
  // Phase 5 (TF-03): echoed back so Plan 04 can populate the xcode_archive checkpoint row
  // and Plan 05 can pass matching values to altool --upload-package.
  marketingVersion: string
  buildNumber: string
}
