import { loadRunContext, loadConfig } from '@appifex/core'
import type { AppContext, Platform } from '@appifex/core'
import { createRunner } from '@appifex/runner'
import { scanProject, buildNavGraph } from '@appifex/analysis'
import { handleRunPipeline } from './pipeline.js'
import { isFeaturePromptVague, generateFeatureAssumptions } from './refine.js'

export async function handleAddFeature(args: {
  prompt: string
  outputDir: string
  platform?: string
  confirmed?: boolean
  verbose?: boolean
  configDir?: string
}): Promise<{ text: string; isError: boolean }> {
  // WR-01: Validate/narrow platform once at the top of the handler and reuse
  // throughout to ensure a single source of truth for platform type safety.
  const platform: Platform = (args.platform ?? 'swiftui') as Platform

  // D-12: Validate that an existing project exists before any pipeline phase
  const ctx = await loadRunContext(args.outputDir)
  if (!ctx) {
    // D-11: exact error message
    return {
      text: JSON.stringify({
        status: 'error',
        error: `No existing project found at ${args.outputDir}. Run \`dtc run\` first to create a project, then use \`--add-feature\` to add to it.`,
      }),
      isError: true,
    }
  }

  // D-04: Two-step confirmed handshake (matches handleFeatureRefine pattern)
  if (!args.confirmed) {
    // First call: check vagueness and return assumptions if needed
    if (!isFeaturePromptVague(args.prompt)) {
      // Prompt is specific enough — proceed directly to pipeline
      return handleRunPipeline({
        prompt: args.prompt,
        platform,
        outputDir: args.outputDir,
        mode: 'add-feature',
        verbose: args.verbose,
        configDir: args.configDir,
      })
    }
    // Vague prompt — load appContext best-effort so assumptions reflect actual
    // project structure (PROMPT-02), then generate assumptions for user review
    let appContext: AppContext | null = null
    try {
      const config = await loadConfig(args.outputDir)
      const runner = createRunner(config.runner, { cwd: args.outputDir })
      const inventory = await scanProject(args.outputDir, platform, runner)
      const navResult = await buildNavGraph(args.outputDir, platform, runner)
      appContext = {
        platform,
        inventory,
        navGraph: navResult.nodes,
        entryPoint: navResult.entryPoint,
        scannedAt: Date.now(),
      }
    } catch {
      // best-effort — fall back to null (existing behavior)
    }
    const result = generateFeatureAssumptions(args.prompt, appContext)
    return {
      text: JSON.stringify({
        status: 'needs_confirmation',
        assumptions: result.assumptions,
        summary: result.summary,
        hint: 'Call dtc_add_feature again with confirmed=true to proceed, or supply a more detailed prompt.',
      }),
      isError: false,
    }
  }

  // confirmed=true: proceed with pipeline
  return handleRunPipeline({
    prompt: args.prompt,
    platform,
    outputDir: args.outputDir,
    mode: 'add-feature',
    verbose: args.verbose,
    configDir: args.configDir,
  })
}
