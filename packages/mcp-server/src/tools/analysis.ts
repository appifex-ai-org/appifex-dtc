import { createRunner } from '@appifex/runner'
import { loadConfig } from '@appifex/core'
import type { AppContext, Platform } from '@appifex/core'
import { scanProject, buildNavGraph, backupRunContext, buildAppContextSummary } from '@appifex/analysis'

export async function handleAnalyze(args: { outputDir: string; platform: Platform }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const config = await loadConfig(args.outputDir)
  const runner = createRunner(config.runner, { cwd: args.outputDir })

  // Backup run-context before scanning (per D-09)
  await backupRunContext(args.outputDir)

  const inventory = await scanProject(args.outputDir, args.platform, runner)
  const navResult = await buildNavGraph(args.outputDir, args.platform, runner)
  const appContext: AppContext = {
    platform: args.platform,
    inventory,
    navGraph: navResult.nodes,
    entryPoint: navResult.entryPoint,
    scannedAt: Date.now(),
  }
  const summary = buildAppContextSummary(appContext)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        summary,
        inventory: appContext.inventory,
        navGraph: appContext.navGraph,
        entryPoint: appContext.entryPoint,
        platform: appContext.platform,
      }),
    }]
  }
}
