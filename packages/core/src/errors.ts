/**
 * Phase 02 Plan 01 (FOUND-04): Typed error hierarchy for the CLI / pipeline.
 *
 * Motivation: the MCP server used to die whenever a pipeline phase called
 * `process.exit(...)`. By throwing a `CliError` subclass instead, non-entry
 * code can signal failure without killing the host process. The top-level
 * entry.ts catch translates CliErrors to `process.exit(err.exitCode)` only
 * in the CLI binary context, while the MCP server tool wrapper translates
 * them into an MCP error envelope (`{ isError: true, content: [...] }`).
 *
 * Precedent pattern: SidecarCorruptError (packages/core/src/snapshot-sidecar.ts),
 * FixtureModeError (packages/core/src/llm-fixture.ts).
 */

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
  ) {
    super(message)
    this.name = 'CliError'
  }
}

export class PreflightError extends CliError {
  constructor(
    message: string,
    public readonly check?: string,
  ) {
    super(message, 1)
    this.name = 'PreflightError'
  }
}

export class ConfigError extends CliError {
  constructor(
    message: string,
    public readonly configKey?: string,
  ) {
    super(message, 1)
    this.name = 'ConfigError'
  }
}

export class ResumeAbortError extends CliError {
  constructor(message: string) {
    super(message, 1)
    this.name = 'ResumeAbortError'
  }
}

export class BudgetExhaustedError extends CliError {
  constructor(
    message: string,
    public readonly totalBudget: number,
    public readonly remaining: number,
    public readonly requiredRatio: number,
  ) {
    super(message, 1)
    this.name = 'BudgetExhaustedError'
  }
}

/**
 * Placeholder for Phase 02 Plan 03 (FOUND-03) — declared here so all error
 * types are co-located. Plan 03 will wire this into EPIPE-sensitive call sites.
 */
export class EpipeError extends CliError {
  constructor(
    message: string,
    public readonly site: string,
    public readonly payloadBytes: number,
  ) {
    super(message, 1)
    this.name = 'EpipeError'
  }
}

// Phase 4 (FIRE-04): thrown by firebase_provision phase on firebase-tools or admin SDK failure
export class ProvisionError extends CliError {
  constructor(message: string) {
    super(message, 1)
    this.name = 'ProvisionError'
  }
}

// Phase 4 (FIRE-05): thrown when security lint blocks rules deployment
export class SecurityLintError extends CliError {
  constructor(
    message: string,
    public readonly violations?: string[],
  ) {
    super(message, 1)
    this.name = 'SecurityLintError'
  }
}

// Phase 5 (TF-01 D-05): thrown by xcode_archive phase on xcodebuild/xcodegen/mutator failure
export class ArchiveError extends CliError {
  constructor(message: string) {
    super(message, 1)
    this.name = 'ArchiveError'
  }
}

// Phase 5 (TF-04 D-05): thrown by testflight_upload phase on altool/ASC REST failure (non-soft-fail — D-17)
export class TestFlightError extends CliError {
  constructor(
    message: string,
    public readonly itmsCode?: string,
  ) {
    super(message, 1)
    this.name = 'TestFlightError'
  }
}

// Phase 6 (VAL-01 D-06): thrown by e2e_gate phase on Maestro failure when --skip-validation-gate is not set.
// Soft-fail per D-16: the phase handler catches this in the pipeline and either (a) rethrows to block
// xcode_archive, or (b) records in report and continues when --skip-validation-gate is true.
export class E2eGateError extends CliError {
  constructor(
    message: string,
    public readonly flowFile?: string,
    public readonly maestroError?: string,
  ) {
    super(message, 1)
    this.name = 'E2eGateError'
  }
}
