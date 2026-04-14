/**
 * Regression tests for effectivePrompt propagation and pipeline ordering (Phase 8).
 *
 * These tests read the source file to verify:
 *  1. planModifications block appears AFTER the vagueness enrichment block
 *  2. buildAgentPrompt uses effectivePrompt not opts.prompt
 *  3. designPrompt is built from effectivePrompt not opts.prompt
 *  4. decidePenFileStrategy is called exactly once
 *  5. snapshot guard uses runMode check, not always-true length check
 *
 * Tests are structural (source-code assertions) because these bugs are callsite
 * selection errors — the wrong variable is passed to the right function.
 * Unit tests for the functions themselves exist in pipeline-helpers.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipelineSrc = readFileSync(join(__dirname, '../src/pipeline.ts'), 'utf-8')
const pipelineLines = pipelineSrc.split('\n')

/**
 * Returns the 1-based line number of the FIRST line matching the given string.
 * Returns -1 if not found.
 */
function firstLineOf(searchStr: string): number {
  const idx = pipelineLines.findIndex(l => l.includes(searchStr))
  return idx === -1 ? -1 : idx + 1
}

describe('Pipeline: effectivePrompt propagation (D-01, INCON-1b, INCON-2)', () => {
  it('buildAgentPrompt call uses effectivePrompt not opts.prompt', () => {
    // Find the buildAgentPrompt({ block
    const buildAgentLine = pipelineLines.findIndex(l => l.includes('buildAgentPrompt({'))
    expect(buildAgentLine).toBeGreaterThan(0)
    // The next few lines should include "prompt: effectivePrompt" not "prompt: opts.prompt"
    const block = pipelineLines.slice(buildAgentLine, buildAgentLine + 5).join('\n')
    expect(block).toContain('prompt: effectivePrompt')
    expect(block).not.toContain('prompt: opts.prompt')
  })

  it('designPrompt construction uses effectivePrompt not opts.prompt', () => {
    // Find the designPrompt = ... line
    const designPromptLine = pipelineLines.findIndex(l =>
      l.includes('const designPrompt =') && l.includes('buildPencilPrompt')
    )
    expect(designPromptLine).toBeGreaterThan(0)
    const line = pipelineLines[designPromptLine]
    expect(line).toContain('effectivePrompt')
    expect(line).not.toContain('opts.prompt')
  })
})

describe('Pipeline: decidePenFileStrategy called exactly once (D-03, INCON-2)', () => {
  it('decidePenFileStrategy is called (not defined) exactly once in the source', () => {
    // Exclude the export function definition line — only count call sites
    const matches = pipelineLines.filter(l =>
      l.includes('decidePenFileStrategy(') &&
      !l.startsWith('//') &&
      !l.includes('export function decidePenFileStrategy')
    )
    expect(matches.length).toBe(1)
  })
})

describe('Pipeline: planModifications runs after vagueness enrichment (D-02, INCON-1a)', () => {
  it('planModifications block appears after the isFeaturePromptVague block', () => {
    const vagueCheckLine = firstLineOf('isFeaturePromptVague(effectivePrompt)')
    const planModLine = firstLineOf('planModifications(')
    expect(vagueCheckLine).toBeGreaterThan(0)
    expect(planModLine).toBeGreaterThan(0)
    expect(planModLine).toBeGreaterThan(vagueCheckLine)
  })
})

describe('Pipeline: snapshot guard simplified (D-06, INCON-3)', () => {
  it('always-true guard modificationPlan.items.length >= 0 is removed', () => {
    const alwaysTrueGuard = pipelineLines.filter(l =>
      l.includes('modificationPlan.items.length >= 0')
    )
    expect(alwaysTrueGuard.length).toBe(0)
  })

  it('snapshot block is nested under the runMode === "add-feature" guard', () => {
    // Find the preAgentSnapshot line
    const snapshotLine = pipelineLines.findIndex(l => l.includes('preAgentSnapshot = await snapshotSourceFiles'))
    expect(snapshotLine).toBeGreaterThan(0)

    // Phase 14 (D-22, D-24): the snapshot block is now inside a resume/non-resume
    // branch structure, so the `runMode === 'add-feature'` guard is no longer on the
    // line immediately above the snapshot call. Instead, verify that the snapshot
    // call is lexically nested inside an enclosing `runMode === 'add-feature'` block,
    // and that the always-true `modificationPlan.items.length` guard never appears
    // in the enclosing scope.
    const enclosingWindow = pipelineLines
      .slice(Math.max(0, snapshotLine - 40), snapshotLine)
      .join('\n')
    expect(enclosingWindow).toContain("runMode === 'add-feature'")
    expect(enclosingWindow).not.toContain('modificationPlan.items.length >= 0')
  })
})
