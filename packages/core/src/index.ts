export * from './types.js'
export * from './types-validation.js'
export { loadConfig, saveConfig } from './config.js'
export { ProgressEmitter, terminalProgressListener } from './progress.js'
export type { ProgressListener } from './progress.js'
export { TokenBudget, FIX_LOOP_MIN_RESERVE_RATIO } from './token-budget.js'
export type { BudgetSummary, TokenBreakdown } from './token-budget.js'
// Phase 7 (OBS-01 D-13): pricing table + token → USD helper
export { PRICING_USD_PER_MTOK, PRICING_AS_OF, tokensToUsd } from './pricing.js'
export type { KnownModel } from './pricing.js'
export { Checkpoint } from './checkpoint.js'
export {
  saveRunContext,
  loadRunContext,
  buildContextSummary,
  RunContextBuilder,
  PHASE_ORDER,
} from './run-context.js'
export { createDebugLogger } from './debug-logger.js'
export type { DebugLogger } from './debug-logger.js'
export {
  createFileSkillProvider,
  createBundledSkillProvider,
  getBundledSkillsDir,
} from './skill-loader.js'
export { buildBackendPromptSection } from './backend-context.js'
export { assessBaasAppropriateness, extractBaasSignals } from './baas-recommend.js'
export { checkPrerequisites, checkCriticalPrerequisites, which, checkFirebaseTools, checkServiceAccountJson, checkAscP8 } from './prerequisites.js'
export {
  writePreAgentSnapshotSidecar,
  readPreAgentSnapshotSidecar,
  recomputeAggregateSha256,
  SidecarCorruptError,
  type SnapshotSidecarPayload,
  type SnapshotSidecarMetadata,
} from './snapshot-sidecar.js'
export { isFixtureMode, loadFixture, FixtureModeError } from './llm-fixture.js'
export type { FixtureResponse } from './llm-fixture.js'
// Phase 02 Plan 01 (FOUND-04): typed CliError hierarchy
// Phase 5 (TF-01, TF-04 D-05): ArchiveError + TestFlightError appended
// Phase 6 (VAL-01 D-06): E2eGateError appended
export {
  CliError,
  PreflightError,
  ConfigError,
  ResumeAbortError,
  BudgetExhaustedError,
  EpipeError,
  ProvisionError,
  SecurityLintError,
  ArchiveError,
  TestFlightError,
  E2eGateError,
} from './errors.js'
// Phase 03 Plan 01 (SETUP-02): CredentialRegistry + ASC JWT helpers
export * from './credential-registry.js'
export * from './asc-jwt.js'
// Phase 7 (MCP-03 D-09..D-12): manifest read/write/diff + path guard
export {
  readManifest,
  writeManifest,
  diffManifest,
  computeSha256,
  isExcluded,
  MANIFEST_FILENAME,
  MANIFEST_EXCLUDE_GLOBS,
} from './manifest.js'
export type { Manifest, ManifestEntry, ManifestDiff } from './manifest.js'
// Phase 7 (OBS-03 D-16): debug bundle writer + secrets scrubber
export { writeDebugBundle, scrub, SECRET_PATTERNS } from './debug-bundle.js'
export type { WriteDebugBundleOptions } from './debug-bundle.js'
