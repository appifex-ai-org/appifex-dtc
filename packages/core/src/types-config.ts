import type { PhaseId, AgentConfig } from './types-pipeline.js'
import type { BaasConfig } from './types-validation.js'

// ── Config ──
export interface DeliverConfig {
  /** Remote repository URL */
  remoteUrl?: string
  /** GitHub owner/repo (inferred from remoteUrl if omitted) */
  repo?: { owner: string; repo: string }
  /** Base branch for PRs (default: main) */
  baseBranch?: string
  /** Git user name for commits */
  userName?: string
  /** Git user email for commits */
  userEmail?: string
  /** Skip PR creation (just commit and push) */
  skipPr?: boolean
  /** Skip push (just commit locally) */
  skipPush?: boolean
  /** Auto-merge the PR when all tests are green (default: false) */
  autoMerge?: boolean
  /** Merge method for auto-merge (default: squash) */
  mergeMethod?: 'squash' | 'merge' | 'rebase'
  /** Visibility for auto-created repos (default: private) */
  repoVisibility?: 'private' | 'public'
  /** Delete branch after merge (default: true) */
  deleteBranchOnMerge?: boolean
}

// Phase 03 Plan 03 (SETUP-01): ProjectConfig added to resolve RESEARCH OQ#3 (eliminates 'MyApp' literal).
export interface ProjectConfig {
  appName: string
  projectDir: string
}

// Phase 03 Plan 03 (SETUP-01, D-07): OAuthConfig for Apple Sign In manual-paste section.
export interface OAuthConfig {
  apple?: {
    servicesId: string
    teamId: string
    keyId: string
    p8Path: string
  }
}

export interface DtcConfig {
  llm: LlmConfig
  design: DesignConfig
  runner: RunnerConfig
  apple?: AppleConfig
  android?: AndroidConfig
  deliver?: DeliverConfig
  tokenBudget?: TokenBudgetConfig
  /** Custom skills directory. If omitted, bundled skills are used. */
  skillsDir?: string
  /** Agent CLI configuration for single-session codegen+build+fix */
  agent?: AgentConfig
  /** BaaS provider configuration (Phase 19) */
  baas?: BaasConfig
  /** Phase 03 Plan 03 (SETUP-01): App name and project directory (first-run capture). */
  project?: ProjectConfig
  /** Phase 03 Plan 03 (SETUP-01, D-07): OAuth configuration for Apple Sign In. */
  oauth?: OAuthConfig
}

export interface LlmConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'copilot' | 'claude-cli'
  apiKey: string
  githubToken?: string
  model?: string
  fastModel?: string
}

export type DesignToolName = 'pencil' | 'stitch' | 'figma-make'

export interface DesignConfig {
  tool: DesignToolName
  mcpUrl?: string
  apiKey?: string
  /** Figma file URL for figma-make tool */
  figmaFileUrl?: string
  /** Figma OAuth token or Personal Access Token */
  figmaToken?: string
}

export interface DesignToolCreateOpts {
  prompt: string
  outputDir: string
  /** Explicit output file path — overrides adapter's default (e.g. design.pen) */
  outputPath?: string
  previewPath?: string
}

export interface DesignToolIterateOpts {
  prompt: string
  outputDir: string
  /** Explicit input file path for iteration — overrides adapter's default */
  inputPath?: string
  /** Explicit output file path — overrides adapter's default */
  outputPath?: string
  previewPath?: string
}

export interface DesignToolResult {
  success: boolean
  error?: string
  tool: DesignToolName
  outputDir: string
  /** Path to .pen file (Pencil only) */
  designFilePath?: string
  /** Screenshot images per screen */
  screenshotPaths: string[]
  /** HTML files per screen (Stitch, Figma Make) */
  htmlPaths: string[]
  /** Screen identifiers */
  screenIds: string[]
  previewPath?: string
}

export interface DesignToolAdapter {
  readonly tool: DesignToolName
  create(opts: DesignToolCreateOpts): Promise<DesignToolResult>
  iterate(opts: DesignToolIterateOpts): Promise<DesignToolResult>
}

export interface RunnerConfig {
  type: 'local' | 'e2b' | 'remote'
  sandboxId?: string
  runnerUrl?: string
  runnerToken?: string
}

export interface AppleConfig {
  teamId: string
  bundleId: string
  /** App Store Connect numeric app ID (e.g. "123456789") */
  ascAppId?: string
  ascKeyId?: string
  ascIssuerId?: string
  ascKeyPath?: string
  /** TestFlight beta group name (default: "App Store Connect Users") */
  ascTestFlightGroup?: string
}

export interface AndroidConfig {
  /** Path to Google Cloud service account JSON key file */
  serviceAccountKeyPath: string
  /** Android package name / application ID (e.g. "com.example.app") */
  packageName: string
  /** Path to release keystore (.jks or .keystore) — required for building from source */
  keystorePath?: string
  /** Keystore password */
  keystorePassword?: string
  /** Key alias within the keystore */
  keyAlias?: string
  /** Key password */
  keyPassword?: string
  /** Play Console track for submission (default: "internal") */
  playTrack?: string
}

export interface TokenBudgetConfig {
  total: number
  perPhase?: Partial<Record<PhaseId, number>>
}
