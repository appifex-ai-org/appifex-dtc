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
