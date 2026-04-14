import { readFileSync, existsSync } from 'node:fs'
import { relative } from 'node:path'
import type { Platform, PlatformSpec, PlatformScreenSpec, PlatformComponentSpec, RunContext, RunMode, BackendContext, AppContext } from '@appifex/core'
import { buildAppContextSummary, enforceTokenCap } from '@appifex/analysis'
import { buildContextSummary, buildBackendPromptSection } from '@appifex/core'
import { buildTestIdReference, buildDesignTokensSection, buildExistingDesignTokensSection, buildModificationPlanSection, buildIconReference } from './prompt-sections-design.js'
import { inlineMaestroFlows, buildUnitTestInstructions, buildSkillsSection, buildArchitectureRules, buildInstructions, buildWorkflow } from './prompt-sections-platform.js'

export interface PromptBuilderOpts {
  /** User's original prompt */
  prompt: string
  platform: Platform
  /** Path to design preview image (preview.png) */
  designImagePath?: string
  /** Path to the .pen design file (for agent to export screenshot via Pencil MCP) */
  penFilePath?: string
  /** Path to the translated platform spec JSON */
  specPath: string
  /** Directory containing Maestro test flows */
  flowDir: string
  /** Directory containing unit test files — only Maestro flows are inlined, stub unit tests are skipped */
  testDir: string
  /** Directory containing skill files */
  skillsDir: string
  /** Root project directory (cwd for the agent) */
  projectDir: string
  /** Whether the agent supports reading images */
  agentSupportsImages: boolean
  /** App name used for scheme, targets, module name (e.g. "TodoApp") */
  appName?: string
  /** Context from a previous pipeline run (for resume, add-feature, refactor) */
  previousContext?: RunContext | null
  /** How this run was initiated */
  runMode?: RunMode
  /** Backend API context — when present, the agent generates networking code */
  backendContext?: BackendContext
  /** Structural analysis of existing project (for add-feature mode) */
  appContext?: AppContext | null
  /** Pre-loaded design tokens from existing .pen file (add-feature mode only) */
  existingDesignTokens?: import('@appifex/core').DesignTokens | null
  /** Modification plan for add-feature mode — existing files the agent must modify (D-05) */
  modificationPlan?: import('@appifex/core').ModificationPlan
}

