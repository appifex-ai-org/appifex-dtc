/**
 * Phase 6 (VAL-02 D-07 D-08 D-09 D-10): pure function that ranks fix-context files
 * by locality to the failure surface. Replaces default-fix.ts:172-218's indiscriminate
 * first-10-glob fallback. Consumed by both createDefaultFixFn and createClaudeCliFixFn.
 *
 * Pure: no filesystem writes. Reads (via injected Runner) ONLY one file — the first
 * candidate — to sample avgFileTokens. No knowledge of TokenBudget beyond the numeric
 * remainingTokens parameter (caller owns the budget instance per D-10).
 *
 * Priority ordering (D-07):
 *   P1: failing-test parsed paths + semgrep findings + Maestro id→screen mappings
 *   P2: modifiedScreens.added/modified (names → paths via inventory)
 *   P3: nav-graph 1-hop neighbors of any P1/P2 screen
 *   (no P4 — the old first-10-glob fallback is DELETED per D-07)
 *
 * Budget (D-08): N = floor((remainingTokens * 0.4) / avgFileTokens), Swift density
 * 3 chars/token (Phase 2 FOUND-02). Caller passes TokenBudget.totalRemaining.
 *
 * Cold-start (D-09): when modifiedScreens is empty and flowYaml is provided, synthesize
 * pseudo-modifiedScreens from the failing Maestro flow's tapOn/assertVisible ids via the
 * `<prefix>_<suffix>` → `<PrefixCap>*` inventory-name heuristic.
 */
import type { InventoryEntry, ModifiedScreens, Platform, Runner } from '@appifex/core'
import type { ValidationResult } from '@appifex/validate'
import type { NavGraphResult } from './nav-graph.js'

/** Phase 2 FOUND-02: Swift token density — 3 chars per token. */
export const CHARS_PER_TOKEN = 3

/** D-08: ranker may consume at most 40% of remaining token budget for context. */
export const FIX_CONTEXT_BUDGET_RATIO = 0.4

/** Fallback for avgFileTokens when no candidate is readable. 5000 chars / 3 ≈ 1667 tokens. */
const SAMPLE_FALLBACK_CHARS = 5000

export interface RankFixContextInput {
  failures: ValidationResult
  modifiedScreens: ModifiedScreens
  navGraph: NavGraphResult
  inventory: InventoryEntry[]
  flowYaml?: string
  projectDir: string
  runner: Runner
  platform: Platform
  /** Current TokenBudget.totalRemaining. Pass Infinity to disable the budget cap. */
  remainingTokens: number
}

export interface RankFixContextResult {
  /** Ordered file paths (relative to projectDir), budget-capped per D-08. */
  files: string[]
  /** Full ordered candidate set before budget cap (useful for debugging). */
  candidates: string[]
  /** Computed N for this attempt. */
  maxFiles: number
}

