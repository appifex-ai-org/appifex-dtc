import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadConfig } from '@appifex/core'
import { createRunner } from '@appifex/runner'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CommandCollectingRunner } from './command-collecting-runner.js'
import { registerPipelineTools } from './server-tools-pipeline.js'
import { registerDevTools } from './server-tools-dev.js'

/** Resolve a Runner from the user's config, wrapped to collect shell commands */
async function resolveRunner(projectDir: string, configDir?: string) {
  const config = await loadConfig(configDir ?? join(homedir(), '.dtc'))
  const inner = createRunner(config.runner, { cwd: projectDir })
  const runner = new CommandCollectingRunner(inner)
  return { runner, config }
}

/** Inject collected commands into a tool result's JSON text */
function injectCommands(
  result: { text: string; isError: boolean },
  runner: CommandCollectingRunner,
): { text: string; isError: boolean } {
  const commands = runner.getCommands()
  if (commands.length === 0) return result
  try {
    const parsed = JSON.parse(result.text)
    parsed.commands = commands
    return { text: JSON.stringify(parsed, null, 2), isError: result.isError }
  } catch {
    return result
  }
}

export function createDtcMcpServer(): McpServer {
  const server = new McpServer({ name: 'dtc', version: '0.1.0' })
  registerPipelineTools(server, resolveRunner, injectCommands)
  registerDevTools(server, resolveRunner, injectCommands)
  return server
}
