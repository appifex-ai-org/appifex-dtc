// Phase 03 Plan 03 (SETUP-01, D-10): dtc setup <section> | --full command surface.
import { CliError } from '@appifex/core'

export const COMMANDS = [
  'design',
  'spec',
  'test-gen',
  'codegen',
  'build',
  'validate',
  'security',
  'fix',
  'provision',
  'deliver',
  'report',
  'setup',
  'run',
  'doctor',
] as const

export type Command = (typeof COMMANDS)[number] | 'help' | 'version'

const SUBCOMMAND_COMMANDS = new Set(['spec', 'test-gen', 'provision'])

/**
 * Valid section names for `dtc setup <section>`.
 * 'firebase' is accepted even before plan 03-04 lands so the dispatcher is ready.
 */
const VALID_SETUP_SECTIONS = new Set([
  'project',
  'llm',
  'design',
  'runner',
  'apple',
  'android',
  'deliver',
  'budget',
  'oauth',
  'firebase',
])

export interface ParsedArgs {
  command: Command
  subcommand?: string
  positional: string[]
  flags: Record<string, string | boolean>
  /**
   * Phase 1 Plan 07 (GATE-02, fallback path for spike outcome (b)/(c)):
   * Path to a pre-extracted `design-ir.json` (PlatformSpec + DesignTokens).
   * When set, the pipeline skips the Pencil-MCP design phase entirely.
   * Mutually exclusive with `--design`.
   */
  designIrPath?: string
  /**
   * Phase 03 Plan 03 (SETUP-01, D-10): setup section name.
   * Set when `dtc setup <section>` is called with a valid section name.
   */
  section?: string
  /**
   * Phase 03 Plan 03 (SETUP-01, D-10): force all sections flag.
   * See SetupWizardOpts.full for semantics.
   */
  full?: boolean
  /**
   * Phase 03 Plan 05 (SETUP-03, D-12): --deep flag for `dtc doctor`.
   * When true, doctor runs live credential probes via runCredentialChecks.
   */
  deep?: boolean

  /**
   * Phase 7 (MCP-03 D-10): --overwrite-user-edits bypasses the user-edit preservation gate.
   * When true, pipeline rewrites files that have been modified since the last manifest sha256.
   */
  overwriteUserEdits?: boolean

  /**
   * Phase 7 (OBS-03 D-16): --export-debug-bundle forces bundle creation even on green runs
   * (for bug reporting without a crash).
   */
  exportDebugBundle?: boolean
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0 || argv[0] === '--help') {
    return { command: 'help', positional: [], flags: {} }
  }
  if (argv[0] === '--version') {
    return { command: 'version', positional: [], flags: {} }
  }

  const command = argv[0] as Command
  const rest = argv.slice(1)

  let subcommand: string | undefined
  let startIdx = 0

  // Check if this command has subcommands and next arg isn't a flag
  if (SUBCOMMAND_COMMANDS.has(command) && rest.length > 0 && !rest[0].startsWith('-')) {
    subcommand = rest[0]
    startIdx = 1
  }

  // Phase 03 Plan 03 (SETUP-01, D-10): parse setup section + --full flag
  let section: string | undefined
  let full = false

  if (command === 'setup') {
    // First non-flag arg after 'setup' is the optional section name
    if (rest.length > 0 && !rest[0].startsWith('-')) {
      const candidateSection = rest[0]
      if (!VALID_SETUP_SECTIONS.has(candidateSection)) {
        throw new CliError(
          `Unknown section: "${candidateSection}". Valid sections: ${[...VALID_SETUP_SECTIONS].join(', ')}`,
        )
      }
      section = candidateSection
      startIdx = 1
    }
    // Check for --full in remaining args
    if (rest.includes('--full')) {
      full = true
    }
  }

  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (let i = startIdx; i < rest.length; i++) {
    const arg = rest[i]

    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rest[i + 1]

      if (next === undefined || next.startsWith('-')) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else if (command !== 'setup') {
      // For non-setup commands, collect positional args normally
      positional.push(arg)
    }
    // For setup command, skip the section arg (already captured above)
  }

  // Phase 1 Plan 07 (GATE-02): hoist --design-ir into a typed field on
  // ParsedArgs so the pipeline can route around the Pencil-MCP design phase
  // when the spike fallback (outcome (b)/(c)) is in effect. Mutually exclusive
  // with --design — passing both is a usage error.
  const rawDesign = flags.design
  const rawDesignIr = flags['design-ir']
  if (typeof rawDesign === 'string' && typeof rawDesignIr === 'string') {
    throw new Error('Pass exactly one of --design or --design-ir')
  }
  const designIrPath = typeof rawDesignIr === 'string' ? rawDesignIr : undefined

  // Phase 03 Plan 05 (SETUP-03, D-12): --deep flag for `dtc doctor`.
  const deep = command === 'doctor' && flags['deep'] === true ? true : undefined

  // Phase 7 (MCP-03 D-10): applies to the `run` and `add-feature` commands
  const overwriteUserEdits = flags['overwrite-user-edits'] === true ? true : undefined
  // Phase 7 (OBS-03 D-16): applies to all pipeline-invoking commands
  const exportDebugBundle = flags['export-debug-bundle'] === true ? true : undefined

  return {
    command,
    subcommand,
    positional,
    flags,
    designIrPath,
    section,
    full,
    deep,
    overwriteUserEdits,
    exportDebugBundle,
  }
}
