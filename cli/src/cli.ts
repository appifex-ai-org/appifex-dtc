export const COMMANDS = [
  'design', 'spec', 'test-gen', 'codegen', 'build',
  'validate', 'security', 'fix', 'provision', 'deliver', 'report', 'setup', 'run', 'doctor',
] as const

export type Command = typeof COMMANDS[number] | 'help' | 'version'

const SUBCOMMAND_COMMANDS = new Set(['spec', 'test-gen', 'provision'])

export interface ParsedArgs {
  command: Command
  subcommand?: string
  positional: string[]
  flags: Record<string, string | boolean>
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

  return { command, subcommand, positional, flags }
}
