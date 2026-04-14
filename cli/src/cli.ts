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
    } else {
      positional.push(arg)
    }
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

  return { command, subcommand, positional, flags, designIrPath }
}