export async function rankFixContext(input: RankFixContextInput): Promise<RankFixContextResult> {
  // Set preserves insertion order → highest-priority slot wins (dedup invariant).
  const candidates = new Set<string>()

  // ── P1 — failing-test parsed paths + semgrep findings + Maestro id→screen ──
  for (const f of input.failures.unit.failures) {
    if (f.file) candidates.add(f.file)
    const pathMatches = f.error.match(/((?:Sources|src)\/[^\s:)'"]+)/g)
    if (pathMatches) {
      for (const p of pathMatches) candidates.add(p)
    }
  }
  const secFindings = input.failures.security?.findings ?? []
  for (const s of secFindings) {
    if (s.file) candidates.add(s.file)
  }
  // Maestro id → screen file
  for (const ui of input.failures.ui.results) {
    if (ui.passed || !ui.error) continue
    const idMatches = ui.error.match(/id:\s*([A-Za-z_]\w+)/g)
    if (!idMatches) continue
    for (const m of idMatches) {
      const id = m.replace(/^id:\s*/, '')
      const screenFile = resolveIdToScreenFile(id, input.inventory)
      if (screenFile) candidates.add(screenFile)
    }
  }

  // ── D-09 cold-start — synthesize modifiedScreens from flow YAML when preSnapshot is empty ──
  const synthesizedScreens: string[] = []
  const coldStart =
    input.modifiedScreens.added.length === 0 &&
    input.modifiedScreens.modified.length === 0 &&
    !!input.flowYaml
  if (coldStart && input.flowYaml) {
    const flowIds = extractFlowIds(input.flowYaml)
    for (const id of flowIds) {
      const screenFile = resolveIdToScreenFile(id, input.inventory)
      if (screenFile && !synthesizedScreens.includes(screenFile)) {
        synthesizedScreens.push(screenFile)
      }
    }
  }

  // ── P2 — modifiedScreens names → paths via inventory ──
  const p2Paths: string[] = []
  const modifiedNames = new Set<string>([
    ...input.modifiedScreens.added,
    ...input.modifiedScreens.modified,
  ])
  for (const name of modifiedNames) {
    for (const entry of input.inventory) {
      if (entry.name === name) p2Paths.push(entry.filePath)
    }
  }
  for (const p of [...p2Paths, ...synthesizedScreens]) candidates.add(p)

  // ── P3 — nav-graph 1-hop siblings ──
  const currentCandidates = Array.from(candidates)
  for (const file of currentCandidates) {
    const siblings = neighborScreenFiles(file, input.navGraph, input.inventory)
    for (const s of siblings) candidates.add(s)
  }

  const orderedCandidates = Array.from(candidates)

  // ── D-08 budget cap ──
  let maxFiles: number
  if (!Number.isFinite(input.remainingTokens)) {
    maxFiles = orderedCandidates.length
  } else {
    const avg = await estimateAvgFileTokens(input.runner, orderedCandidates, input.projectDir)
    maxFiles = Math.max(0, Math.floor((input.remainingTokens * FIX_CONTEXT_BUDGET_RATIO) / avg))
    maxFiles = Math.min(maxFiles, orderedCandidates.length)
  }

  return {
    files: orderedCandidates.slice(0, maxFiles),
    candidates: orderedCandidates,
    maxFiles,
  }
}

// ── Internal helpers ──

/** D-09 heuristic: `<prefix>_<suffix>` id → `<PrefixCap>*` screen file. */
function resolveIdToScreenFile(id: string, inventory: InventoryEntry[]): string | null {
  const [prefix] = id.split('_')
  if (!prefix) return null
  const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1)
  const match = inventory.find((e) => e.type === 'screen' && e.name.startsWith(cap))
  return match ? match.filePath : null
}

/** Parse a Maestro flow YAML for tapOn/assertVisible ids (handles multi-line and inline forms). */
function extractFlowIds(flowYaml: string): string[] {
  const ids = new Set<string>()
  // Multi-line:   - tapOn:\n      id: "foo"   OR   id: foo
  const multi = /(?:tapOn|assertVisible):\s*\n\s*id:\s*"?([A-Za-z_]\w+)"?/g
  for (const m of flowYaml.matchAll(multi)) ids.add(m[1])
  // Inline:       - tapOn: { id: "foo" }
  const inline = /(?:tapOn|assertVisible):\s*\{\s*id:\s*"?([A-Za-z_]\w+)"?/g
  for (const m of flowYaml.matchAll(inline)) ids.add(m[1])
  return Array.from(ids)
}

/** 1-hop siblings via nav-graph: nodes that target the file's screen OR nodes this file targets. */
function neighborScreenFiles(
  file: string,
  navGraph: NavGraphResult,
  inventory: InventoryEntry[],
): string[] {
  const fileEntry = inventory.find((e) => e.filePath === file)
  const fileName = fileEntry?.name
  const neighbors = new Set<string>()
  // a) nodes whose screenId === file → their targets
  for (const node of navGraph.nodes) {
    if (node.screenId !== file) continue
    for (const targetName of node.targets) {
      const match = inventory.find((e) => e.type === 'screen' && e.name === targetName)
      if (match) neighbors.add(match.filePath)
    }
  }
  // b) nodes whose targets include this file's name → that node's screen file
  if (fileName) {
    for (const node of navGraph.nodes) {
      if (node.targets.includes(fileName)) neighbors.add(node.screenId)
    }
  }
  neighbors.delete(file) // exclude self
  return Array.from(neighbors)
}

/** D-08: sample ONE candidate file to estimate avgFileTokens. Fallback on failure. */
async function estimateAvgFileTokens(
  runner: Runner,
  candidates: string[],
  projectDir: string,
): Promise<number> {
  if (candidates.length === 0) return Math.ceil(SAMPLE_FALLBACK_CHARS / CHARS_PER_TOKEN)
  try {
    const first = candidates[0]
    const abs = first.startsWith('/') ? first : `${projectDir}/${first}`
    const content = await runner.readFile(abs)
    return Math.max(1, Math.ceil(content.length / CHARS_PER_TOKEN))
  } catch {
    return Math.ceil(SAMPLE_FALLBACK_CHARS / CHARS_PER_TOKEN)
  }
}