export function buildAgentPrompt(opts: PromptBuilderOpts): string {
  const sections: string[] = []

  // ── Header ──
  const platformLabel = opts.platform === 'swiftui' ? 'SwiftUI'
    : 'Kotlin Compose'
  sections.push(`# Task: Build a ${platformLabel} App

You are building a mobile app that EXACTLY matches a design mockup. Your #1 priority is visual fidelity to the design.

## User Request
${opts.prompt}`)

  // ── Previous Run Context (for resume, add-feature, refactor) ──
  if (opts.previousContext) {
    sections.push(buildContextSummary(opts.previousContext))
  }

  // ── Mode instructions (always injected when mode is set, even without previous context) ──
  if (opts.runMode === 'add-feature') {
    sections.push(`### Mode: add-feature
You are adding a NEW feature to an existing, working app. You MUST:
1. Read and understand the existing code before making changes
2. **Preserve existing functionality** — do not break or remove what already works
3. Add the new feature incrementally, integrating it into the existing architecture
4. Ensure all previous tests still pass after your changes
5. Write new tests for the added feature`)
  } else if (opts.runMode === 'refactor') {
    sections.push(`### Mode: refactor
You are refactoring an existing, working app — do NOT change visible behavior. You MUST:
1. Read and understand the existing code before making changes
2. The app must look and work exactly the same after refactoring
3. Improve code structure, readability, or performance as requested
4. All existing tests must still pass after refactoring
5. If you extract or rename things, update all references`)
  }

  // ── App Context (add-feature only — structural map of existing project) ──
  if (opts.appContext && opts.runMode === 'add-feature') {
    const summary = buildAppContextSummary(opts.appContext)
    sections.push(enforceTokenCap(summary))
  }

  // ── Existing Design Tokens (add-feature only — constrains codegen to match existing style) ──
  if (opts.existingDesignTokens && opts.runMode === 'add-feature') {
    sections.push(buildExistingDesignTokensSection(opts.existingDesignTokens as PlatformSpec['designTokens']))
  }

  // ── Modification Plan (add-feature only — files the agent must modify, per D-05) ──
  if (opts.modificationPlan && opts.modificationPlan.items.length > 0 && opts.runMode === 'add-feature') {
    sections.push(buildModificationPlanSection(opts.modificationPlan))
  }

  // ── Design Image (embedded inline — the model sees it directly) ──
  if (opts.designImagePath && existsSync(opts.designImagePath)) {
    if (opts.agentSupportsImages) {
      sections.push(`## Design Image (attached above — THIS IS YOUR PRIMARY SOURCE OF TRUTH)

The design mockup image is attached to this message. Study it carefully NOW before reading anything else.

WRITE DOWN what you observe:
1. How many screens are shown
2. Navigation pattern (tab bar with N tabs? stack? drawer?)
3. Color scheme — what is the PRIMARY color? Background color? Accent colors? (Be specific with hex-like descriptions)
4. Each screen's layout: what components, where positioned, how styled
5. Typography: heading sizes, body text, captions
6. Icons, badges, decorative elements, shadows, rounded corners

**The spec JSON below may be INCOMPLETE or WRONG.** If the spec says 3 screens but you see 5 in the image, implement what the IMAGE shows. If the spec says blue but the image shows green, use GREEN.`)
    } else {
      sections.push(`## Design
The design image is at \`${relative(opts.projectDir, opts.designImagePath)}\`. Follow the spec JSON below for the visual structure.`)
    }
  } else if (opts.penFilePath && existsSync(opts.penFilePath)) {
    // No preview image but .pen file exists — tell agent to export screenshot via Pencil MCP
    const relPen = relative(opts.projectDir, opts.penFilePath)
    sections.push(`## Design File (no preview image — export it yourself)

The design is in \`${relPen}\` (a Pencil .pen file). No preview image was exported.

**BEFORE writing any code**, export a screenshot from the design:
1. Use the Pencil MCP tool \`get_screenshot\` to render the design, OR
2. Use \`batch_get\` to read the design node tree from \`${relPen}\`, then \`export_nodes\` to export frames as PNG

If Pencil MCP tools are not available, rely on the spec JSON below for the design structure. The spec includes layout, colors, icons (with SF Symbol names), and padding data extracted from the .pen file.`)
  }

  // ── Backend API Context (when the app connects to a backend) ──
  if (opts.backendContext) {
    sections.push(buildBackendPromptSection(opts.backendContext, opts.platform))
  }

  // ── Spec as TestID Reference (not the primary design source) ──
  if (existsSync(opts.specPath)) {
    const specJson = readFileSync(opts.specPath, 'utf-8')
    let spec: PlatformSpec | null = null
    try { spec = JSON.parse(specJson) as PlatformSpec } catch { /* fallback */ }

    if (spec) {
      sections.push(buildTestIdReference(spec))

      // Check if tokens were extracted from design (have real color data) or are LLM-generated
      const colorCount = spec.designTokens?.colors ? Object.keys(spec.designTokens.colors).length : 0
      const hasExtractedTokens = colorCount > 0
      if (spec.designTokens) {
        sections.push(buildDesignTokensSection(spec.designTokens, !!hasExtractedTokens))
      }

      // Icon reference — list SF Symbol mappings if available
      const iconRef = buildIconReference(spec)
      if (iconRef) sections.push(iconRef)
    }
  }

  // ── Maestro UI Tests ──
  const maestroFlows = inlineMaestroFlows(opts.flowDir)
  if (maestroFlows) {
    sections.push(`## Maestro UI Tests (pre-generated — do NOT modify these files)
${maestroFlows}

These Maestro flows use \`accessibilityIdentifier\` values. Your views MUST set \`.accessibilityIdentifier("value")\` to match. Note: these flows were generated from the spec JSON, which may not cover ALL screens in the design. Implement ALL screens from the design image, even if there's no Maestro flow for them.`)
  }

  // ── Unit Test Instructions ──
  sections.push(buildUnitTestInstructions(opts.platform, opts.appName ?? 'App'))

  // ── Skills ──
  sections.push(buildSkillsSection(opts.skillsDir, opts.platform, opts.projectDir))

  // ── Architecture Rules ──
  sections.push(buildArchitectureRules(opts.platform))

  // ── Build & Test Commands ──
  sections.push(buildInstructions(opts.platform, opts.appName ?? 'App'))

  // ── Workflow ──
  sections.push(buildWorkflow(opts.platform, opts.appName ?? 'App'))

  return sections.join('\n\n')
}
