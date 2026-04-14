import { buildReport, formatMarkdown, formatJson } from '@appifex/report'
import type { Platform } from '@appifex/core'

export async function handleReport(
  args: {
    projectName: string
    platforms: string[]
    validationJson: string
    fixJson?: string
    tokenUsageJson?: string
    totalDuration?: number
    designIterations?: number
    format?: string
  },
): Promise<{ text: string; isError: boolean }> {
  try {
    const validation: Record<string, unknown> = {}
    const fix: Record<string, unknown> = {}

    const validationData = JSON.parse(args.validationJson)
    for (const p of args.platforms) validation[p] = validationData[p] ?? validationData
    if (args.fixJson) {
      const fixData = JSON.parse(args.fixJson)
      for (const p of args.platforms) fix[p] = fixData[p] ?? fixData
    }

    const report = buildReport({
      projectName: args.projectName,
      platforms: args.platforms as Platform[],
      designIterations: args.designIterations ?? 0,
      validation: validation as any,
      fix: fix as any,
      tokenUsage: args.tokenUsageJson ? JSON.parse(args.tokenUsageJson) : {},
      totalDuration: args.totalDuration ?? 0,
    })

    const output = args.format === 'json' ? formatJson(report) : formatMarkdown(report)
    return { text: output, isError: false }
  } catch (err) {
    return {
      text: `Report generation failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    }
  }
}
