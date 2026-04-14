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
}
