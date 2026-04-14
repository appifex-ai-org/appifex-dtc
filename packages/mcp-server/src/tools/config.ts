import { loadConfig, loadRunContext, saveRunContext, type RunContext } from '@appifex/core'
import { homedir } from 'node:os'
import { join } from 'node:path'

export async function handleLoadConfig(args: { configDir?: string }): Promise<{ text: string }> {
  const configDir = args.configDir ?? join(homedir(), '.dtc')
  const config = await loadConfig(configDir)
  return { text: JSON.stringify(config, null, 2) }
}

export async function handleLoadContext(args: {
  outputDir: string
}): Promise<{ text: string; isError: boolean }> {
  const ctx = await loadRunContext(args.outputDir)
  if (!ctx) {
    return {
      text: JSON.stringify({ found: false, message: 'No run context found' }),
      isError: false,
    }
  }
  return { text: JSON.stringify({ found: true, context: ctx }, null, 2), isError: false }
}

export async function handleSaveContext(args: {
  outputDir: string
  contextJson: string
}): Promise<{ text: string; isError: boolean }> {
  try {
    const ctx = JSON.parse(args.contextJson) as RunContext
    await saveRunContext(args.outputDir, ctx)
    return { text: JSON.stringify({ saved: true }), isError: false }
  } catch (err) {
    return {
      text: `Save context failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
