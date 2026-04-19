import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CliError, loadConfig } from '@appifex/core'
import { createRunner } from '@appifex/runner'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CommandCollectingRunner } from './command-collecting-runner.js'
import { registerPipelineTools } from './server-tools-pipeline.js'
import { registerDevTools } from './server-tools-dev.js'

/**
 * Phase 02 Plan 01 (FOUND-04): translate a thrown CliError into an MCP error
 * envelope so the host process stays alive. Non-CliError errors are re-thrown
 * and handled by the SDK's default machinery.
 *
 * Exported so unit tests can exercise the wrapping logic in isolation.
 */
export function wrapToolHandler<Args, Result extends { content: unknown; isError?: boolean }>(
  handler: (args: Args) => Promise<Result>,
): (
  args: Args,
) => Promise<Result | { content: Array<{ type: 'text'; text: string }>; isError: true }> {
  return async (args: Args) => {
    try {
      return await handler(args)
    } catch (err) {
      if (err instanceof CliError) {
        return {
          isError: true,
          content: [{ type: 'text', text: `${err.name}: ${err.message}` }],
        }
      }
      throw err
    }
  }
}

/**
 * Phase 02 Plan 01 (FOUND-04): patch `server.tool(...)` so every registered
 * tool's handler is wrapped in the CliError translator. This intercepts all
 * existing `server.tool(name, desc, schema, cb)` calls across
 * server-tools-pipeline.ts and server-tools-dev.ts without editing each site.
 */
function patchServerForCliErrorTranslation(server: McpServer): void {
  const rawTool = server.tool.bind(server)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(server as any).tool = (...args: any[]) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') {
      args[args.length - 1] = wrapToolHandler(
        cb as (a: unknown) => Promise<{ content: unknown; isError?: boolean }>,
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rawTool as any)(...args)
  }
}

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
  // Phase 02 Plan 01 (FOUND-04): translate CliError to MCP error envelope so host survives
  patchServerForCliErrorTranslation(server)
  registerPipelineTools(server, resolveRunner, injectCommands)
  registerDevTools(server, resolveRunner, injectCommands)
  return server
}
