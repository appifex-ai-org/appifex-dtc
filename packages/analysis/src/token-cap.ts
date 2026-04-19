import type { AppContext } from './types.js'
import { CHARS_PER_TOKEN } from '@appifex/core'

// Phase 03 (DX-04): imported from single source in @appifex/core.
const APP_CONTEXT_TOKEN_CAP = 8_000

export function buildAppContextSummary(ctx: AppContext): string {
  const lines: string[] = []
  lines.push('## Existing App Context')
  lines.push(`Platform: ${ctx.platform}`)
  lines.push('')
  lines.push(`### File Inventory (${ctx.inventory.length} files)`)
  for (const entry of ctx.inventory) {
    lines.push(`- [${entry.type}] ${entry.name} \u2192 ${entry.filePath}`)
  }
  lines.push('')
  lines.push(`### Navigation Graph (${ctx.navGraph.length} nodes)`)
  if (ctx.entryPoint) lines.push(`Entry point: ${ctx.entryPoint}`)
  for (const node of ctx.navGraph) {
    lines.push(`- ${node.screenId} [${node.type}] \u2192 [${node.targets.join(', ')}]`)
  }
  return lines.join('\n')
}

const TRUNCATION_MARKER = '\n[TRUNCATED: summary exceeded 8K token cap]'

export function enforceTokenCap(summary: string): string {
  const estimatedTokens = Math.ceil(summary.length / CHARS_PER_TOKEN)
  if (estimatedTokens <= APP_CONTEXT_TOKEN_CAP) return summary
  // WR-02: Reserve marker space before slicing so the truncated output
  // (content + marker) never exceeds the declared character budget.
  const maxChars = APP_CONTEXT_TOKEN_CAP * CHARS_PER_TOKEN
  return summary.slice(0, maxChars - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
}
