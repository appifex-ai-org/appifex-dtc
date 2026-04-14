import type { Platform } from './types-design.js'
import type { BaasIntegrationViolation, ParityViolation } from './types-validation.js'

// ── Test Types ──
export interface MaestroFlow {
  name: string
  screenId: string
  fileName: string
  content: string
}

export interface TestFile {
  fileName: string
  content: string
  platform: Platform
  testCount: number
}

export interface FlowResult {
  flowName: string
  passed: boolean
  duration: number
  error?: string
  screenshot?: string
  assertions: AssertionResult[]
}

export interface AssertionResult {
  type: string
  passed: boolean
  message?: string
}

export interface UnitTestFailure {
  testName: string
  suiteName: string
  error: string
  file?: string
  line?: number
}

// ── Security Scanning ──
export interface SemgrepFinding {
  ruleId: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  file: string
  line: number
  endLine?: number
  column?: number
}

export interface SemgrepResult {
  total: number
  passed: number
  failed: number
  findings: SemgrepFinding[]
  error?: string
}

export interface ValidationReport {
  platform: Platform
  timestamp: string
  uiTests: { total: number; passed: number; failed: number; results: FlowResult[] }
  unitTests: { total: number; passed: number; failed: number; failures: UnitTestFailure[] }
}

// ── Fix Loop ──
export type FixStatus = 'all_green' | 'partial' | 'stuck' | 'budget_exceeded' | 'timeout'
export type CircuitBreakReason = 'max_attempts' | 'same_error_repeated' | 'no_progress' | 'budget_exceeded' | 'regression' | 'timeout'
export type FixRecommendation = 'manual_fix' | 'simplify_design' | 'relax_tests' | 'split_and_retry' | 'add_budget'

export interface FixAttempt {
  attempt: number
  model: string
  filesChanged: string[]
  testsBefore: { passed: number; total: number }
  testsAfter: { passed: number; total: number }
  tokensUsed: number
  duration: number
}

export interface FixResult {
  status: FixStatus
  attempts: FixAttempt[]
  unresolvedFailures: Array<FlowResult | UnitTestFailure | BaasIntegrationViolation | ParityViolation>
  rollbackApplied: boolean
  recommendation?: FixRecommendation
  circuitBreakReason?: CircuitBreakReason
  totalTokensUsed: number
  totalDuration: number
}

// ── Runner ──
export interface ExecResult {
  /** The shell command that was executed (e.g. "xcodebuild -scheme App build") */
  command: string
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

export interface ExecOpts {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
}

export interface RunnerCapabilities {
  hasMaestro: boolean
  hasXcode: boolean
  hasNode: boolean
  hasSemgrep: boolean
  hasXcodegen: boolean
  hasJava: boolean
  hasAndroidSdk: boolean
  hasGradle: boolean
  hasAdb: boolean
  hasEmulator: boolean
  platform: 'darwin' | 'linux'
}

// ── Prerequisite Checks ──
export type CheckSeverity = 'critical' | 'warning' | 'info'
export type CheckStatus = 'pass' | 'fail' | 'skip'

export interface PrereqCheck {
  name: string
  description: string
  severity: CheckSeverity
  status: CheckStatus
  message: string
  installHint?: string
}

export interface PrereqReport {
  platform: import('./types-design.js').Platform
  checks: PrereqCheck[]
  hasCriticalFailures: boolean
  hasWarnings: boolean
}

export interface Runner {
  exec(command: string, args: string[], opts?: ExecOpts): Promise<ExecResult>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  glob(pattern: string): Promise<string[]>
  capabilities: RunnerCapabilities
}
