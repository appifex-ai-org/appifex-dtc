export { buildSwift, archiveSwift, deriveAppName, patchProjectDependencies } from './swift.js'
export { swiftPrecheck, swiftAutofix } from './swift-precheck.js'
export { findBestSimulator, findOrBootBestSimulator } from './simulator.js'
export type { PrecheckIssue, PrecheckResult } from './swift-precheck.js'
export { buildKotlin, bundleKotlin, patchBuildGradle } from './kotlin.js'
export type { KotlinBuildOpts } from './kotlin.js'
export { findBestEmulator, findOrBootEmulator } from './emulator.js'
export type {
  BuildOpts,
  SwiftBuildOpts,
  BuildResult,
  BuildError,
  ArchiveOpts,
  ArchiveResult,
  BundleOpts,
  BundleResult,
} from './types.js'
// Phase 5 (TF-01 D-01, TF-03): xcode_archive phase orchestrator
export { runXcodeArchivePhase } from './xcode-archive-phase.js'
export type {
  XcodeArchivePhaseOpts,
  XcodeArchivePhaseResult,
} from './xcode-archive-phase.js'
