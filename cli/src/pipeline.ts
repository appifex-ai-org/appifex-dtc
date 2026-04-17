import {
  loadConfig,
  saveConfig,
  TokenBudget,
  createFileSkillProvider,
  createBundledSkillProvider,
  getBundledSkillsDir,
  createDebugLogger,
  RunContextBuilder,
  saveRunContext,
  loadRunContext,
  Checkpoint,
  writePreAgentSnapshotSidecar,
  PHASE_ORDER,
  assessBaasAppropriateness,
  isFixtureMode,
  loadFixture,
  EpipeError,
  ProvisionError,
  type AgentConfigType,
  type AppContext,
  type BackendContext,
  type BaasProvider,
  type BaasRecommendation,
  type DtcConfig,
  type PhaseId,
  type Platform,
  type RunMode,
  type SkillContent,
  type DebugLogger,
  type PlatformSpec,
} from '@appifex/core'
import { createRunner } from '@appifex/runner'
import {
  createDesignAdapter,
  PencilMcpClient,
  writeImageAssets,
  extractStitchZip,
  type StitchArtifacts,
} from '@appifex/design'
import type { DesignToolResult, ProgressEmitter } from '@appifex/core'
import {
  extractSpec,
  extractSpecFromMcp,
  translateSpec,
  generateSpecFromPrompt,
  extractSpecFromStitch,
  extractSpecFromFigmaMake,
} from '@appifex/spec'
import { generateUITests, generateUnitTests, generateSpecUnitTests } from '@appifex/test-gen'
import { diffScreenInventory, diffDesignTokens } from '@appifex/analysis'
import {
  ClaudeAdapter,
  createDefaultGenerateFn,
  createClaudeCliGenerateFn,
  createLayeredGenerateFn,
  type GenerateFn,
  type LayeredCodegenResult,
} from '@appifex/codegen'
import {
  buildSwift,
  buildKotlin,
  bundleKotlin,
  deriveAppName,
  swiftPrecheck,
  swiftAutofix,
  patchProjectDependencies,
  patchBuildGradle,
} from '@appifex/build'
// Phase 5 Plan 06 (TF-01 D-03): AscClient deleted. iOS submission now flows through
// runTestFlightUploadPhase (imported at the wiring site below).
import { PlayConsoleClient } from '@appifex/provision'
import { validateAll, type ValidationResult } from '@appifex/validate'
import { fixLoop, createDefaultFixFn, createClaudeCliFixFn } from '@appifex/fix'
import { buildReport, formatMarkdown, type PipelineReport } from '@appifex/report'
import { deliver, type DeliverResult } from '@appifex/deliver'
import { detectBaasProvider } from '@appifex/baas'
// Copilot provider is handled inline in buildCreateMessageFn
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFileSync as writeFileSyncFs, mkdirSync as mkdirSyncFs } from 'node:fs'
import type { DesignTokens, DesignDeltaReport } from '@appifex/core'

// Phase 14 (D-09): phases that ALWAYS re-run on resume regardless of
// checkpoint/previousContext state. Matches PROJECT.md principle
// "validate/fix/deliver always re-run"; report is cheap and must reflect
// the resumed run.
const FORCE_RERUN_PHASES: ReadonlySet<PhaseId> = new Set(['validate', 'fix', 'deliver', 'report'])

/**
 * Narrow a CodegenResult to LayeredCodegenResult. Used when serializing
 * codegen output for debug logs so the layered-specific arrays are typed.
 */
function isLayeredCodegenResult(result: { files: unknown[] }): result is LayeredCodegenResult {
  return 'presentationFiles' in result && 'domainFiles' in result && 'integrationFiles' in result
}

/** Map CLI Platform to BaaS TargetPlatform array. */
function platformToTarget(
  platform: Platform | undefined,
): import('@appifex/baas').TargetPlatform[] {
  if (platform === 'react') return ['react']
  if (platform === 'swiftui') return ['swift']
  if (platform === 'kotlin-compose') return ['kotlin']
  return ['swift', 'kotlin', 'react'] // all platforms when no specific platform
}

/**
 * Phase 18 Plan 01 — Pure helper for the skip-gate decision, extracted from the
 * inline closure in runPipeline so it can be unit-tested in isolation. The
 * `runPipeline` closure delegates to this helper so both paths agree.
 *
 * Inputs are captured at construction time; the returned object exposes
 * `canSkipPhase(phase)` which is cheap and side-effect-free.
 */
export interface SkipGateInputs {
  runMode: RunMode
  isContinuation: boolean
  previousContext: import('@appifex/core').RunContext | null
  resumeState: { lastCompletedPhase: PhaseId } | null
}

export interface SkipGate {
  canSkipPhase: (phase: PhaseId) => boolean
}

export function createSkipGate(inputs: SkipGateInputs): SkipGate {
  const { runMode, isContinuation, previousContext, resumeState } = inputs
  return {
    canSkipPhase: (phase: PhaseId): boolean => {
      // Phase 14 (D-09): force-rerun phases ignore all skip sources.
      if (FORCE_RERUN_PHASES.has(phase)) return false
      // Phase 18 Plan 01 (Bug A fix): spec must always re-run in add-feature
      // mode so the new feature prompt is processed into a fresh platformSpec.
      // Skipping spec would leave runDesignDeltaPhase comparing against stale
      // cached tokens from the ORIGINAL fresh run. See
      // .planning/phases/17-drift-token-extraction-fix/17-02-smoke-rerun-and-status-flips-SUMMARY.md
      // § Root Cause Bug A.
      if (runMode === 'add-feature' && phase === 'spec') return false
      if (!isContinuation || !previousContext) return false
      // Phase 14 (D-08, D-11): skip if run-context says completed/skipped
      // OR checkpoint DB (via resumeState) says phase is at/before lastCompletedPhase.
      const prevStatus = previousContext.phases[phase]?.status
      if (prevStatus === 'completed' || prevStatus === 'skipped') return true
      if (resumeState !== null) {
        const phaseIdx = PHASE_ORDER.indexOf(phase)
        const lastIdx = PHASE_ORDER.indexOf(resumeState.lastCompletedPhase)
        if (phaseIdx >= 0 && lastIdx >= 0 && phaseIdx <= lastIdx) return true
      }
      return false
    },
  }
}

/**
 * Phase 02 Plan 03 (FOUND-03): Exported helper that invokes `claude --print` for
 * text-only LLM calls. Extracted from `buildCreateMessageFn` so the spawn site is
 * unit-testable (tests mock `node:child_process.spawn` and assert EPIPE surfaces
 * as a typed `EpipeError` instead of being silently swallowed).
 */
export interface RunClaudePrintOpts {
  prompt: string
  model: string
  cwd: string
}

export async function runClaudePrint(opts: RunClaudePrintOpts): Promise<{
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}> {
  const { spawn } = await import('node:child_process')
  const { prompt, model, cwd } = opts
  const payloadBytes = Buffer.byteLength(prompt, 'utf8')

  return new Promise<{
    content: Array<{ type: string; text: string }>
    usage: { input_tokens: number; output_tokens: number }
  }>((resolve, reject) => {
    const child = spawn('claude', ['--print', '--model', model], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    })
    let settled = false
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true
        fn()
      }
    }
    // Phase 02 Plan 03 (FOUND-03): hard-fail with typed EpipeError instead of silent swallow
    // order matters: register 'error' BEFORE write()
    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        settle(() =>
          reject(
            new EpipeError(
              `LLM CLI closed stdin before prompt fully written (site=cli/pipeline.ts:claude-print, ${payloadBytes} bytes)`,
              'cli/pipeline.ts:claude-print',
              payloadBytes,
            ),
          ),
        )
        return
      }
      // Phase 02 Plan 04 (WR-04): non-EPIPE stdin errors — kill child promptly to avoid runaway LLM cost
      child.kill('SIGTERM')
      settle(() => reject(err))
    })
    child.stdin.write(prompt)
    child.stdin.end()
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('close', (code) => {
      if (code !== 0) {
        settle(() =>
          reject(
            new Error(
              `claude --print exited with code ${code}${stderr ? `\nstderr: ${stderr}` : ''}${stdout ? `\nstdout preview: ${stdout.slice(0, 200)}` : ''}`,
            ),
          ),
        )
      } else if (!stdout.trim()) {
        settle(() =>
          reject(
            new Error(
              `claude --print returned empty response${stderr ? `\nstderr: ${stderr}` : ''}`,
            ),
          ),
        )
      } else {
        settle(() =>
          resolve({
            content: [{ type: 'text', text: stdout }],
            usage: { input_tokens: 0, output_tokens: 0 },
          }),
        )
      }
    })
  })
}

type PenFileDecision = 'new' | 'extend'

/** @internal */
export function decidePenFileStrategy(
  prompt: string,
  appContext: import('@appifex/core').AppContext | null,
): PenFileDecision {
  if (!appContext) return 'new'
  const existingScreenNames = appContext.inventory
    .filter((e) => e.type === 'screen')
    .map((e) => e.name.toLowerCase())

  // D-05: Nav-only changes = extend existing .pen
  const NAV_ONLY_KEYWORDS = ['tab', 'route', 'navigation', 'menu item', 'sidebar', 'drawer']
  const NEW_SCREEN_KEYWORDS = ['screen', 'page', 'view']
  const promptLower = prompt.toLowerCase()

  const mentionsNavOnly = NAV_ONLY_KEYWORDS.some((kw) => promptLower.includes(kw))
  const mentionsNewScreen = NEW_SCREEN_KEYWORDS.some((kw) => promptLower.includes(kw))

  // If explicitly mentions nav-only concepts and NOT new screen concepts → extend
  if (mentionsNavOnly && !mentionsNewScreen) return 'extend'

  // If any mentioned screen name already exists in inventory AND no new screen keywords → extend
  if (
    existingScreenNames.length > 0 &&
    existingScreenNames.some((name) => promptLower.includes(name)) &&
    !mentionsNewScreen
  ) {
    return 'extend'
  }

  // Default: new .pen (safer per D-04)
  return 'new'
}

export interface PreBuildSummary {
  newScreens: string[]
  modifiedFiles: string[]
  designStrategy: 'new' | 'extend'
  testFilesToGenerate: string[]
  tokenCount: number
  enrichedPrompt: string
  /** Design token delta computed before codegen (Phase 12). Undefined for fresh-app runs and pure-addition-on-null-baseline runs. */
  designDelta?: DesignDeltaReport
  /** BaaS recommendation result — present when a BaaS provider is configured */
  baasRecommendation?: BaasRecommendation
  /** Inferred BaaS schema — present when baas_schema phase ran */
  baasSchema?: import('@appifex/core').BaasSchema
}

export function generatePreBuildSummary(
  enrichedPrompt: string,
  appContext: AppContext | null,
  penStrategy: 'new' | 'extend',
  existingDesignTokens: DesignTokens | null,
  modificationPlan?: import('@appifex/core').ModificationPlan,
  designDelta: DesignDeltaReport | null = null,
): PreBuildSummary {
  // Infer new screens from prompt keywords not in existing inventory
  const inventoryNames = new Set(
    (appContext?.inventory ?? [])
      .filter((e) => e.type === 'screen')
      .map((e) => e.name.toLowerCase()),
  )

  const screenKeywordPattern = /(?:screen|page|view|tab)\s+(\w+)|(\w+)\s+(?:screen|page|view)/gi
  const candidates = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = screenKeywordPattern.exec(enrichedPrompt)) !== null) {
    const name = (match[1] ?? match[2]).toLowerCase()
    if (!inventoryNames.has(name)) candidates.add(match[1] ?? match[2])
  }
  // Also check for capitalized words that look like screen names
  const COMMON_WORDS = new Set([
    'the',
    'and',
    'for',
    'with',
    'add',
    'new',
    'create',
    'build',
    'that',
    'from',
    'this',
    'screen',
    'page',
    'view',
    'tab',
  ])
  for (const word of enrichedPrompt.split(/\s+/)) {
    if (
      word.length > 2 &&
      /^[A-Z][a-z]/.test(word) &&
      !COMMON_WORDS.has(word.toLowerCase()) &&
      !inventoryNames.has(word.toLowerCase())
    ) {
      candidates.add(word)
    }
  }
  const newScreens = [...candidates]

  // Modified files: use modification plan if provided, otherwise fall back to navGraph heuristic
  const modifiedFiles: string[] = []
  if (modificationPlan && modificationPlan.items.length > 0) {
    // D-04: Use actual modification plan items (replaces heuristic)
    for (const item of modificationPlan.items) {
      modifiedFiles.push(item.filePath)
    }
  } else if (appContext?.navGraph) {
    // Fallback heuristic: if navGraph has tab nodes, the entry point file likely needs modification
    const tabNodes = appContext.navGraph.filter((n) => n.type === 'tab')
    if (tabNodes.length > 0 && appContext.entryPoint) {
      const entryScreen = appContext.inventory.find((e) => e.name === appContext.entryPoint)
      if (entryScreen) modifiedFiles.push(entryScreen.filePath)
    }
  }

  // Token count: sum of color keys + spacing keys
  const colorCount = existingDesignTokens ? Object.keys(existingDesignTokens.colors).length : 0
  const spacingCount = existingDesignTokens ? Object.keys(existingDesignTokens.spacing).length : 0
  const tokenCount = colorCount + spacingCount

  // Test files: one per new screen
  const testFilesToGenerate = newScreens.map((s) => `${s}Test`)

  return {
    newScreens,
    modifiedFiles,
    designStrategy: penStrategy,
    testFilesToGenerate,
    tokenCount,
    enrichedPrompt,
    designDelta: designDelta ?? undefined,
  }
}

/**
 * Snapshot all source files in the project before agent runs (D-06).
 * Only snapshots files in the source directory (Sources/ for SwiftUI, app/src/main/ for Kotlin).
 * Excludes test dirs, build artifacts, and config files.
 */
export async function snapshotSourceFiles(
  runner: import('@appifex/core').Runner,
  platform: import('@appifex/core').Platform,
): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>()
  // Only snapshot source directories — not tests, build, or config
  const sourceGlob = platform === 'swiftui' ? 'Sources/**/*.swift' : 'app/src/main/**/*.kt'
  const allFiles = await runner.glob(sourceGlob)

  for (const filePath of allFiles) {
    // Exclude known non-source dirs that might match glob
    if (
      filePath.includes('__tests__/') ||
      filePath.includes('build/') ||
      filePath.includes('.dtc-debug/') ||
      filePath.includes('node_modules/')
    ) {
      continue
    }
    try {
      const content = await runner.readFile(filePath)
      snapshot.set(filePath, content)
    } catch {
      // File unreadable — skip it
    }
  }
  return snapshot
}

/**
 * Revert any files that changed but were not in the modification plan (D-07).
 * New files (not in snapshot) are always preserved.
 * Returns list of reverted file paths.
 */
export async function revertUnexpectedChanges(
  runner: import('@appifex/core').Runner,
  snapshot: Map<string, string>,
  modificationPlan: import('@appifex/core').ModificationPlan,
): Promise<string[]> {
  const allowedPaths = new Set(modificationPlan.items.map((i) => i.filePath))
  const reverted: string[] = []

  for (const [filePath, originalContent] of snapshot) {
    // Files in the modification plan are allowed to change
    if (allowedPaths.has(filePath)) continue

    try {
      const currentContent = await runner.readFile(filePath)
      if (currentContent !== originalContent) {
        await runner.writeFile(filePath, originalContent)
        reverted.push(filePath)
      }
    } catch {
      // File was deleted — restore it
      try {
        await runner.writeFile(filePath, originalContent)
        reverted.push(filePath)
      } catch {
        // Can't restore — skip
      }
    }
  }
  return reverted
}

/**
 * Dependency bundle for {@link runTestRegenPhase}.
 *
 * Phase 11 — QUALITY-01a + QUALITY-01b. Injected rather than closed-over
 * so the helper is unit-testable without standing up the full pipeline.
 */
export interface RunTestRegenDeps {
  runner: import('@appifex/core').Runner
  outputDir: string
  platform: import('@appifex/core').Platform
  runMode: import('@appifex/core').RunMode
  preAgentSnapshot: Map<string, string> | undefined
  platformSpec: import('@appifex/core').PlatformSpec
  ctxBuilder: RunContextBuilder
  emit: (
    phase: PhaseId,
    status: 'started' | 'running' | 'completed' | 'failed' | 'skipped',
    message: string,
  ) => void
  flushContext: () => Promise<void>
  flowDir: string
  testDir: string
  bundleId: string
  designScreenshots: Record<string, string>
}

/**
 * Phase 11 test_regen phase (QUALITY-01a + QUALITY-01b).
 *
 * MUST run AFTER revertUnexpectedChanges so that reverted out-of-plan edits
 * don't register as false-positive modifications (RESEARCH.md Pitfall 1).
 * Double-gates on runMode AND preAgentSnapshot (RESEARCH.md Pitfall 6) so
 * fresh-app runs are not contaminated.
 *
 * Zero-delta semantics (D-10): emits `test_regen` skipped and writes nothing.
 *
 * Byte-identical guarantee (QUALITY-01b):
 *   - Maestro flows are per-screen files; untouched screens' files are never
 *     opened.
 *   - generateSpecUnitTests with a non-empty screenFilter writes to a DISTINCT
 *     filename (ViewTests+Regen.swift / ScreenTestRegen.kt) so the original
 *     combined ViewTests.swift / ScreenTest.kt is never overwritten.
 */
export async function runTestRegenPhase(deps: RunTestRegenDeps): Promise<void> {
  const {
    runner,
    outputDir,
    platform,
    runMode,
    preAgentSnapshot,
    platformSpec,
    ctxBuilder,
    emit,
    flushContext,
    flowDir,
    testDir,
    bundleId,
    designScreenshots,
  } = deps

  // Pitfall 6 double-gate: fresh-app runs must not reach the diff.
  if (runMode !== 'add-feature' || !preAgentSnapshot) return

  const modifiedScreens = await diffScreenInventory(outputDir, platform, runner, preAgentSnapshot)
  ctxBuilder.setModifiedScreens(modifiedScreens)

  const screenFilter = new Set<string>([...modifiedScreens.added, ...modifiedScreens.modified])

  if (screenFilter.size === 0) {
    // D-10: zero-delta → emit skipped, write nothing, flush and move on.
    emit('test_regen', 'skipped', 'No modified screens')
    await flushContext()
    return
  }

  emit(
    'test_regen',
    'started',
    `Regenerating tests for ${screenFilter.size} screen(s): ${[...screenFilter].join(', ')}`,
  )

  // Regenerate Maestro UI flows — per-screen files so the byte-identical
  // guarantee for untouched flows is automatic.
  const filteredFlows = generateUITests(platformSpec, {
    bundleId,
    designScreenshots,
    screenFilter,
  })
  for (const flow of filteredFlows) {
    await runner.writeFile(join(flowDir, flow.fileName), flow.content)
  }

  // Regenerate spec unit tests to a DISTINCT filename (Pitfall 3 mitigation
  // via Plan 11-03 — ViewTests+Regen.swift / ScreenTestRegen.kt).
  const filteredUnitTests = generateSpecUnitTests(platformSpec, screenFilter)
  for (const test of filteredUnitTests) {
    await runner.writeFile(join(testDir, test.fileName), test.content)
  }

  emit(
    'test_regen',
    'completed',
    `Regenerated ${filteredFlows.length + filteredUnitTests.length} test file(s)`,
  )
  await flushContext()
}

/**
 * Dependency bundle for {@link runDesignDeltaPhase}.
 *
 * Phase 12 — QUALITY-02b + QUALITY-02c. Extracted so the phase is unit-testable
 * without standing up the full pipeline (mirrors RunTestRegenDeps pattern).
 */
export interface RunDesignDeltaDeps {
  runMode: import('@appifex/core').RunMode
  existingDesignTokens: DesignTokens | null
  /** Incoming spec tokens (right-hand side of the diff) */
  newDesignTokens: DesignTokens
  ctxBuilder: RunContextBuilder
  emit: (
    phase: PhaseId,
    status: 'started' | 'running' | 'completed' | 'failed' | 'skipped',
    message: string,
  ) => void
  interactive: boolean
  /** Pre-built readline interface for interactive mode. Undefined in non-interactive mode. */
  readline?: {
    question: (prompt: string, callback: (answer: string) => void) => void
    close: () => void
  }
  /** Non-interactive override: accept design drift without failing closed (D-12) */
  acceptDrift?: boolean
}

/**
 * Phase 12 design_delta phase (QUALITY-02b + QUALITY-02c).
 *
 * Computes the token delta between existing .pen tokens and the incoming spec tokens,
 * surfaces drift to the user (interactive) or fails closed (non-interactive with drift),
 * and writes the delta to ctxBuilder for persistence.
 *
 * Gate triggers on changed || removed (D-11) — removed tokens are equally breaking.
 * Pure-addition deltas flow through silently (criterion #3).
 * Fresh-app runs (runMode !== 'add-feature') skip the phase entirely (D-02).
 */
export async function runDesignDeltaPhase(
  deps: RunDesignDeltaDeps,
): Promise<DesignDeltaReport | null> {
  const {
    runMode,
    existingDesignTokens,
    newDesignTokens,
    ctxBuilder,
    emit,
    interactive,
    readline,
    acceptDrift,
  } = deps

  // D-02: Fresh-app runs skip entirely — no design_delta events, no run-context field
  if (runMode !== 'add-feature') return null

  emit('design_delta', 'started', 'Computing token delta')

  // D-03: No baseline → skipped, proceed without writing designDelta
  if (existingDesignTokens === null) {
    emit('design_delta', 'skipped', 'No baseline .pen tokens available')
    ctxBuilder.recordPhase('design_delta', 'skipped', 'No baseline .pen tokens available')
    return null
  }

  const designDelta = diffDesignTokens(existingDesignTokens, newDesignTokens)
  const { added, removed, changed } = designDelta
  ctxBuilder.setDesignDelta(designDelta)
  ctxBuilder.recordPhase(
    'design_delta',
    'completed',
    `${added.length} added / ${removed.length} removed / ${changed.length} changed`,
  )
  emit(
    'design_delta',
    'completed',
    `${added.length} added / ${removed.length} removed / ${changed.length} changed`,
  )

  const hasDrift = changed.length > 0 || removed.length > 0

  if (interactive !== false) {
    if (!readline) {
      throw new Error(
        'Internal error: runDesignDeltaPhase called with interactive=true but no readline interface',
      )
    }
    // Interactive gate: prompt with drift-aware text (D-10)
    const promptText = hasDrift
      ? 'Drift detected. Proceed with this plan? [y/N] '
      : 'Proceed with this plan? [Y/n] '

    const answer = await new Promise<string>((resolve) => {
      readline!.question(promptText, resolve)
    })
    readline!.close()

    const cancelled = hasDrift ? answer.toLowerCase() !== 'y' : answer.toLowerCase() === 'n'
    if (cancelled) {
      // Phase 13 (Pitfall 5): emit failed so the centralized hook writes a {failed}
      // design_delta row before the throw escapes to the outer API catch.
      emit('design_delta', 'failed', 'Pipeline cancelled by user at pre-build summary.')
      throw new Error('Pipeline cancelled by user at pre-build summary.')
    }
  } else {
    // D-12: Non-interactive fail-closed on breaking drift
    if (hasDrift && acceptDrift !== true) {
      const c = changed.length
      const r = removed.length
      // Phase 13 (Pitfall 5): emit failed so the centralized hook writes a {failed}
      // design_delta row before the throw escapes.
      emit(
        'design_delta',
        'failed',
        `Design drift detected (${c} changed, ${r} removed) — fail-closed in non-interactive mode.`,
      )
      throw new Error(
        `Design drift detected (${c} changed, ${r} removed). Review .dtc/run-context.json.designDelta and re-run interactively, or pass --accept-drift to proceed. Fail-closed to prevent silent CI breakage.`,
      )
    }
  }

  return designDelta
}

/** Centralized interactive-mode check (D-01). All prompt sites call this. */
export function isInteractive(opts: Pick<PipelineOpts, 'interactive'>): boolean {
  if (opts.interactive !== undefined) return opts.interactive
  return process.stdin.isTTY === true
}

export interface PipelineOpts {
  prompt: string
  platform: Platform
  outputDir: string
  /** Path to existing design file (.pen for Pencil, .zip for Stitch export) */
  designFile?: string
  /**
   * Phase 1 Plan 07 (GATE-02): Path to a pre-extracted design IR JSON
   * ({ spec: PlatformSpec, tokens: DesignTokens, ... }). When set, the design
   * phase is bypassed and the checkpoint is hydrated directly from the JSON.
   * Mutually exclusive with `designFile`.
   */
  designIrPath?: string
  requirements?: string[]
  configDir?: string
  interactive?: boolean
  generateFn?: GenerateFn
  fixFn?: (failures: ValidationResult) => Promise<{ filesChanged: string[]; tokensUsed: number }>
  verbose?: boolean
  /** Benchmark mode: disable all fix loop limits (max attempts, token budget, circuit breakers) */
  benchmark?: boolean
  /** Override skills directory for this run (takes precedence over config) */
  skillsDir?: string
  /** Agent CLI type: claude, codex, gemini, auto (detect), api (legacy pipeline) */
  agentType?: AgentConfigType
  /** Resume a previous agent session by ID (skips design/spec/test gen) */
  resumeSessionId?: string
  /** How this run was initiated (fresh, resume, add-feature, refactor) */
  runMode?: RunMode
  /** Backend API context — when present, the generated app includes networking code */
  backendContext?: BackendContext
  /** Non-interactive override: accept design drift without failing closed (D-12) */
  acceptDrift?: boolean
  /** Phase 14 D-02: force a fresh add-feature run even when checkpoint DB exists */
  noResume?: boolean
  /** BaaS provider selection. CLI --baas-provider > config baas.provider > null (skip BaaS) */
  baasProvider?: BaasProvider
}

export interface PipelineResult {
  report: PipelineReport
  validation: ValidationResult
  markdown: string
  deliver?: DeliverResult
}

export async function runPipeline(
  opts: PipelineOpts,
  progress: ProgressEmitter,
): Promise<PipelineResult> {
  const configDir = opts.configDir ?? join(homedir(), '.dtc')
  const config = await loadConfig(configDir)

  // Phase 03 Plan 02 (SETUP-02): runPreflight is the SOLE LLM-spend gate — it MUST run before
  // any generate/agent invocation. Do not move below this line.
  {
    const { runPreflight } = await import('./preflight.js')
    await runPreflight(opts.platform, config, { deep: false })
  }

  // Ensure output directory exists before creating runner
  const { mkdir } = await import('node:fs/promises')
  const outputDir = opts.outputDir.startsWith('/')
    ? opts.outputDir
    : join(process.cwd(), opts.outputDir)
  await mkdir(outputDir, { recursive: true })

  // Best-effort preview opener — works on macOS/Linux/Windows, no-ops in CI
  async function openPreview(path: string) {
    try {
      const opener =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
      const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path]
      await runner.exec(opener, args)
    } catch {
      /* no GUI opener available */
    }
  }

  const runner = createRunner(config.runner, { cwd: outputDir })
  const budget = new TokenBudget(config.tokenBudget ?? { total: 100_000 })
  const appName = deriveAppName(opts.prompt)

  // Load skills: CLI flag > config > bundled defaults
  const skillsDir = opts.skillsDir ?? config.skillsDir
  const skillProvider = skillsDir
    ? createFileSkillProvider(skillsDir)
    : createBundledSkillProvider()
  const skills: SkillContent = await skillProvider.load(opts.platform)

  // Debug logger
  const debug = createDebugLogger(outputDir, opts.verbose ?? false)
  await debug.logJson('config.json', { ...config, llm: { ...config.llm, apiKey: '***' } })
  await debug.log('skills-spec.md', skills.specPrompt)
  await debug.log('skills-codegen.md', skills.codegenPrompt)
  await debug.log('skills-fix.md', skills.fixPrompt)

  // Helper: build an LLM message function from config
  async function buildCreateMessageFn(cfg: DtcConfig) {
    // Phase 1 Plan 01-10 (GATE-02): fixture-replay short-circuit.
    // When DTC_LLM_MODE=fixture, ignore provider config and return a cassette-backed
    // createMessage. Key is routed by the prompt shape:
    //   - includes "backend data architect" or "\"entities\"" → baas-schema
    //   - includes "Fix the following errors" or "===FIX:" → fix
    //   - otherwise → codegen
    if (isFixtureMode()) {
      return async (params: {
        model: string
        max_tokens: number
        messages: Array<{ role: string; content: any }>
      }) => {
        const flat = params.messages
          .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
          .join('\n')
        let key = 'codegen'
        if (flat.includes('backend data architect') || flat.includes('"entities"'))
          key = 'baas-schema'
        else if (flat.includes('Fix the following errors') || flat.includes('===FIX:')) key = 'fix'
        return loadFixture(key)
      }
    }

    // Claude CLI — shell out to `claude --print` for text-only LLM calls
    if (cfg.llm.provider === 'claude-cli') {
      return async (params: {
        model: string
        max_tokens: number
        messages: Array<{ role: string; content: any }>
      }) => {
        const prompt = params.messages
          .map((m) => {
            if (typeof m.content === 'string') return m.content
            if (Array.isArray(m.content))
              return m.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('\n')
            return String(m.content)
          })
          .join('\n\n')

        const model = cfg.llm.model ?? 'claude-sonnet-4-6'
        // Phase 02 Plan 03 (FOUND-03): delegate to exported runClaudePrint so the
        // spawn site is unit-testable and EPIPE hard-fails with typed EpipeError
        // instead of being silently swallowed.
        return runClaudePrint({ prompt, model, cwd: outputDir })
      }
    }

    if (cfg.llm.provider === 'copilot' && cfg.llm.githubToken) {
      // Use Copilot SDK — create a fresh session per call to avoid reusing a disconnected session
      const { CopilotClient } = await import('@github/copilot-sdk')
      return async (params: {
        model: string
        max_tokens: number
        messages: Array<{ role: string; content: any }>
      }) => {
        // Serialize all messages into a single prompt so Copilot sees full context
        const prompt = params.messages
          .map((m) => {
            if (typeof m.content === 'string') return m.content
            if (Array.isArray(m.content))
              return m.content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text)
                .join('\n')
            return String(m.content)
          })
          .join('\n\n')

        const client = new CopilotClient({
          githubToken: cfg.llm.githubToken,
          useLoggedInUser: false,
        }) as any
        await client.start()
        try {
          const session = await client.createSession({
            model: cfg.llm.model ?? 'claude-sonnet-4-6',
            onPermissionRequest: () => ({ allow: true }),
          })
          const resp = await session.sendAndWait({ prompt })
          const text = resp?.data?.content ?? ''
          await session.disconnect()
          return { content: [{ type: 'text', text }], usage: { input_tokens: 0, output_tokens: 0 } }
        } finally {
          await client.stop()
        }
      }
    }
    // Google Gemini via native API (supports vision natively)
    if (cfg.llm.provider === 'google') {
      return async (params: {
        model: string
        max_tokens: number
        messages: Array<{ role: string; content: any }>
      }) => {
        const model = cfg.llm.model ?? 'gemini-3.1-pro-preview'

        // Convert OpenAI message format to Gemini native format
        const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> =
          []
        for (const msg of params.messages) {
          if (typeof msg.content === 'string') {
            parts.push({ text: msg.content })
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'text') {
                parts.push({ text: part.text })
              } else if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
                // data:image/png;base64,... → inline_data
                const dataMatch = part.image_url.url.match(/^data:(.+?);base64,(.+)$/)
                if (dataMatch) {
                  parts.push({ inline_data: { mime_type: dataMatch[1], data: dataMatch[2] } })
                }
              }
            }
          }
        }

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.llm.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { maxOutputTokens: params.max_tokens },
            }),
          },
        )
        if (!resp.ok) {
          const err = await resp.text()
          // Sanitize API key from error message to prevent credential leakage in logs
          const safeErr = cfg.llm.apiKey ? err.replace(cfg.llm.apiKey, '***') : err
          throw new Error(`Gemini API error ${resp.status}: ${safeErr}`)
        }
        const data = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
        }
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
        const inputTokens = data.usageMetadata?.promptTokenCount ?? 0
        const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        }
      }
    }

    // OpenAI
    if (cfg.llm.provider === 'openai') {
      const baseUrl = 'https://api.openai.com/v1'
      return async (params: {
        model: string
        max_tokens: number
        messages: Array<{ role: string; content: any }>
      }) => {
        const model = cfg.llm.model ?? 'gpt-4.1'
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.llm.apiKey}`,
          },
          body: JSON.stringify({ model, max_tokens: params.max_tokens, messages: params.messages }),
        })
        if (!resp.ok) {
          const err = await resp.text()
          const safeErr = cfg.llm.apiKey ? err.replace(cfg.llm.apiKey, '***') : err
          throw new Error(`OpenAI API error ${resp.status}: ${safeErr}`)
        }
        const data = (await resp.json()) as {
          choices: Array<{ message: { content: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        const text = data.choices?.[0]?.message?.content ?? ''
        return {
          content: [{ type: 'text', text }],
          usage: {
            input_tokens: data.usage?.prompt_tokens ?? 0,
            output_tokens: data.usage?.completion_tokens ?? 0,
          },
        }
      }
    }

    // Default: Anthropic SDK (convert image_url to Anthropic image format)
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: cfg.llm.apiKey })
    return async (params: {
      model: string
      max_tokens: number
      messages: Array<{ role: string; content: any }>
    }) => {
      // Convert OpenAI image_url format to Anthropic image format
      const messages = params.messages.map((msg) => {
        if (Array.isArray(msg.content)) {
          const content = msg.content.map((part: any) => {
            if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
              const dataMatch = part.image_url.url.match(/^data:(.+?);base64,(.+)$/)
              if (dataMatch) {
                return {
                  type: 'image',
                  source: { type: 'base64', media_type: dataMatch[1], data: dataMatch[2] },
                }
              }
            }
            return part
          })
          return { ...msg, content }
        }
        return msg
      })
      // Use streaming to avoid timeout on long-running requests
      const stream = client.messages.stream({ ...params, messages } as any)
      const finalMessage = await stream.finalMessage()
      return {
        content: finalMessage.content.map((c: any) => ({
          type: c.type,
          text: c.type === 'text' ? c.text : '',
        })),
        usage: finalMessage.usage,
      }
    }
  }
  // Cache the LLM message function — config doesn't change between phases
  let _cachedCreateMessage: Awaited<ReturnType<typeof buildCreateMessageFn>> | undefined
  async function getCreateMessage() {
    if (!_cachedCreateMessage) {
      _cachedCreateMessage = await buildCreateMessageFn(config)
    }
    return _cachedCreateMessage
  }

  const tokenUsage: Partial<Record<string, number>> = {}
  const startTime = Date.now()

  // ── Run Context builder — accumulates phase outcomes for persistence ──
  const runMode: RunMode = opts.runMode ?? 'fresh'
  const previousContext = await loadRunContext(outputDir)

  // On resume, preserve the original prompt from previous context instead of the placeholder
  const RESUME_PLACEHOLDER = 'Resume previous session'
  let effectivePrompt =
    opts.prompt === RESUME_PLACEHOLDER && previousContext?.prompt
      ? previousContext.prompt
      : opts.prompt
  const ctxBuilder = new RunContextBuilder({
    prompt: effectivePrompt,
    platform: opts.platform,
    mode: runMode,
  })

  // Phase 13 (QUALITY-03a): track phase currently executing so the outer API-path
  // catch (Pitfall 6) can attribute any thrown exception to the right checkpoint row.
  let currentPhase: PhaseId | null = null

  // Phase 19: BaaS recommendation — carried from baas_recommend phase to pre-build summary (D-08)
  let baasRecommendation: BaasRecommendation | undefined

  // WIRE-02: Hoisted to outer scope so it's accessible in the pre-build dependency patching
  // section (after the if (runMode === 'add-feature') block where it was previously declared).
  // D-01: Pre-wizard probe — detect provider from filesystem signals before falling
  // back to config. CLI flag still takes highest priority.
  const detectedProvider = await detectBaasProvider(runner, outputDir)
  if (detectedProvider) {
    progress.emit({
      phase: 'baas_recommend',
      status: 'running',
      message: `Auto-detected BaaS provider: ${detectedProvider}`,
      timestamp: Date.now(),
    })
  }
  let resolvedBaasProvider: BaasProvider | null =
    opts.baasProvider ?? detectedProvider ?? config.baas?.provider ?? null

  const emit = (
    phase: PhaseId,
    status: 'started' | 'running' | 'completed' | 'failed' | 'skipped',
    message: string,
    tokens?: number,
  ) => {
    currentPhase = phase // Phase 13: update before any side effects so the outer catch sees it
    progress.emit({ phase, status, message, timestamp: Date.now(), tokensUsed: tokens })
    if (tokens) {
      budget.consume(phase, tokens)
      tokenUsage[phase] = (tokenUsage[phase] ?? 0) + tokens
    }
    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      ctxBuilder.recordPhase(phase, status === 'skipped' ? 'skipped' : status, message)

      // Phase 13 (QUALITY-03a): centralized add-feature checkpoint write — log-and-continue.
      // Writes first with a minimal base payload; targeted downstream writes (analysis sidecar,
      // plus existing fresh-app writes at 923/937/1291/1440) rely on Checkpoint's upsert
      // semantics to overwrite with richer payloads.
      if (runMode === 'add-feature') {
        try {
          const now = new Date().toISOString()
          if (status === 'completed') {
            checkpoint.savePhase(checkpointRunId, phase, { status: 'completed', completedAt: now })
          } else if (status === 'failed') {
            checkpoint.savePhase(checkpointRunId, phase, {
              status: 'failed',
              error: message,
              failedAt: now,
              completedAt: now,
            })
          } else {
            checkpoint.savePhase(checkpointRunId, phase, {
              status: 'skipped',
              reason: message,
              completedAt: now,
            })
          }
        } catch (err) {
          // Log-and-continue per specifics #5 — MUST NOT re-throw
          console.error(`[checkpoint] savePhase failed for ${phase}/${status}: ${String(err)}`)
        }
      }
    }
  }

  // Incremental context save — flush current state after each phase completes/fails/skips
  // Defaults to 'failed' so that if the process is killed mid-run, on-disk state reflects an incomplete run
  const flushContext = async (status: 'failed' | 'completed' | 'budget_exceeded' = 'failed') => {
    try {
      await saveRunContext(outputDir, ctxBuilder.build(status))
    } catch {
      /* must not block pipeline */
    }
  }

  // Track whether user supplied a real prompt (not the auto-generated placeholder)
  const userProvidedPrompt = opts.prompt !== 'Build the app matching the provided design'

  // Determine which phases can be skipped based on previous context
  const isContinuation = runMode !== 'fresh'

  // Checkpoint — phase-level resume via SQLite (T-02-02: create .dtc/ before instantiation)
  const dtcDir = join(outputDir, '.dtc')
  await mkdir(dtcDir, { recursive: true })
  // Phase 13 (QUALITY-03a): sidecar directory for preAgent snapshots
  await mkdir(join(dtcDir, 'snapshots'), { recursive: true })
  const checkpointRunId =
    isContinuation && previousContext?.runId
      ? previousContext.runId
      : `run-${randomUUID().slice(0, 8)}`
  const checkpoint = new Checkpoint(join(dtcDir, 'checkpoint.db'))

  // T-02-04: ensure checkpoint closes on process exit (catches crashes and normal exits)
  const exitCleanup = () => {
    try {
      checkpoint.close()
    } catch {
      /* ignore */
    }
  }
  process.on('exit', exitCleanup)

  // SIGINT handler — synchronous flush to disk before exiting on Ctrl+C
  // Uses writeFileSync because process.on('SIGINT') does not await async handlers
  let sigintFlushed = false
  const sigintHandler = () => {
    if (sigintFlushed) return // prevent double-flush
    sigintFlushed = true
    try {
      const ctxDir = join(outputDir, '.dtc')
      mkdirSyncFs(ctxDir, { recursive: true })
      writeFileSyncFs(
        join(ctxDir, 'run-context.json'),
        JSON.stringify(ctxBuilder.build('failed'), null, 2),
      )
    } catch {
      /* best effort */
    }
    try {
      checkpoint.close()
    } catch {
      /* best effort */
    }
    process.exit(130) // 128 + SIGINT(2) = standard exit code
  }
  process.on('SIGINT', sigintHandler)

  // Phase 14 (QUALITY-03b, QUALITY-03c): resume bootstrap — detects eligibility,
  // verifies sidecar integrity, runs drift check. Returns null on first-run or
  // --no-resume. Throws ResumeAbortError on any hard error (drift, corrupt DB,
  // runId mismatch, missing run-context). See cli/src/resume-bootstrap.ts.
  const { runResumeBootstrap, ResumeAbortError } = await import('./resume-bootstrap.js')
  let resumeState: Awaited<ReturnType<typeof runResumeBootstrap>> = null
  try {
    resumeState = await runResumeBootstrap({
      outputDir,
      runMode,
      noResume: opts.noResume ?? false,
      previousContext,
      checkpoint,
      checkpointRunId,
      logBanner: (msg) => {
        console.error(msg)
      },
    })
  } catch (err) {
    if (err instanceof ResumeAbortError) {
      try {
        checkpoint.close()
      } catch {
        /* ignore */
      }
      // Phase 02 Plan 01 (FOUND-04): throw new ResumeAbortError instead of
      // process.exit(err.exitCode) so the MCP host survives. entry.ts top-level
      // catch renders the message; MCP tool wrapper translates to isError envelope.
      throw new ResumeAbortError(err.message)
    }
    throw err
  }
  // Phase 14 (D-08, D-09, D-11) + Phase 18 Plan 01: skip-gate is delegated to
  // the pure `createSkipGate` helper so the same logic is unit-testable and
  // shared between the runtime closure and the vitest regression suite.
  // FORCE_RERUN_PHASES is checked first inside the helper (D-09), followed by
  // the add-feature spec short-circuit (Phase 18 Bug A fix), then the
  // previousContext / resumeState rules (D-08, D-11).
  const skipGate = createSkipGate({ runMode, isContinuation, previousContext, resumeState })
  const canSkipPhase = (phase: PhaseId): boolean => skipGate.canSkipPhase(phase)

  // ── Analysis phase (add-feature only) ──
  let appContext: AppContext | null = null
  if (runMode === 'add-feature' && !canSkipPhase('analysis')) {
    // D-09: Backup run-context BEFORE anything else
    const { backupRunContext } = await import('@appifex/analysis')
    const backupPath = await backupRunContext(outputDir)
    if (backupPath) {
      emit('analysis', 'running', `Backed up run-context to ${backupPath}`)
    }

    emit('analysis', 'started', 'Scanning existing project')
    try {
      const { scanProject, buildNavGraph } = await import('@appifex/analysis')
      const inventory = await scanProject(outputDir, opts.platform, runner)
      const navResult = await buildNavGraph(outputDir, opts.platform, runner)
      appContext = {
        platform: opts.platform,
        inventory,
        navGraph: navResult.nodes,
        entryPoint: navResult.entryPoint,
        scannedAt: Date.now(),
      }
      ctxBuilder.recordPhase(
        'analysis',
        'completed',
        `${inventory.length} files — ${inventory.filter((e) => e.type === 'screen').length} screens, ${inventory.filter((e) => e.type === 'component').length} components`,
        { appContext },
      )
      emit(
        'analysis',
        'completed',
        `Found ${inventory.filter((e) => e.type === 'screen').length} screens, ${navResult.nodes.length} nav nodes`,
      )
    } catch (err) {
      emit('analysis', 'failed', String(err))
      await flushContext()
      throw err
    }
  } else if (runMode === 'add-feature' && resumeState !== null) {
    emit(
      'analysis',
      'skipped',
      `Resumed from checkpoint (lastCompleted=${resumeState.lastCompletedPhase})`,
    )
    // D-20: rehydrate appContext from previousContext. The original run stored it
    // via recordPhase('analysis', 'completed', summary, { appContext }) at
    // pipeline.ts:845-847, so detail is { appContext } — access with the typed cast:
    const analysisDetail = previousContext?.phases.analysis?.detail as
      | { appContext?: AppContext }
      | undefined
    if (analysisDetail?.appContext) {
      appContext = analysisDetail.appContext
    } else {
      // Defensive: if previousContext is missing the detail payload (unlikely
      // because runResumeBootstrap already validated previousContext exists),
      // abort rather than continue with a stale appContext.
      throw new Error(
        'Resume inconsistency: previousContext.phases.analysis.detail.appContext is missing. ' +
          'Run `dtc run --add-feature --no-resume` to start fresh.',
      )
    }
  }

  // ── Feature prompt vagueness check (add-feature only) ──
  if (runMode === 'add-feature') {
    const { isFeaturePromptVague, generateFeatureAssumptions } = await import('@appifex/mcp-server')

    if (isFeaturePromptVague(effectivePrompt)) {
      const assumptionResult = generateFeatureAssumptions(effectivePrompt, appContext)

      if (isInteractive(opts)) {
        // D-10: CLI interactive mode — print assumptions and prompt Y/n
        const { formatAssumptionBlock } = await import('./views/format.js')
        const { hasKeywords } = await import('@appifex/mcp-server')
        const missingDims: string[] = []
        if (
          !hasKeywords(effectivePrompt, [
            'screen',
            'page',
            'view',
            'tab',
            'button',
            'action',
            'list',
            'section',
            'modal',
            'sheet',
            'form',
            'input',
          ])
        ) {
          missingDims.push('Missing: what type of element to add (screen, button, tab, etc.)')
        }
        if (
          !hasKeywords(effectivePrompt, [
            'to',
            'on',
            'in',
            'inside',
            'from',
            'navigation',
            'tab bar',
            'home',
            'settings',
            'profile',
          ])
        ) {
          missingDims.push('Missing: where the element goes (which screen or nav target)')
        }
        if (
          !hasKeywords(effectivePrompt, [
            'show',
            'display',
            'let',
            'allow',
            'enable',
            'create',
            'add',
            'delete',
            'edit',
            'update',
            'save',
          ])
        ) {
          missingDims.push('Missing: what the element does (action, data shown, or trigger)')
        }

        console.log(formatAssumptionBlock(assumptionResult.assumptions, missingDims))
        console.log('')

        // Use readline for Y/n prompt
        const readline = await import('node:readline')
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const answer = await new Promise<string>((resolve) => {
          rl.question('Proceed with these assumptions? [Y/n] ', resolve)
        })
        rl.close()

        if (answer.toLowerCase() === 'n') {
          const { default: chalk } = await import('chalk')
          console.log(
            chalk.yellow(
              '-> Describe what to add, where it goes, and what it does, then run again.',
            ),
          )
          throw new Error('Pipeline cancelled. Provide a more specific prompt and try again.')
        }

        // Bake assumptions into prompt
        effectivePrompt = [
          effectivePrompt,
          ...assumptionResult.assumptions.map((a: { description: string }) => a.description),
        ].join('. ')
      } else {
        // D-10 / Pitfall 5: Non-interactive mode — auto-proceed with assumptions
        progress.emit({
          phase: 'design',
          status: 'running',
          message: assumptionResult.summary,
          timestamp: Date.now(),
        })
        progress.emit({
          phase: 'design',
          status: 'running',
          message: 'Non-interactive mode: proceeding with assumptions above',
          timestamp: Date.now(),
        })
        effectivePrompt = [
          effectivePrompt,
          ...assumptionResult.assumptions.map((a: { description: string }) => a.description),
        ].join('. ')
      }
    }
  }

  // ── Modification planning (add-feature only, per D-03/D-04) ──
  // Runs AFTER vagueness enrichment so planModifications sees the enriched prompt (D-02)
  let modificationPlan: import('@appifex/core').ModificationPlan = { items: [] }
  if (runMode === 'add-feature' && appContext) {
    if (resumeState !== null && previousContext?.modificationPlan !== undefined) {
      // D-20: rehydrate without recomputation.
      modificationPlan = previousContext.modificationPlan
      emit(
        'analysis',
        'running',
        `Rehydrated modification plan from previous run (${modificationPlan.items.length} items)`,
      )
    } else {
      // Existing non-resume path — UNCHANGED except for the setModificationPlan
      // calls added by Plan 14-01 Task 1 step 8.
      emit('analysis', 'running', 'Planning screen modifications')
      try {
        const { planModifications } = await import('@appifex/analysis')
        const createMessage = await getCreateMessage()
        modificationPlan = await planModifications(
          effectivePrompt,
          appContext,
          outputDir,
          runner,
          createMessage,
        )
        ctxBuilder.setModificationPlan(modificationPlan)
        const count = modificationPlan.items.length
        emit(
          'analysis',
          'running',
          count > 0
            ? `Modification plan: ${count} existing file(s) to modify`
            : 'No existing files require modification',
        )
      } catch (err) {
        // Per RESEARCH anti-pattern: default to empty plan on failure, don't block pipeline
        emit(
          'analysis',
          'running',
          `Modification planning failed: ${String(err)} — proceeding without modifications`,
        )
        modificationPlan = { items: [] }
        ctxBuilder.setModificationPlan(modificationPlan)
      }
    }

    // D-05: For add-feature BaaS runs, ensure AppEntry.swift is in the modification plan
    // so the LLM merges AuthManager + deep link handling into the existing entry point.
    if (resolvedBaasProvider !== null) {
      const appEntryPath = 'Sources/AppEntry.swift'
      const alreadyIncluded = modificationPlan.items.some((i) => i.filePath === appEntryPath)
      if (!alreadyIncluded) {
        try {
          const existingContent = await runner.readFile(join(outputDir, appEntryPath))
          modificationPlan.items.push({
            filePath: appEntryPath,
            screenName: 'AppEntry',
            changeDescription:
              'Add AuthManager environment object, wrap content in auth gate (show LoginView when unauthenticated), add deep link handling via onOpenURL',
            changeType: 'navigation',
            fileContent: existingContent,
          })
          ctxBuilder.setModificationPlan(modificationPlan)
          emit(
            'analysis',
            'running',
            `Injected AppEntry.swift into modification plan for BaaS auth guard merge`,
          )
        } catch {
          // AppEntry.swift doesn't exist yet — fresh project, no merge needed.
          // The baas_auth phase will write it from template.
        }
      }
    }
  }

  // ── Design context loading (add-feature only) ──
  // Phase 18 Bug B fix: the LEFT side of runDesignDeltaPhase must come from a
  // DIFFERENT source than the RIGHT side, otherwise the delta is always zero
  // when the pencil spec path extracts the same .pen on both sides.
  //
  // - `existingDesignTokens` still reads from the current .pen — used for
  //   Pencil setVariables injection and codegen prompt context
  // - `baselineDesignTokens` (new) is loaded from previousContext.baselineDesignTokens
  //   if present — used as the LEFT side of runDesignDeltaPhase so drift is
  //   detected between the prior run's persisted tokens and the current .pen
  // - If previousContext.baselineDesignTokens is missing (pre-Phase-18 projects),
  //   baselineDesignTokens falls back to existingDesignTokens, preserving the
  //   old (zero-delta) behavior for backward compat
  let existingDesignTokens: DesignTokens | null = null
  let baselineDesignTokens: DesignTokens | null = null
  if (runMode === 'add-feature') {
    const designContextPath = join(outputDir, 'design.pen')
    const penExists = await runner.exists(designContextPath)
    if (penExists) {
      try {
        const { extractSpecFromPen } = await import('@appifex/spec')
        const penJson = await runner.readFile(designContextPath)
        const existingSpec = extractSpecFromPen(penJson)
        existingDesignTokens = existingSpec.designTokens ?? {
          colors: {},
          typography: {},
          spacing: {},
          borderRadius: {},
        }

        // D-02: Inject tokens into Pencil via setVariables before design creation
        if (config.design?.tool === 'pencil' && config.design?.apiKey) {
          try {
            const pencilClient = new PencilMcpClient({ cliKey: config.design.apiKey })
            await pencilClient.connect()
            const vars = PencilMcpClient.designTokensToVariables(existingDesignTokens)
            await pencilClient.setVariables(designContextPath, vars)
            await pencilClient.disconnect()
          } catch {
            // Pitfall 1: set_variables may not exist in Pencil MCP — fall back silently
            // Tokens still get injected into codegen prompt via existingDesignTokens
          }
        }

        const colorCount = Object.keys(existingDesignTokens.colors).length
        const spacingCount = Object.keys(existingDesignTokens.spacing).length
        emit(
          'design',
          'running',
          `${colorCount + spacingCount} tokens loaded — colors, typography, spacing`,
        )
      } catch (err) {
        // Phase 17: surface the actual error so users see why baseline tokens could not load
        const message = err instanceof Error ? err.message : String(err)
        emit('design', 'running', `failed to parse .pen: ${message}`)
      }
    } else {
      emit('design', 'running', 'no existing .pen — generating without constraints')
    }

    // Phase 18 Bug B fix: prefer persisted baseline tokens for the delta LEFT side
    if (previousContext?.baselineDesignTokens) {
      baselineDesignTokens = previousContext.baselineDesignTokens
      emit(
        'design',
        'running',
        `baseline tokens loaded from previous run (${Object.keys(baselineDesignTokens.colors).length} colors)`,
      )
    } else {
      baselineDesignTokens = existingDesignTokens
    }
  }

  // ── penStrategy hoisted here so the design phase reuses it (D-03: single call) ──
  // The pre-build summary + drift gate has been relocated to AFTER the spec-skip
  // branch close (D-10, checker iteration 1 Warning 1 fix) so it fires on both
  // fresh AND checkpoint-resumed add-feature runs.
  const penStrategy: 'new' | 'extend' = appContext
    ? decidePenFileStrategy(effectivePrompt, appContext)
    : 'new'

  // Phase 1 Plan 07 (GATE-02): --design-ir fallback path. When the caller
  // hands us a pre-extracted PlatformSpec + DesignTokens JSON, skip the
  // Pencil-MCP design phase + spec phase entirely and hydrate the checkpoint
  // straight from the JSON. Used by the hermetic E2E fixture in CI.
  let designIrInjectedSpec: PlatformSpec | undefined
  if (opts.designIrPath) {
    if (opts.designFile) {
      throw new Error('Pass exactly one of --design or --design-ir')
    }
    const { readFileSync, existsSync } = await import('node:fs')
    const irPath = opts.designIrPath.startsWith('/')
      ? opts.designIrPath
      : join(process.cwd(), opts.designIrPath)
    if (!existsSync(irPath)) {
      throw new Error(`Design IR file not found: ${irPath}`)
    }
    let irRaw: string
    try {
      irRaw = readFileSync(irPath, 'utf-8')
    } catch (err) {
      throw new Error(`Failed to read design IR ${irPath}: ${String(err)}`)
    }
    let ir: { spec?: PlatformSpec; tokens?: unknown }
    try {
      ir = JSON.parse(irRaw)
    } catch (err) {
      throw new Error(`Design IR ${irPath} is not valid JSON: ${String(err)}`)
    }
    if (!ir.spec || !Array.isArray((ir.spec as PlatformSpec).screens)) {
      throw new Error(
        `Design IR ${irPath} missing required \`spec\` field with screens[] (PlatformSpec shape)`,
      )
    }
    designIrInjectedSpec = ir.spec as PlatformSpec
  }

  // 1. Design with review loop
  const adapter = createDesignAdapter({ config: config.design, runner })
  // designPath always points to the working copy (never the user's original)
  const designPath = join(outputDir, 'design.pen')
  const previewPath = join(outputDir, 'preview.png')
  let stitchArtifacts: StitchArtifacts | undefined
  let lastDesignResult: DesignToolResult | undefined

  if (designIrInjectedSpec) {
    // Phase 1 Plan 07 (GATE-02): IR-fallback path — skip Pencil MCP entirely.
    // Persist a marker so downstream skip gates see a "design" was provided.
    emit('design', 'completed', `Using design IR: ${opts.designIrPath}`)
    checkpoint.savePhase(checkpointRunId, 'design', { designFile: opts.designIrPath ?? '' })
    await flushContext()
  } else if (opts.designFile) {
    // Explicit --design flag always wins over cached design
    const userPath = opts.designFile.startsWith('/')
      ? opts.designFile
      : join(process.cwd(), opts.designFile)
    const { copyFileSync, existsSync } = await import('node:fs')
    if (!existsSync(userPath)) {
      throw new Error(`Design file not found: ${userPath}`)
    }

    if (userPath.endsWith('.zip')) {
      // Stitch zip export — extract to .stitch/ directory
      stitchArtifacts = await extractStitchZip(userPath, outputDir)
      // Copy first screenshot as preview
      if (stitchArtifacts.screenshotPaths.length > 0) {
        copyFileSync(stitchArtifacts.screenshotPaths[0], previewPath)
      }
      emit(
        'design',
        'completed',
        `Using Stitch export: ${opts.designFile} (${stitchArtifacts.htmlPaths.length} screen(s))`,
      )
      checkpoint.savePhase(checkpointRunId, 'design', { designFile: opts.designFile })
      await flushContext()
    } else {
      // .pen file — copy to workspace and proceed directly
      if (userPath !== designPath) {
        copyFileSync(userPath, designPath)
      }
      emit('design', 'completed', `Using design: ${opts.designFile}`)
      checkpoint.savePhase(checkpointRunId, 'design', { designFile: opts.designFile })
      await flushContext()
    }
  } else if (canSkipPhase('design') && (await runner.exists(designPath))) {
    // Previous run completed design and the design file still exists — skip
    emit('design', 'skipped', 'Using design from previous run')
    checkpoint.savePhase(checkpointRunId, 'design', { designFile: designPath })
    await flushContext()
  } else {
    // ── Generate design via configured tool ──
    const designPrompt =
      adapter.tool === 'pencil'
        ? buildPencilPrompt(effectivePrompt, opts.platform)
        : effectivePrompt
    const startMsg =
      adapter.tool === 'pencil'
        ? 'Creating mobile design — this usually takes 4–5 minutes'
        : `Creating mobile design via ${adapter.tool}`
    emit('design', 'started', startMsg)

    // D-04: Decide whether to create new .pen or extend existing one
    // penStrategy already computed once above (D-03: no duplicate call)
    if (runMode === 'add-feature' && appContext) {
      if (penStrategy === 'extend') {
        // Extend existing .pen for nav-only changes
        lastDesignResult = await adapter.iterate({
          prompt: designPrompt,
          outputDir,
          inputPath: designPath,
          outputPath: designPath,
          previewPath,
        })
      } else {
        // Create new .pen file for new screens
        lastDesignResult = await adapter.create({ prompt: designPrompt, outputDir, previewPath })
      }
    } else {
      lastDesignResult = await adapter.create({ prompt: designPrompt, outputDir, previewPath })
    }

    if (!lastDesignResult.success) {
      emit('design', 'failed', lastDesignResult.error ?? 'Failed')
      await flushContext()
      throw new Error(`Design failed: ${lastDesignResult.error}`)
    }

    // Populate stitchArtifacts from result for downstream spec extraction
    if (lastDesignResult.htmlPaths.length > 0) {
      stitchArtifacts = {
        htmlPaths: lastDesignResult.htmlPaths,
        screenshotPaths: lastDesignResult.screenshotPaths,
        extractDir: lastDesignResult.outputDir,
      }
    }

    if (await runner.exists(previewPath)) {
      await openPreview(previewPath)
    }

    emit('design', 'completed', `Design created — review preview.png then approve below`)
    checkpoint.savePhase(checkpointRunId, 'design', { designFile: designPath })
    await flushContext()
  }

  let designIterations = opts.designFile ? 0 : 1

  // Interactive review loop for GENERATED designs only (user-provided designs skip this)
  if (!opts.designFile && isInteractive(opts)) {
    const clack = await import('@clack/prompts')

    console.log() // blank line after TUI
    let approved = false
    while (!approved) {
      const action = await clack.select({
        message: 'What do you think of the design?',
        options: [
          { value: 'approve', label: 'Looks good, continue', hint: 'lock tests and generate code' },
          { value: 'iterate', label: 'Change something', hint: 'describe what to update' },
          { value: 'cancel', label: 'Start over' },
        ],
      })

      if (clack.isCancel(action) || action === 'cancel') {
        throw new Error('Pipeline cancelled by user')
      }

      if (action === 'approve') {
        approved = true
        console.log() // blank line before continuing
      } else {
        const iteratePrompt = await clack.text({
          message: 'Describe the changes you want:',
          placeholder:
            'e.g. Make cards 2-column grid, add priority color badges, bigger add button',
          validate: (v) => (v.length === 0 ? 'Please describe what to change' : undefined),
        })
        if (clack.isCancel(iteratePrompt)) {
          throw new Error('Pipeline cancelled by user')
        }

        emit('design', 'started', `Iterating (round ${designIterations + 1})`)
        const iterResult = await adapter.iterate({
          prompt: iteratePrompt as string,
          outputDir,
          previewPath,
        })
        if (iterResult.success && iterResult.htmlPaths.length > 0) {
          stitchArtifacts = {
            htmlPaths: iterResult.htmlPaths,
            screenshotPaths: iterResult.screenshotPaths,
            extractDir: iterResult.outputDir,
          }
        }
        designIterations++

        if (!iterResult.success) {
          emit('design', 'failed', iterResult.error ?? 'Iteration failed')
          throw new Error(`Design iteration failed: ${iterResult.error}`)
        }

        // Re-open updated preview (best-effort — skip in CI/headless)
        if (await runner.exists(previewPath)) {
          await openPreview(previewPath)
        }

        emit(
          'design',
          'completed',
          `Design updated (iteration ${designIterations}) — review and approve`,
        )
      }
    }
  } else if (!opts.designFile) {
    emit('design', 'running', 'Non-interactive mode: auto-approving design')
  }

  // ── Shared MCP client for layout validation, spec extraction, and image export ──
  // (Pencil only — Stitch uses SDK, Figma Make uses its own MCP)
  const pencilKey = config.design.apiKey || process.env.PENCIL_CLI_KEY || ''
  let mcpClient: InstanceType<typeof PencilMcpClient> | null = null
  if (adapter.tool === 'pencil') {
    try {
      mcpClient = new PencilMcpClient({ cliKey: pencilKey })
      await mcpClient.connect()
    } catch {
      mcpClient = null // MCP unavailable — all MCP steps will be skipped
    }
  }

  // 1b. Pre-codegen layout validation (best-effort via MCP)
  if (mcpClient) {
    try {
      emit('spec', 'running', 'Validating design layout')
      const layout = await mcpClient.snapshotLayout(designPath)
      if (layout.problems.length > 0) {
        const summary = layout.problems
          .map((p) => `  - ${p.type}: ${p.message}${p.nodeName ? ` (${p.nodeName})` : ''}`)
          .join('\n')
        emit('spec', 'running', `Layout issues found:\n${summary}`)

        // In interactive mode, offer to auto-fix
        if (isInteractive(opts)) {
          const clack = await import('@clack/prompts')
          console.log()
          const action = await clack.select({
            message: `Found ${layout.problems.length} layout issue(s). What to do?`,
            options: [
              { value: 'continue', label: 'Continue anyway', hint: 'may cause Maestro failures' },
              { value: 'fix', label: 'Auto-fix layout', hint: 'iterate design to resolve issues' },
            ],
          })

          if (!clack.isCancel(action) && action === 'fix') {
            const fixPrompt = `Fix these layout issues:\n${layout.problems.map((p) => p.message).join('\n')}`
            await adapter.iterate({ prompt: fixPrompt, outputDir, previewPath })
            if (await runner.exists(previewPath)) {
              await openPreview(previewPath)
            }
          }
        } else {
          emit(
            'spec',
            'running',
            'Non-interactive mode: skipping layout fix (continuing with warnings)',
          )
        }
      }
    } catch {
      // Layout validation failed — continue without it
    }
  }

  // 2. Spec — Stitch path or Pencil 3-tier waterfall
  const specPath = join(outputDir, 'spec.json')
  // Hoist platformSpec so spec skip gate and downstream phases (test_gen, codegen) can access it
  let platformSpec: PlatformSpec | undefined // assigned in spec skip gate or spec block before use
  let spec
  let specTokens = 0

  // Spec skip gate — skip if resume + spec.json exists + checkpoint has saved platformSpec
  let specSkipped = false
  // Phase 1 Plan 07 (GATE-02): --design-ir bypasses Pencil-MCP-based spec
  // extraction; the PlatformSpec was already loaded from the IR JSON above.
  if (designIrInjectedSpec) {
    platformSpec = designIrInjectedSpec
    await runner.writeFile(specPath, JSON.stringify(platformSpec, null, 2))
    progress.emit({
      phase: 'spec',
      status: 'completed',
      message: `Using PlatformSpec from --design-ir (${platformSpec.screens.length} screen(s))`,
      timestamp: Date.now(),
    })
    ctxBuilder.recordPhase('spec', 'completed', 'Using PlatformSpec from --design-ir')
    checkpoint.savePhase(checkpointRunId, 'spec', { platformSpec })
    await flushContext()
    specSkipped = true
  } else if (canSkipPhase('spec') && (await runner.exists(specPath))) {
    const saved = checkpoint.getPhase(checkpointRunId, 'spec') as {
      platformSpec: PlatformSpec
    } | null
    if (saved?.platformSpec) {
      platformSpec = saved.platformSpec
      // Emit to progress system but record as 'completed' (not 'skipped') so next resume still skips
      progress.emit({
        phase: 'spec',
        status: 'skipped',
        message: 'Using spec from previous run',
        timestamp: Date.now(),
      })
      ctxBuilder.recordPhase('spec', 'completed', 'Using spec from previous run (checkpoint)')
      await flushContext()
      specSkipped = true
    }
    // If checkpoint data missing, fall through to re-run spec
  }
  if (!specSkipped) {
    emit('spec', 'started', 'Generating spec')

    if (stitchArtifacts && adapter.tool === 'figma-make') {
      // ── Figma Make spec extraction: Tailwind code + LLM vision ──
      emit('spec', 'running', 'Extracting spec from Figma Make design')
      const { readFileSync } = await import('node:fs')
      const codeContent =
        stitchArtifacts.htmlPaths.length > 0
          ? readFileSync(stitchArtifacts.htmlPaths[0], 'utf-8')
          : ''
      const createMessage = await getCreateMessage()
      const canSendImages = config.llm.provider !== 'claude-cli'
      const result = await extractSpecFromFigmaMake({
        codeContent,
        metadata: {},
        screenshotPaths: stitchArtifacts.screenshotPaths,
        prompt: opts.prompt,
        platform: opts.platform,
        createMessage,
        model: config.llm.model,
        skillPrompt: skills.specPrompt,
        outputDir,
        canSendImages,
      })
      spec = result.spec
      specTokens = result.tokensUsed
    } else if (stitchArtifacts) {
      // ── Stitch / zip import spec extraction: DESIGN.md tokens + LLM vision ──
      emit('spec', 'running', 'Extracting spec from design artifacts')
      const { readFileSync } = await import('node:fs')
      const designMdContent = stitchArtifacts.designMdPath
        ? readFileSync(stitchArtifacts.designMdPath, 'utf-8')
        : undefined
      const htmlContents = await Promise.all(
        stitchArtifacts.htmlPaths.map(async (p) => ({
          name: p.split('/').pop() ?? 'screen.html',
          html: readFileSync(p, 'utf-8'),
        })),
      )
      const createMessage = await getCreateMessage()
      const canSendImages = config.llm.provider !== 'claude-cli'
      const result = await extractSpecFromStitch({
        designMdContent,
        htmlContents,
        screenshotPaths: stitchArtifacts.screenshotPaths,
        prompt: opts.prompt,
        platform: opts.platform,
        createMessage,
        model: config.llm.model,
        skillPrompt: skills.specPrompt,
        outputDir,
        canSendImages,
      })
      spec = result.spec
      specTokens = result.tokensUsed
    } else if (adapter.tool === 'pencil') {
      // ── Pencil 3-tier waterfall ──
      try {
        const specContent = await runner.readFile(designPath)
        spec = extractSpec(specContent)
      } catch {
        // .pen file isn't JSON (encrypted) — try MCP to read structured data
        if (mcpClient) {
          try {
            emit('spec', 'running', 'Reading design via Pencil MCP')
            const nodes = await mcpClient.batchGet({ filePath: designPath, readDepth: 10 })
            const vars = await mcpClient.getVariables(designPath)
            spec = extractSpecFromMcp(nodes, vars)
          } catch (mcpErr) {
            const mcpMsg = mcpErr instanceof Error ? mcpErr.message : String(mcpErr)
            emit(
              'spec',
              'running',
              `MCP spec extraction failed: ${mcpMsg.slice(0, 120)} — falling back to LLM`,
            )
            await debug.log(
              'spec-mcp-error.txt',
              `MCP spec extraction failed:\n${mcpMsg}\n\nStack: ${mcpErr instanceof Error ? (mcpErr.stack ?? '') : ''}`,
            )
          }
        } else {
          emit('spec', 'running', 'No MCP client available — using LLM for spec generation')
        }

        if (!spec) {
          // If user provided a .pen file without a real prompt, fail fast —
          // LLM fallback with a placeholder prompt produces junk specs
          if (opts.designFile && !userProvidedPrompt) {
            throw new Error(
              'Cannot extract spec from encrypted .pen file without Pencil MCP.\n' +
                'Either:\n' +
                '  1. Install and open the Pencil desktop app (provides MCP server), or\n' +
                '  2. Supply --prompt with a description of your app so the LLM can generate a spec',
            )
          }
          // Final fallback: generate spec from prompt via LLM
          emit(
            'spec',
            'running',
            `Generating spec via LLM (${config.llm.provider}/${config.llm.model ?? 'default'})`,
          )
          const createMessage = await getCreateMessage()
          // claude-cli provider (claude --print) is text-only — skip design image
          const canSendImages = config.llm.provider !== 'claude-cli'
          const specDesignImage =
            canSendImages && (await runner.exists(previewPath)) ? previewPath : undefined
          try {
            const result = await generateSpecFromPrompt({
              prompt: opts.prompt,
              platform: opts.platform,
              createMessage,
              model: config.llm.model,
              skillPrompt: skills.specPrompt,
              designImagePath: specDesignImage,
              outputDir,
            })
            spec = result.spec
            specTokens = result.tokensUsed
          } catch (llmErr) {
            const llmMsg = llmErr instanceof Error ? llmErr.message : String(llmErr)
            await debug.log(
              'spec-llm-error.txt',
              `LLM spec generation failed:\n${llmMsg}\n\nStack: ${llmErr instanceof Error ? (llmErr.stack ?? '') : ''}`,
            )
            throw llmErr
          }
        }
      }
    } else {
      // Non-Pencil tool without artifacts — fall back to LLM spec generation
      emit(
        'spec',
        'running',
        `Generating spec via LLM (${config.llm.provider}/${config.llm.model ?? 'default'})`,
      )
      const createMessage = await getCreateMessage()
      const canSendImages = config.llm.provider !== 'claude-cli'
      const specDesignImage =
        canSendImages && (await runner.exists(previewPath)) ? previewPath : undefined
      const result = await generateSpecFromPrompt({
        prompt: opts.prompt,
        platform: opts.platform,
        createMessage,
        model: config.llm.model,
        skillPrompt: skills.specPrompt,
        designImagePath: specDesignImage,
        outputDir,
      })
      spec = result.spec
      specTokens = result.tokensUsed
    }

    if (!spec) {
      throw new Error('Failed to extract design spec — JSON parse, MCP, and LLM all failed')
    }
    platformSpec = translateSpec(spec, opts.platform)

    // Export image assets from design via MCP (SwiftUI only, best-effort)
    if (mcpClient && opts.platform === 'swiftui') {
      const imageComps = findImageComponents(platformSpec)
      if (imageComps.length > 0) {
        try {
          emit('spec', 'running', `Exporting ${imageComps.length} image asset(s)`)
          const assetDir = join(outputDir, 'Sources', 'Assets.xcassets')
          const tmpDir = join(outputDir, '.tmp-assets')
          const exportedPaths = await mcpClient.exportNodes({
            nodeIds: imageComps.map((c) => c.id),
            format: 'png',
            scale: 2,
            outputDir: tmpDir,
          })
          const assets = exportedPaths.map((path, i) => ({
            name: imageComps[i].name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
            filePath: path,
          }))
          await writeImageAssets(runner, assetDir, assets)
        } catch {
          // Image export failed — agent will handle images
        }
      }
    }

    // Disconnect shared MCP client
    if (mcpClient) {
      try {
        await mcpClient.disconnect()
      } catch {
        /* ignore */
      }
    }

    await runner.writeFile(specPath, JSON.stringify(platformSpec, null, 2))
    await debug.logJson('spec-raw.json', spec)
    emit(
      'spec',
      'completed',
      `${platformSpec.screens.length} screens, ${opts.platform}`,
      specTokens,
    )
    checkpoint.savePhase(checkpointRunId, 'spec', { platformSpec })
    // Phase 18 Bug B fix: persist the freshly-extracted tokens as the baseline
    // so the NEXT add-feature run can compare against this snapshot.
    if (platformSpec.designTokens) {
      ctxBuilder.setBaselineDesignTokens(platformSpec.designTokens)
    }
    await flushContext()
  } // end if (!specSkipped)

  // ── Phase 12: design_delta + pre-build summary gate ──
  // RELOCATED from pre-Design position so it fires on BOTH fresh runs AND
  // checkpoint-restored runs where specSkipped === true (D-10, T-12-07).
  // platformSpec, existingDesignTokens, ctxBuilder, progress, emit, runMode,
  // opts, appContext, penStrategy, modificationPlan, effectivePrompt are all
  // in scope here (outer function body).
  let designDelta: DesignDeltaReport | null = null
  if (runMode === 'add-feature') {
    if (!canSkipPhase('design_delta')) {
      if (!platformSpec) {
        throw new Error('Internal error: platformSpec not initialized before design_delta phase')
      }

      const nextTokens = platformSpec.designTokens ?? {
        colors: {},
        typography: {},
        spacing: {},
        borderRadius: {},
      }

      const rlNode = await import('node:readline')
      const rl = isInteractive(opts)
        ? rlNode.createInterface({ input: process.stdin, output: process.stdout })
        : undefined

      designDelta = await runDesignDeltaPhase({
        runMode,
        // Phase 18 Bug B fix: LEFT side is the PERSISTED baseline from the prior
        // run (if any), not the current .pen. This lets the delta detect drift
        // when the user edits the .pen between runs. Falls back to current .pen
        // tokens for projects that predate Phase 18's baselineDesignTokens field.
        existingDesignTokens: baselineDesignTokens,
        newDesignTokens: nextTokens,
        ctxBuilder,
        emit,
        interactive: isInteractive(opts),
        readline: rl ? { question: rl.question.bind(rl), close: () => rl.close() } : undefined,
        acceptDrift: opts.acceptDrift,
      })
      // Phase 18 Plan 02 Task 4 fix: flush run-context immediately after the drift
      // gate passes so designDelta is persisted to disk at the moment it is computed.
      // Previously the delta would only be persisted by subsequent phase flushes (after
      // test_gen or codegen completes), meaning a Ctrl+C during codegen would leave
      // run-context.json without the delta field. D-13 persistence must be exercisable
      // without needing a full successful run.
      if (designDelta !== null) {
        await flushContext()
      }
    } else {
      // D-21 + VERIFICATION gap fix: design_delta skipped on resume — rehydrate the
      // local `designDelta` from previousContext so generatePreBuildSummary below
      // receives the original-run token drift data (ROADMAP SC #2, PLAN-14-02 must-have).
      // Mirrors the modificationPlan rehydration pattern at lines 938-941.
      if (previousContext?.designDelta) {
        designDelta = previousContext.designDelta
      }
      emit(
        'design_delta',
        'skipped',
        `Resumed from checkpoint (lastCompleted=${resumeState?.lastCompletedPhase ?? 'unknown'}, designDelta rehydrated=${designDelta !== null})`,
      )
    }

    // Build and display the pre-build summary (relocated from pre-Design)
    const summary = generatePreBuildSummary(
      effectivePrompt,
      appContext,
      penStrategy,
      existingDesignTokens,
      modificationPlan,
      designDelta,
    )

    if (isInteractive(opts)) {
      const { formatPreBuildSummary } = await import('./views/format.js')
      console.log('')
      console.log(formatPreBuildSummary(summary))
      console.log('')
    } else {
      // Non-interactive — emit summary as progress events
      emit(
        'design',
        'running',
        `Pre-build plan: ${summary.newScreens.length} new screen(s), ${summary.modifiedFiles.length} file(s) to modify`,
      )
      if (summary.newScreens.length > 0) {
        emit('design', 'running', `New screens: ${summary.newScreens.join(', ')}`)
      }
      if (summary.modifiedFiles.length > 0) {
        emit('design', 'running', `Files to modify: ${summary.modifiedFiles.join(', ')}`)
      }
      emit(
        'design',
        'running',
        `Design: ${summary.designStrategy === 'new' ? 'create new .pen file' : 'extend existing .pen file'}`,
      )
      if (summary.tokenCount > 0) {
        emit('design', 'running', `Design tokens loaded: ${summary.tokenCount}`)
      }
      emit('design', 'running', 'Auto-proceeding with pre-build plan')
    }

    // Single flush after setDesignDelta (per D-13, checker iteration 1 Warning 1 — no double-flush).
    // The pre-existing flushContext() inside if (!specSkipped) covers the spec phase only.
    await flushContext()
  } // end if (runMode === 'add-feature')

  // D-07: Auto-mock on no-BaaS path — every generated app gets mock services
  if (resolvedBaasProvider === null) {
    resolvedBaasProvider = 'mock'
    emit('baas_recommend', 'running', 'No BaaS provider configured — using mock services')
  }

  // ── Phase: baas_recommend (D-04, D-05, D-06, D-07, D-09) ──
  // resolvedBaasProvider is declared at outer scope (hoisted for WIRE-02 pre-build access)

  if (resolvedBaasProvider !== null && !canSkipPhase('baas_recommend')) {
    emit('baas_recommend', 'started', 'Assessing BaaS appropriateness...')

    // D-07: block provider switch if downstream BaaS phases already completed
    const existingBaas = previousContext?.baasContext
    if (existingBaas?.provider && existingBaas.provider !== resolvedBaasProvider) {
      const hasDownstreamBaas =
        existingBaas.schema !== undefined || existingBaas.authConfig !== undefined
      if (hasDownstreamBaas) {
        const msg = `Cannot switch BaaS provider: project already has ${existingBaas.provider} code generated. Remove generated BaaS files to switch providers.`
        emit('baas_recommend', 'failed', msg)
        throw new Error(
          `BaaS provider switch blocked: ${existingBaas.provider} → ${resolvedBaasProvider}`,
        )
      }
    }

    // Resolve PlatformSpec — may be null on --resume if spec phase was skipped
    const specForHeuristic =
      platformSpec ??
      (previousContext?.phases?.spec?.detail as { platformSpec?: PlatformSpec } | undefined)
        ?.platformSpec ??
      null

    const recommendation = specForHeuristic
      ? assessBaasAppropriateness(specForHeuristic)
      : { tier: 'appropriate' as const, reason: 'No spec available — assuming BaaS appropriate.' }

    ctxBuilder.setBaasContext({ provider: resolvedBaasProvider, recommendation })
    await flushContext()

    checkpoint.savePhase(checkpointRunId, 'baas_recommend', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      tier: recommendation.tier,
      provider: resolvedBaasProvider,
    })

    baasRecommendation = recommendation
    emit('baas_recommend', 'completed', recommendation.reason)
  } else if (resolvedBaasProvider !== null && canSkipPhase('baas_recommend')) {
    // Resume path — rehydrate baasContext from previous context
    if (previousContext?.baasContext) {
      ctxBuilder.setBaasContext(previousContext.baasContext)
      baasRecommendation = previousContext.baasContext.recommendation
    }
    emit('baas_recommend', 'skipped', 'Resumed from checkpoint')
  } else {
    // D-05: no provider configured — skip silently, do NOT inherit old baasContext
    checkpoint.savePhase(checkpointRunId, 'baas_recommend', {
      status: 'skipped',
      reason: 'No BaaS provider configured',
      completedAt: new Date().toISOString(),
    })
    emit('baas_recommend', 'skipped', 'No BaaS provider configured — BaaS phases will be skipped.')
  }

  // ── Phase: baas_schema ──
  let baasSchema: import('@appifex/core').BaasSchema | undefined
  if (resolvedBaasProvider !== null && !canSkipPhase('baas_schema')) {
    emit('baas_schema', 'started', 'Inferring data schema...')

    if (!platformSpec) {
      throw new Error('Internal error: platformSpec not initialized before baas_schema phase')
    }

    const {
      inferBaasSchema,
      renderBaasTemplates,
      lintSecurityRules,
      generateSdkInit,
      generateConfigStubs,
      generateDataServices,
    } = await import('@appifex/baas')

    // D-01: LLM schema inference
    const baasCreateMessage = await getCreateMessage()
    const schema = await inferBaasSchema({
      spec: platformSpec,
      provider: resolvedBaasProvider,
      createMessage: baasCreateMessage,
    })
    baasSchema = schema

    // D-07: Eta template rendering
    const baasFiles = renderBaasTemplates(
      schema,
      resolvedBaasProvider,
      platformToTarget(opts.platform as Platform | undefined),
    )

    // D-10: Security lint gate
    const securityFiles = baasFiles.filter(
      (f: { path: string; content: string }) =>
        f.path.endsWith('.rules') || f.path.endsWith('.sql'),
    )
    for (const f of securityFiles) {
      const lint = lintSecurityRules(f.content)
      if (!lint.passed) {
        emit('baas_schema', 'failed', `Security lint failed: ${lint.violations.join('; ')}`)
        throw new Error(`baas_schema security lint: ${lint.violations.join('; ')}`)
      }
    }

    // SDK-01: Generate SDK init (AppEntry.swift)
    if (resolvedBaasProvider !== 'mock') {
      const sdkInitFile = generateSdkInit(resolvedBaasProvider)
      baasFiles.push(sdkInitFile)
    } else {
      emit('baas_schema', 'running', 'Mock provider: skipping SDK initialization')
    }

    // SDK-03: Generate config stubs
    if (resolvedBaasProvider !== 'mock') {
      const configFiles = generateConfigStubs(resolvedBaasProvider)
      baasFiles.push(...configFiles)
    }

    // WIRE-01: Generate DataService wrappers for each entity
    const dataServiceFiles = generateDataServices(
      schema,
      resolvedBaasProvider,
      platformToTarget(opts.platform as Platform | undefined),
    )
    baasFiles.push(...dataServiceFiles)

    // Write generated files to outputDir
    for (const f of baasFiles) {
      await runner.writeFile(join(outputDir, f.path), f.content)
    }

    // Update BaasContext with concrete schema (D-02)
    const currentCtx = ctxBuilder.build('completed')
    const existingBaas = currentCtx.baasContext!
    ctxBuilder.setBaasContext({
      ...existingBaas,
      schema,
      securityRules: securityFiles
        .map((f: { path: string; content: string }) => f.content)
        .join('\n\n'),
    })
    await flushContext()

    checkpoint.savePhase(checkpointRunId, 'baas_schema', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      entityCount: schema.entities.length,
    })

    emit('baas_schema', 'completed', `${schema.entities.length} entities inferred`)
  } else if (resolvedBaasProvider !== null && canSkipPhase('baas_schema')) {
    // Resume path: rehydrate baasSchema from previousContext
    baasSchema = previousContext?.baasContext?.schema ?? undefined
  }

  // ── Phase: baas_auth ── (D-03: between baas_schema and test_gen)
  if (resolvedBaasProvider !== null && !canSkipPhase('baas_auth')) {
    emit('baas_auth', 'started', 'Generating auth templates...')
    if (resolvedBaasProvider === 'mock') {
      emit('baas_auth', 'running', 'Generating mock auth manager...')
    }

    const { generateAuthTemplates, generateAuthDeepLinkConfig } = await import('@appifex/baas')

    // D-01 Pass 1: Eta templates produce functionally complete auth screens
    const authFiles = generateAuthTemplates(
      resolvedBaasProvider,
      platformToTarget(opts.platform as Platform | undefined),
      baasSchema,
    )

    // D-08: Deep link configuration stubs
    const deepLinkFiles =
      resolvedBaasProvider !== 'mock' ? generateAuthDeepLinkConfig(resolvedBaasProvider) : []

    // Collect all auth-generated files
    const allAuthFiles = [...authFiles, ...deepLinkFiles]

    // Write generated files to outputDir (same pattern as baas_schema)
    for (const f of allAuthFiles) {
      await runner.writeFile(join(outputDir, f.path), f.content)
    }

    // Update BaasContext with authConfig
    const currentCtx = ctxBuilder.build('completed')
    const existingBaas = currentCtx.baasContext!
    ctxBuilder.setBaasContext({
      ...existingBaas,
      authConfig: {
        urlScheme: 'REPLACE_URL_SCHEME',
        ...(resolvedBaasProvider === 'firebase' ? { firebaseProjectId: 'REPLACE_PROJECT_ID' } : {}),
      },
    })
    await flushContext()

    checkpoint.savePhase(checkpointRunId, 'baas_auth', {
      status: 'completed',
      completedAt: new Date().toISOString(),
    })

    emit('baas_auth', 'completed', `${allAuthFiles.length} auth files generated`)
  } else if (resolvedBaasProvider !== null && canSkipPhase('baas_auth')) {
    // Resume path: auth files already generated in a previous run
    emit('baas_auth', 'skipped', 'Auth templates already generated (resume)')
  }

  // ── Phase: firebase_provision ── (Phase 4 FIRE-04: after baas_auth, before mock_service — D-04)
  if (resolvedBaasProvider === 'firebase' && !canSkipPhase('firebase_provision')) {
    emit('firebase_provision', 'started', 'Provisioning Firebase project')

    const { runFirebaseProvision } = await import('@appifex/baas')
    const { default: chalkForProvision } = await import('chalk')

    // Check if GoogleService-Info.plist already exists (idempotency guard — D-05)
    // Phase 4 (FIRE-04 fix): check config.firebase.plistPath first (set by wizard), then outputDir.
    // When wizard's projectDir differs from outputDir, both locations are checked so the guard
    // does not miss an existing plist and trigger a redundant re-download.
    const defaultPlistPath = join(outputDir, 'GoogleService-Info.plist')
    const configPlistPath = config.firebase?.plistPath
    let plistPath = defaultPlistPath
    let plistExists = false
    if (configPlistPath && configPlistPath !== defaultPlistPath) {
      const [existsAtConfig, existsAtDefault] = await Promise.all([
        runner.exists(configPlistPath).catch(() => false),
        runner.exists(defaultPlistPath).catch(() => false),
      ])
      plistExists = existsAtConfig || existsAtDefault
      plistPath = existsAtDefault
        ? defaultPlistPath
        : existsAtConfig
          ? configPlistPath
          : defaultPlistPath
    } else {
      plistExists = await runner.exists(defaultPlistPath).catch(() => false)
    }

    // Phase 4 Plan 07 (UI-SPEC destructive-action contract): confirm before overwriting an existing plist.
    // Default-safe: in non-interactive contexts (CI, piped stdin, opts.interactive=false) or on cancel,
    // do NOT overwrite — preserves D-05 idempotency.
    // Reuses the canonical isInteractive(opts) helper (pipeline.ts:686) that every other prompt site uses
    // — this respects the opts.interactive override used by MCP / non-TTY callers.
    let overwritePlist = false
    if (plistExists && isInteractive(opts)) {
      const clack = await import('@clack/prompts')
      const proceed = await clack.confirm({
        message: `GoogleService-Info.plist already exists at ${plistPath}. Overwrite? [y/N]`,
        initialValue: false,
      })
      // clack.isCancel returns true on Ctrl+C; treat cancel as No (no overwrite)
      overwritePlist = clack.isCancel(proceed) ? false : proceed === true
    }

    // Phase 4 (wr-04): pre-call status messages removed — they produced duplicate events.
    // When plistExists && !overwritePlist, runFirebaseProvision returns { skipped: true } and
    // the result.skipped branch below already emits 'skipped'. Emitting 'running' here first
    // was misleading (phase goes running → skipped with no work done).
    // The post-call result branches are the sole source of terminal phase status messages.

    // Phase 4 (wr-01): guard against undefined baasSchema before calling runFirebaseProvision.
    // On resume, baasSchema is rehydrated from previousContext — if the context is missing or
    // baasContext.schema was never stored, baasSchema remains undefined and iterating over
    // baasSchema.entities would throw a TypeError. Fail fast with a clear ProvisionError instead.
    if (!baasSchema) {
      throw new ProvisionError(
        'firebase_provision: baasSchema is missing — re-run from baas_schema phase or provide a context with a valid baasContext.schema',
      )
    }

    // Phase 4 (FIRE-05): lint runs inside runFirebaseProvision before rules are deployed (D-13).
    // Phase 4 (FIRE-04): plist download (firebase apps:sdkconfig) also runs inside runFirebaseProvision
    //   when plistExists is false. If the download exits non-zero, runFirebaseProvision throws
    //   ProvisionError — do NOT catch it here; let it propagate as CliError to the pipeline runner.
    const result = await runFirebaseProvision({
      outputDir,
      runner,
      config,
      baasSchema,
      plistExists,
      overwritePlist,
    })

    if (result.skipped) {
      checkpoint.savePhase(checkpointRunId, 'firebase_provision', {
        status: 'skipped',
        reason: 'GoogleService-Info.plist already present',
      })
      emit('firebase_provision', 'skipped', 'skipped (checkpoint complete)')
    } else {
      // Emit gitignore tip per UI-SPEC.md copywriting contract
      emit(
        'firebase_provision',
        'running',
        chalkForProvision.dim(
          'Tip: add GoogleService-Info.plist to your project .gitignore to avoid committing secrets.',
        ),
      )

      if (result.collectionsSeeded !== undefined && result.collectionsSeeded > 0) {
        emit(
          'firebase_provision',
          'running',
          `Seeded ${result.collectionsSeeded} empty collection(s)`,
        )
      }

      checkpoint.savePhase(checkpointRunId, 'firebase_provision', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        projectId: result.projectId,
        iosAppId: result.iosAppId,
        plistPath: result.plistPath,
        collectionsSeeded: result.collectionsSeeded,
      })

      // Phase 4 (FIRE-04 fix): sync config.firebase.plistPath to the actual download location
      // so future idempotency checks resolve correctly without a wizard re-run.
      if (config.firebase && result.plistPath && config.firebase.plistPath !== result.plistPath) {
        config.firebase.plistPath = result.plistPath
        await saveConfig(configDir, config)
      }

      emit('firebase_provision', 'completed', 'Firebase provision complete')
    }
  } else if (resolvedBaasProvider === 'firebase' && canSkipPhase('firebase_provision')) {
    emit('firebase_provision', 'skipped', 'skipped (checkpoint complete)')
  }

  // Design note (FLOW-02): Test template generation (Phase 37 templates) is
  // intentionally bundled in mock_service rather than test_gen. Mock test
  // templates are tightly coupled to mock file generation — if mock_service is
  // skipped on resume, test templates are also skipped (correct: they were
  // already generated alongside mock files).
  // ── Phase: mock_service ── (D-06: after baas_auth, before test_gen)
  if (resolvedBaasProvider === 'mock' && !canSkipPhase('mock_service')) {
    emit('mock_service', 'started', 'Generating mock service layer...')
    if (!baasSchema) {
      emit('mock_service', 'failed', 'baasSchema unavailable — cannot generate mock service layer')
      throw new Error('mock_service requires baasSchema (baas_schema phase did not produce one)')
    }
    const {
      renderBaasTemplates: renderMock,
      generateAuthTemplates: genAuthMock,
      generateDataServices: genDataMock,
    } = await import('@appifex/baas')

    const targetPlatforms = platformToTarget(opts.platform as Platform | undefined)

    const mockFiles = [
      ...renderMock(baasSchema, 'mock', targetPlatforms),
      ...genAuthMock('mock', targetPlatforms, baasSchema),
      ...genDataMock(baasSchema, 'mock', targetPlatforms),
    ]

    for (const f of mockFiles) {
      await runner.writeFile(join(outputDir, f.path), f.content)
    }

    checkpoint.savePhase(checkpointRunId, 'mock_service', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      fileCount: mockFiles.length,
      platforms: targetPlatforms,
    })

    emit('mock_service', 'completed', `${opts.platform ?? 'all'} (${mockFiles.length} files)`)
  } else if (resolvedBaasProvider === 'mock' && canSkipPhase('mock_service')) {
    emit('mock_service', 'skipped', 'Mock service files already generated (resume)')
  }

  // 3. Test Gen
  const flowDir = join(outputDir, '.maestro')
  const testDir = join(outputDir, '__tests__')
  const bundleId = `com.dtc.${appName}`

  // Hoist uiTests/unitTests so test_gen skip gate and downstream codegen can access them
  let uiTests: import('@appifex/core').MaestroFlow[] = []
  let unitTests: import('@appifex/core').TestFile[] = []
  // Hoist designScreenshots so Phase 11 test_regen (in the agent block) can
  // reuse the same map the original test_gen build produced.
  const designScreenshots: Record<string, string> = {}

  // Test_gen skip gate — skip if resume + dirs exist + checkpoint has saved file names
  let testGenSkipped = false
  if (
    canSkipPhase('test_gen') &&
    (await runner.exists(flowDir)) &&
    (await runner.exists(testDir))
  ) {
    const saved = checkpoint.getPhase(checkpointRunId, 'test_gen') as {
      uiTestFileNames: string[]
      unitTestFileNames: string[]
      uiTestCount: number
      unitTestCount: number
    } | null
    if (saved) {
      uiTests = saved.uiTestFileNames.map((fn) => ({
        name: fn,
        screenId: '',
        fileName: fn,
        content: '',
      }))
      unitTests = saved.unitTestFileNames.map((fn) => ({
        fileName: fn,
        content: '',
        platform: opts.platform,
        testCount: 0,
      }))
      // Emit to progress system but record as 'completed' so next resume still skips
      progress.emit({
        phase: 'test_gen',
        status: 'skipped',
        message: 'Using tests from previous run',
        timestamp: Date.now(),
      })
      ctxBuilder.recordPhase('test_gen', 'completed', 'Using tests from previous run (checkpoint)')
      await flushContext()
      testGenSkipped = true
    }
    // If checkpoint data missing, fall through to re-run test_gen
  }
  if (!testGenSkipped) {
    if (!platformSpec) {
      throw new Error('Internal error: platformSpec not initialized before test_gen phase')
    }
    emit('test_gen', 'started', 'Generating tests')

    // Build design screenshot map for visual comparison in Maestro tests
    // For Stitch/Figma Make: map each screen to its per-screen screenshot
    // For Pencil: use preview.png for the first screen (single export)
    // designScreenshots is hoisted at the top of the outer scope so the
    // Phase 11 test_regen block (in the agent path) can read the same map.
    if (stitchArtifacts && stitchArtifacts.screenshotPaths.length > 0) {
      // Copy screenshots into .maestro/designs/ so Maestro can reference them
      const designDir = join(flowDir, 'designs')
      const { mkdirSync, copyFileSync: cpSync } = await import('node:fs')
      mkdirSync(designDir, { recursive: true })
      for (
        let i = 0;
        i < platformSpec.screens.length && i < stitchArtifacts.screenshotPaths.length;
        i++
      ) {
        const screenId = platformSpec.screens[i].id
        const srcPath = stitchArtifacts.screenshotPaths[i]
        const destName = `${screenId}.png`
        cpSync(srcPath, join(designDir, destName))
        designScreenshots[screenId] = `designs/${destName}`
      }
    } else if (await runner.exists(previewPath)) {
      // Pencil: single preview image → use for first screen
      const { mkdirSync, copyFileSync: cpSync } = await import('node:fs')
      const designDir = join(flowDir, 'designs')
      mkdirSync(designDir, { recursive: true })
      if (platformSpec.screens.length > 0) {
        cpSync(previewPath, join(designDir, 'preview.png'))
        designScreenshots[platformSpec.screens[0].id] = 'designs/preview.png'
      }
    }

    uiTests = generateUITests(platformSpec, { bundleId, designScreenshots })
    for (const flow of uiTests) {
      await runner.writeFile(join(flowDir, flow.fileName), flow.content)
    }
    const specTests = generateSpecUnitTests(platformSpec)
    // Only generate placeholder requirement tests if user provided explicit requirements
    const reqTests = opts.requirements ? generateUnitTests(opts.requirements, opts.platform) : []
    unitTests = [...specTests, ...reqTests]
    for (const test of unitTests) {
      await runner.writeFile(join(testDir, test.fileName), test.content)
    }
    const totalUnitTests = unitTests.reduce((sum, t) => sum + t.testCount, 0)
    emit(
      'test_gen',
      'completed',
      `${uiTests.length} UI flows, ${totalUnitTests} unit tests (locked)`,
    )
    checkpoint.savePhase(checkpointRunId, 'test_gen', {
      uiTestFileNames: uiTests.map((f) => f.fileName),
      unitTestFileNames: unitTests.map((t) => t.fileName),
      uiTestCount: uiTests.length,
      unitTestCount: unitTests.reduce((sum, t) => sum + t.testCount, 0),
    })
    await flushContext()
  } // end if (!testGenSkipped)

  // ── Agent-based path: single session for codegen + build + fix + validate ──
  const agentType = opts.agentType ?? config.agent?.type ?? 'auto'
  let agentHandled = false

  if (agentType !== 'api') {
    const { createAgent, detectAgent, createProgressParser, buildAgentPrompt } =
      await import('@appifex/agent')
    type AgentAdapterType = import('@appifex/agent').AgentAdapter

    let agent: AgentAdapterType | null = null
    if (agentType === 'auto') {
      agent = await detectAgent()
      if (!agent) {
        emit('codegen', 'running', 'No agent CLI found, falling back to API pipeline')
      }
    } else {
      agent = createAgent(agentType as import('@appifex/agent').AgentType)
    }

    if (agent) {
      emit('codegen', 'started', `Agent: ${agent.name}`)

      // Copy skills to output dir so agent can read them relative to cwd
      const { cpSync, existsSync, unlinkSync, readdirSync } = await import('node:fs')
      const skillsSrcDir = config.skillsDir ?? getBundledSkillsDir()
      const localSkillsDir = join(outputDir, 'skills')
      if (!existsSync(localSkillsDir)) {
        cpSync(skillsSrcDir, localSkillsDir, { recursive: true })
      }

      // Remove pre-generated stub unit tests — agent will write meaningful ones
      // Keep Maestro flows (.maestro/) intact — those use real testIds from the spec
      if (existsSync(testDir)) {
        for (const file of readdirSync(testDir)) {
          if (file.endsWith('.swift') || file.endsWith('.ts') || file.endsWith('.tsx')) {
            unlinkSync(join(testDir, file))
          }
        }
      }

      const prompt = buildAgentPrompt({
        prompt: effectivePrompt,
        platform: opts.platform,
        designImagePath: (await runner.exists(previewPath)) ? previewPath : undefined,
        penFilePath: (await runner.exists(designPath)) ? designPath : undefined,
        specPath: join(outputDir, 'spec.json'),
        flowDir,
        testDir,
        skillsDir: localSkillsDir,
        projectDir: outputDir,
        agentSupportsImages: agent.supportsImages(),
        appName,
        previousContext,
        runMode,
        backendContext: opts.backendContext,
        appContext,
        existingDesignTokens,
        modificationPlan, // NEW: Plan 03 will add the handler in prompt-builder.ts
      })

      // Always save agent prompt and output for debugging (regardless of --verbose)
      const { writeFileSync: writeSync, mkdirSync: mkdirS } = await import('node:fs')
      const debugDir = join(outputDir, '.dtc-debug')
      mkdirS(debugDir, { recursive: true })
      writeSync(join(debugDir, 'agent-prompt.md'), prompt)
      await debug.log('agent-prompt.md', prompt)

      // Progress parsing
      const parser = createProgressParser(agent.name)
      const onOutput = (chunk: string) => {
        for (const event of parser.parse(chunk)) {
          progress.emit(event)
        }
      }

      const hasDesignImage = await runner.exists(previewPath)
      const agentBudget = config.agent?.maxBudgetUsd ?? 10
      const agentTimeout = config.agent?.timeoutMs // no default timeout — budget is the limit

      // Auto-load session ID from previous context when --mode resume without explicit --resume
      const resumeSessionId =
        opts.resumeSessionId ??
        (runMode === 'resume' ? previousContext?.agentSessionId : undefined) ??
        undefined

      // D-06: Snapshot source files before agent runs (add-feature only)
      let preAgentSnapshot: Map<string, string> | undefined
      if (runMode === 'add-feature') {
        if (resumeState !== null) {
          // Phase 14 (D-22): rehydrate snapshot from sidecar instead of re-snapshotting.
          // The sidecar is authoritative — a fresh snapshot would include any partial
          // codegen output from the interrupted run.
          preAgentSnapshot = new Map(Object.entries(resumeState.sidecar.files))
          // Phase 14 (D-24, D-27): revert to baseline BEFORE the agent runs, but ONLY
          // when codegen is actually going to re-run. Drift check already ran in the
          // resume bootstrap (D-25), so we know no user changes will be silently masked.
          if (!canSkipPhase('codegen')) {
            const { revertToSidecarBaseline } = await import('./snapshot-revert.js')
            const revertedCount = await revertToSidecarBaseline(runner, preAgentSnapshot)
            emit(
              'codegen',
              'running',
              `Reverted ${revertedCount} file(s) to preAgent baseline for resumed codegen`,
            )
          }
          // Skip the sidecar WRITE — sidecar already exists on disk from original run.
        } else {
          // Phase 13 non-resume path: snapshot + write sidecar. UNCHANGED from the
          // existing block — this MUST be preserved verbatim for the non-resume add-feature run.
          preAgentSnapshot = await snapshotSourceFiles(runner, opts.platform)
          // Phase 13 (QUALITY-03a): serialize snapshot to .dtc/snapshots/ sidecar and
          // upsert the analysis checkpoint row with {snapshotPath, snapshotSha256, fileCount}.
          // The centralized hook already wrote a bare `{completed}` analysis row at the
          // analysis terminal boundary; this second write relies on Checkpoint upsert
          // semantics to replace it with the richer payload.
          try {
            const sidecarMeta = await writePreAgentSnapshotSidecar(
              dtcDir,
              checkpointRunId,
              preAgentSnapshot,
            )
            checkpoint.savePhase(checkpointRunId, 'analysis', {
              status: 'completed',
              completedAt: new Date().toISOString(),
              snapshotPath: sidecarMeta.path,
              snapshotSha256: sidecarMeta.sha256,
              fileCount: sidecarMeta.fileCount,
            })
          } catch (err) {
            console.error(`[checkpoint] sidecar write or analysis upsert failed: ${String(err)}`)
            // Log-and-continue — the centralized hook's bare {completed} row remains.
          }
        }
      }

      // Run the agent with budget continuation loop
      let result = await agent.run({
        prompt,
        cwd: outputDir,
        model: config.agent?.model ?? config.llm.model,
        maxBudgetUsd: agentBudget,
        timeoutMs: agentTimeout,
        onOutput,
        designImagePath: hasDesignImage ? 'preview.png' : undefined,
        resumeSessionId,
      })

      // Budget exceeded — ask user if they want to continue
      while (result.stopReason === 'budget_exceeded' && isInteractive(opts)) {
        const costStr = result.costUsd ? `$${result.costUsd.toFixed(2)}` : `$${agentBudget}`
        emit(
          'codegen',
          'running',
          `Budget exceeded (${costStr} spent). Agent has session ${result.sessionId?.slice(0, 8) ?? '?'}...`,
        )

        const clack = await import('@clack/prompts')
        console.log() // blank line after spinner
        const action = await clack.select({
          message: `Agent ran out of budget (${costStr} spent). What would you like to do?`,
          options: [
            {
              value: 'continue',
              label: `Add $${agentBudget} more and continue`,
              hint: 'resumes the same session',
            },
            {
              value: 'continue-large',
              label: `Add $${agentBudget * 3} more and continue`,
              hint: 'larger budget for complex apps',
            },
            { value: 'stop', label: 'Stop here', hint: 'keep what was generated so far' },
          ],
        })

        if (clack.isCancel(action) || action === 'stop') {
          break
        }

        const additionalBudget = action === 'continue-large' ? agentBudget * 3 : agentBudget
        emit(
          'codegen',
          'running',
          `Resuming agent session with $${additionalBudget} more budget...`,
        )

        result = await agent.run({
          prompt: '', // ignored for resume
          cwd: outputDir,
          model: config.agent?.model ?? config.llm.model,
          maxBudgetUsd: additionalBudget,
          timeoutMs: agentTimeout,
          onOutput,
          resumeSessionId: result.sessionId,
        })
      }

      if (result.stopReason === 'budget_exceeded' && !isInteractive(opts)) {
        emit(
          'codegen',
          'running',
          'Non-interactive mode: budget exceeded, keeping generated output',
        )
      }

      // Save session ID for potential manual resume later
      if (result.sessionId) {
        writeSync(join(debugDir, 'agent-session-id.txt'), result.sessionId)
      }
      writeSync(join(debugDir, 'agent-output.txt'), result.output)
      if (result.error) writeSync(join(debugDir, 'agent-error.txt'), result.error)
      if (result.costUsd)
        writeSync(join(debugDir, 'agent-cost.txt'), `$${result.costUsd.toFixed(4)}`)
      await debug.log('agent-output.txt', result.output)

      // D-07: Revert unexpected changes to files not in modification plan
      if (preAgentSnapshot && runMode === 'add-feature') {
        const revertedFiles = await revertUnexpectedChanges(
          runner,
          preAgentSnapshot,
          modificationPlan,
        )
        if (revertedFiles.length > 0) {
          emit(
            'codegen',
            'running',
            `Reverted unexpected changes to ${revertedFiles.length} file(s): ${revertedFiles.join(', ')}`,
          )
        }
      }

      // Phase 11 (QUALITY-01a + QUALITY-01b): targeted test regeneration.
      // Runs strictly AFTER revertUnexpectedChanges so reverted edits don't
      // pollute the diff (Pitfall 1). runTestRegenPhase is a no-op on fresh-app
      // runs or when preAgentSnapshot is undefined (Pitfall 6 double-gate).
      if (platformSpec) {
        await runTestRegenPhase({
          runner,
          outputDir,
          platform: opts.platform,
          runMode,
          preAgentSnapshot,
          platformSpec,
          ctxBuilder,
          emit,
          flushContext,
          flowDir,
          testDir,
          bundleId,
          designScreenshots,
        })
      }

      if (result.success) {
        emit('codegen', 'completed', 'Agent completed codegen')
        emit('build', 'completed', 'Agent handled build')
        emit('validate', 'completed', 'Agent completed — all tests passing')
        emit('fix', 'skipped', 'Agent handled fixes inline')

        // Run security scan on agent-generated code
        emit(
          'security',
          'started',
          `Scanning with ${opts.platform === 'swiftui' ? 'p/swift' : opts.platform === 'kotlin-compose' ? 'p/kotlin' : 'p/react'} rules`,
        )
        const { runSemgrep } = await import('@appifex/validate')
        const secResult = await runSemgrep(runner, {
          projectDir: outputDir,
          platform: opts.platform,
        })
        if (secResult.error) {
          emit('security', 'failed', secResult.error)
        } else if (secResult.findings.length === 0) {
          emit('security', 'completed', 'No findings — clean')
        } else {
          emit('security', 'failed', `${secResult.findings.length} finding(s)`)

          // Run fix loop for security findings
          emit('fix', 'started', 'Fixing security findings')
          const secValidation: ValidationResult = {
            ui: { total: 0, passed: 0, failed: 0, results: [] },
            unit: { total: 0, passed: 0, failed: 0, failures: [] },
            security: secResult,
            allPassed: false,
          }
          const secBuildFn = async () =>
            opts.platform === 'kotlin-compose'
              ? buildKotlin(runner, { projectDir: outputDir })
              : buildSwift(runner, { projectDir: outputDir, scheme: appName })
          const secValidateFn = async (): Promise<ValidationResult> => {
            const sec = await runSemgrep(runner, { projectDir: outputDir, platform: opts.platform })
            return {
              ui: { total: 0, passed: 0, failed: 0, results: [] },
              unit: { total: 0, passed: 0, failed: 0, failures: [] },
              security: sec,
              allPassed: sec.failed === 0,
            }
          }
          const createMessage = await getCreateMessage()
          const secFixFn =
            config.llm.provider === 'claude-cli'
              ? createClaudeCliFixFn({ runner, projectDir: outputDir, model: config.llm.model })
              : createDefaultFixFn({
                  apiKey: config.llm.apiKey ?? '',
                  runner,
                  projectDir: outputDir,
                  model: config.llm.model,
                  createMessage,
                  skillPrompt: skills.fixPrompt,
                  verbose: opts.verbose,
                })
          const fr = await fixLoop(secValidation, {
            fixFn: secFixFn,
            buildFn: secBuildFn,
            validateFn: secValidateFn,
            maxAttempts: 3,
            tokenBudget: budget.totalRemaining,
            budgetInstance: budget,
          })
          emit(
            'fix',
            fr.status === 'all_green' ? 'completed' : 'failed',
            `${fr.status} — ${fr.attempts.length} attempts`,
            fr.totalTokensUsed,
          )
          emit(
            'security',
            fr.status === 'all_green' ? 'completed' : 'failed',
            fr.status === 'all_green' ? 'Fixed — clean' : 'Finding(s) remaining after fix loop',
          )
        }
      } else if (result.stopReason === 'budget_exceeded') {
        const sessionHint = result.sessionId
          ? ` Resume with: dtc run --resume ${result.sessionId}`
          : ''
        emit(
          'codegen',
          'failed',
          `Budget exceeded (${result.costUsd ? '$' + result.costUsd.toFixed(2) : ''}).${sessionHint}`,
        )
      } else {
        emit('codegen', 'failed', result.error ?? 'Agent session failed')
      }

      agentHandled = true

      // Collect files the agent generated
      const generatedFiles: string[] = []
      try {
        for (const pattern of [
          'Sources/**/*.swift',
          'src/**/*.{ts,tsx}',
          '__tests__/**/*.swift',
          '__tests__/**/*.{ts,tsx}',
        ]) {
          const files = await runner.glob(`${outputDir}/${pattern}`)
          for (const f of files) {
            generatedFiles.push(f.replace(outputDir + '/', ''))
          }
        }
      } catch {
        /* glob failure shouldn't prevent report generation */
      }

      // Build final validation for the report
      const reportDir = join(outputDir, '.dtc-report')
      const agentUnitTestCount = unitTests.reduce((sum, t) => sum + t.testCount, 0)
      const finalValidation = result.success
        ? ({
            ui: { total: uiTests.length, passed: uiTests.length, failed: 0, results: [] },
            unit: {
              total: agentUnitTestCount,
              passed: agentUnitTestCount,
              failed: 0,
              failures: [],
            },
            allPassed: true,
          } as ValidationResult)
        : ({
            ui: { total: 0, passed: 0, failed: 0, results: [] },
            unit: { total: 0, passed: 0, failed: 0, failures: [] },
            allPassed: false,
          } as ValidationResult)

      // Generate report and return
      emit('report', 'started', 'Generating report')
      const agentReport = {
        agentName: agent.name,
        model: config.agent?.model ?? config.llm.model,
        sessionId: result.sessionId,
        stopReason: result.stopReason,
        costUsd: result.costUsd,
        filesGenerated: generatedFiles,
        output: result.output?.slice(0, 2000),
      }
      const report = buildReport({
        projectName: opts.prompt.slice(0, 50),
        platforms: [opts.platform],
        designIterations,
        validation: { [opts.platform]: finalValidation },
        fix: {},
        tokenUsage,
        totalDuration: Date.now() - startTime,
        agent: agentReport,
      })
      const markdown = formatMarkdown(report)
      await runner.writeFile(join(outputDir, 'report.md'), markdown)
      emit('report', 'completed', 'Report saved')
      await flushContext()

      // Save run context for future resume/add-feature/refactor (always, even on failure)
      if (result.sessionId) ctxBuilder.setAgentSessionId(result.sessionId)
      ctxBuilder.setFilesGenerated(generatedFiles)
      const runStatus = result.success
        ? ('completed' as const)
        : result.stopReason === 'budget_exceeded'
          ? ('budget_exceeded' as const)
          : ('failed' as const)
      try {
        await saveRunContext(outputDir, ctxBuilder.build(runStatus))
      } catch {
        /* context save must not block return */
      }

      try {
        checkpoint.close()
      } catch {
        /* ignore */
      }
      process.removeListener('SIGINT', sigintHandler)
      process.removeListener('exit', exitCleanup)
      return { report, validation: finalValidation, markdown }
    }
  }

  // --- API path: codegen through provision ---
  // D-05: Wrap the entire API phase execution block so any unhandled exception
  // saves partial RunContext with status='failed' before re-throwing.
  // D-06: err.message only — ctxBuilder.build('failed') captures recorded phases,
  // no stack traces written to the context file.
  try {
    // 4. Codegen — clean old source files to prevent collisions with previous runs
    const { rm } = await import('node:fs/promises')
    for (const dir of ['Sources', 'src']) {
      if (await runner.exists(`${outputDir}/${dir}`)) {
        await rm(`${outputDir}/${dir}`, { recursive: true, force: true })
      }
    }
    // Also clean stale build artifacts and xcodeproj
    for (const dir of ['build', 'App.xcodeproj']) {
      if (await runner.exists(`${outputDir}/${dir}`)) {
        await rm(`${outputDir}/${dir}`, { recursive: true, force: true })
      }
    }

    if (!platformSpec) {
      throw new Error('Internal error: platformSpec not initialized before codegen phase')
    }
    emit('codegen', 'started', 'Generating code (layered: models → views → viewmodels)')
    const designImageExists = await runner.exists(previewPath)
    const codegenInput = {
      spec: platformSpec,
      uiTestPaths: uiTests.map((f) => join(flowDir, f.fileName)),
      unitTestPaths: unitTests.map((t) => join(testDir, t.fileName)),
      outputDir: outputDir,
      designImagePath: designImageExists ? previewPath : undefined,
      skillPrompt: skills.codegenPrompt,
      uiTestContent: uiTests.map((f) => ({ path: f.fileName, content: f.content })),
      unitTestContent: unitTests.map((t) => ({ path: t.fileName, content: t.content })),
      // D-05: Forward modification plan to layered codegen (omit when empty to keep prompt clean)
      ...(runMode === 'add-feature' && modificationPlan.items.length > 0
        ? { modificationPlan }
        : {}),
      // D-14: Inject BaaS context so LLM generates ViewModels importing from repository protocols
      baasContext: ctxBuilder.build('completed').baasContext,
      // D-01 Pass 2: Tell LLM to style-match auth screens without touching auth wiring
      baasAuthScreens: !!ctxBuilder.build('completed').baasContext?.authConfig,
    }

    let codegenResult
    if (config.llm.provider === 'claude-cli') {
      // Claude CLI doesn't support layered — fall back to monolithic
      if (!opts.generateFn) {
        opts.generateFn = createClaudeCliGenerateFn({ model: config.llm.model })
      }
      const codegen = new ClaudeAdapter({ generateFn: opts.generateFn })
      codegenResult = await codegen.generateAndWrite(codegenInput, runner)
    } else {
      // Layered codegen: presentation ∥ domain → integration
      const createMessage = await getCreateMessage()
      const layeredFn = createLayeredGenerateFn({
        apiKey: config.llm.apiKey ?? '',
        model: config.llm.model,
        createMessage,
      })

      // Log the spec that's feeding codegen
      await debug.logJson('spec-for-codegen.json', platformSpec)

      const layeredResult = await layeredFn(codegenInput)

      if (layeredResult.success) {
        emit(
          'codegen',
          'running',
          `${layeredResult.presentationFiles.length} views, ${layeredResult.domainFiles.length} models, ${layeredResult.integrationFiles.length} viewmodels`,
        )
      }

      // Write all files to disk (skip protected files)
      const protectedFiles = new Set(['project.yml', 'App.xcodeproj', 'Info.plist'])
      // D-04: Protect BaaS-generated AppEntry from codegen overwrite on FRESH runs only.
      // D-05: For add-feature runs, AppEntry is in the modification plan — the LLM merges
      // AuthManager into the existing entry point, and its output MUST be written to disk.
      if (ctxBuilder.build('completed').baasContext?.schema && runMode !== 'add-feature') {
        protectedFiles.add('AppEntry.swift')
      }
      if (layeredResult.success) {
        for (const file of layeredResult.files) {
          const basename = file.path.split('/').pop() ?? file.path
          if (protectedFiles.has(basename)) continue
          await runner.writeFile(join(outputDir, file.path), file.content)
        }
      }

      codegenResult = layeredResult
    }

    emit(
      'codegen',
      codegenResult.success ? 'completed' : 'failed',
      codegenResult.success
        ? `${codegenResult.files.length} files`
        : (codegenResult.error ?? 'Failed'),
      codegenResult.tokensUsed,
    )
    await flushContext()
    await debug.logJson('codegen-result.json', {
      success: codegenResult.success,
      files: codegenResult.files.map((f) => f.path),
      tokensUsed: codegenResult.tokensUsed,
      error: codegenResult.error,
      ...(isLayeredCodegenResult(codegenResult)
        ? {
            presentationFiles: codegenResult.presentationFiles.map((f) => f.path),
            domainFiles: codegenResult.domainFiles.map((f) => f.path),
            integrationFiles: codegenResult.integrationFiles.map((f) => f.path),
          }
        : {}),
    })

    // WIRE-02: Patch build dependencies with BaaS SDK packages
    if (resolvedBaasProvider !== null && resolvedBaasProvider !== 'mock') {
      emit('build', 'running', 'Patching build dependencies...')
      if (opts.platform === 'swiftui') {
        await patchProjectDependencies(runner, outputDir, resolvedBaasProvider)
        emit(
          'build',
          'running',
          `${resolvedBaasProvider === 'firebase' ? 'Firebase' : 'Supabase'} dependencies added to project.yml`,
        )
      } else if (opts.platform === 'kotlin-compose') {
        await patchBuildGradle(runner, outputDir, resolvedBaasProvider)
        emit(
          'build',
          'running',
          `${resolvedBaasProvider === 'firebase' ? 'Firebase' : 'Supabase'} dependencies added to build.gradle.kts`,
        )
      }
    }

    // 4b. Pre-build validation + auto-fix (SwiftUI only)
    if (opts.platform === 'swiftui') {
      const precheck = await swiftPrecheck(runner, outputDir)
      await debug.logJson('precheck-result.json', precheck)
      if (!precheck.passed) {
        const fixedCount = await swiftAutofix(runner, outputDir, precheck.issues)
        if (fixedCount > 0) {
          emit(
            'build',
            'running',
            `Auto-fixed ${fixedCount} file${fixedCount !== 1 ? 's' : ''} (deprecated APIs)`,
          )
        }
      }
    }

    // 5. Build + Fix loop (handles both build errors and test failures)
    const reportDir = join(outputDir, '.dtc-report')
    const buildFn = async () =>
      opts.platform === 'kotlin-compose'
        ? buildKotlin(runner, { projectDir: outputDir })
        : buildSwift(runner, { projectDir: outputDir, scheme: appName })
    const validateFn = async () =>
      validateAll(runner, {
        platform: opts.platform,
        projectDir: outputDir,
        flowDir,
        testDir,
        reportDir,
        ...(resolvedBaasProvider === 'mock' && {
          mockContext: { schema: baasSchema, provider: 'mock' as const },
        }),
      })

    emit('build', 'started', `Building ${opts.platform}`)
    let buildResult = await buildFn()
    emit(
      'build',
      buildResult.success ? 'completed' : 'failed',
      buildResult.success
        ? `${opts.platform} ✓`
        : (buildResult.error?.split('\n').pop() ?? 'Build failed'),
    )
    await flushContext()
    await debug.logJson('build-result.json', buildResult)

    // If build failed, try to fix build errors before validating
    let fixResult = undefined
    if (!buildResult.success) {
      emit('fix', 'started', 'Fixing build errors')
      const createMessage = await getCreateMessage()

      // Create a synthetic validation result from build errors
      // Include file paths so the fix function reads only failing files
      const buildErrors = buildResult.errors ?? []
      const buildFailValidation: ValidationResult = {
        ui: { total: 0, passed: 0, failed: 0, results: [] },
        unit: {
          total: Math.max(buildErrors.length, 1),
          passed: 0,
          failed: Math.max(buildErrors.length, 1),
          failures:
            buildErrors.length > 0
              ? buildErrors.map((e) => ({
                  testName: 'build',
                  suiteName: 'xcodebuild',
                  error: `${e.file}:${e.line}: ${e.message}`,
                  file: e.file,
                  line: e.line,
                }))
              : [
                  {
                    testName: 'build',
                    suiteName: 'xcodebuild',
                    error: buildResult.error ?? 'Build failed',
                  },
                ],
        },
        allPassed: false,
      }

      if (!opts.fixFn) {
        if (config.llm.provider === 'claude-cli') {
          opts.fixFn = createClaudeCliFixFn({
            runner,
            projectDir: outputDir,
            model: config.llm.model,
          })
        } else {
          opts.fixFn = createDefaultFixFn({
            apiKey: config.llm.apiKey ?? '',
            runner,
            projectDir: outputDir,
            model: config.llm.model,
            createMessage,
            skillPrompt: skills.fixPrompt,
            verbose: opts.verbose,
          })
        }
      }

      const fr = await fixLoop(buildFailValidation, {
        fixFn: opts.fixFn,
        buildFn,
        validateFn,
        maxAttempts: opts.benchmark ? 999 : 5,
        tokenBudget: opts.benchmark ? Infinity : budget.totalRemaining,
        budgetInstance: opts.benchmark ? undefined : budget,
        disableCircuitBreakers: opts.benchmark,
      })
      fixResult = fr
      emit(
        'fix',
        fr.status === 'all_green' ? 'completed' : 'failed',
        `${fr.status} — ${fr.attempts.length} attempts`,
        fr.totalTokensUsed,
      )
      await flushContext()
      await debug.logJson('fix-result-build.json', fr)

      // Re-check build status after fix
      buildResult = await buildFn()
    }

    // 6. Validate (only if build succeeded)
    let validation: ValidationResult
    if (buildResult.success) {
      emit('validate', 'started', 'Running all tests')
      validation = await validateFn()
      const valMsg = `UI ${validation.ui.passed}/${validation.ui.total}  Unit ${validation.unit.passed}/${validation.unit.total}`
      const testsOk = validation.ui.failed === 0 && validation.unit.failed === 0
      emit('validate', testsOk ? 'completed' : 'failed', valMsg)
      await flushContext()
      await debug.logJson('validate-result.json', validation)

      // 7. Fix test failures (if build passed but tests failed)
      if (!validation.allPassed && !fixResult) {
        emit('fix', 'started', 'Fixing test failures')
        const createMessage = await getCreateMessage()
        if (!opts.fixFn) {
          if (config.llm.provider === 'claude-cli') {
            opts.fixFn = createClaudeCliFixFn({
              runner,
              projectDir: outputDir,
              model: config.llm.model,
            })
          } else {
            opts.fixFn = createDefaultFixFn({
              apiKey: config.llm.apiKey ?? '',
              runner,
              projectDir: outputDir,
              model: config.llm.model,
              createMessage,
              skillPrompt: skills.fixPrompt,
              verbose: opts.verbose,
            })
          }
        }
        const fr = await fixLoop(validation, {
          fixFn: opts.fixFn,
          buildFn,
          validateFn,
          maxAttempts: opts.benchmark ? 999 : 5,
          tokenBudget: opts.benchmark ? Infinity : budget.totalRemaining,
          budgetInstance: opts.benchmark ? undefined : budget,
          disableCircuitBreakers: opts.benchmark,
        })
        fixResult = fr
        emit(
          'fix',
          fr.status === 'all_green' ? 'completed' : 'failed',
          `${fr.status} — ${fr.attempts.length} attempts`,
          fr.totalTokensUsed,
        )
        await flushContext()
        await debug.logJson('fix-result-test.json', fr)
      } else if (validation.allPassed && !fixResult) {
        emit('fix', 'skipped', 'All tests passed')
        await flushContext()
      }

      // 8. Security scan (only after tests pass)
      const testsResolved = validation.allPassed || fixResult?.status === 'all_green'
      if (testsResolved) {
        const { runSemgrep } = await import('@appifex/validate')
        emit(
          'security',
          'started',
          `Scanning with ${opts.platform === 'swiftui' ? 'p/swift' : opts.platform === 'kotlin-compose' ? 'p/kotlin' : 'p/react'} rules`,
        )
        const secResult = await runSemgrep(runner, {
          projectDir: outputDir,
          platform: opts.platform,
        })
        if (secResult.error) {
          emit('security', 'failed', secResult.error)
          await flushContext()
        } else if (secResult.findings.length === 0) {
          emit('security', 'completed', 'No findings — clean')
          await flushContext()
          validation = { ...validation, security: secResult, allPassed: validation.allPassed }
        } else {
          emit('security', 'failed', `${secResult.findings.length} finding(s)`)
          await flushContext()

          // Fix security findings
          const secValidation: ValidationResult = {
            ui: { total: 0, passed: 0, failed: 0, results: [] },
            unit: { total: 0, passed: 0, failed: 0, failures: [] },
            security: secResult,
            allPassed: false,
          }
          const secValidateFn = async (): Promise<ValidationResult> => {
            const sec = await runSemgrep(runner, { projectDir: outputDir, platform: opts.platform })
            return {
              ui: { total: 0, passed: 0, failed: 0, results: [] },
              unit: { total: 0, passed: 0, failed: 0, failures: [] },
              security: sec,
              allPassed: sec.failed === 0,
            }
          }
          emit('fix', 'started', 'Fixing security findings')
          const createMessage = await getCreateMessage()
          const secFixFn =
            config.llm.provider === 'claude-cli'
              ? createClaudeCliFixFn({ runner, projectDir: outputDir, model: config.llm.model })
              : createDefaultFixFn({
                  apiKey: config.llm.apiKey ?? '',
                  runner,
                  projectDir: outputDir,
                  model: config.llm.model,
                  createMessage,
                  skillPrompt: skills.fixPrompt,
                  verbose: opts.verbose,
                })
          const fr = await fixLoop(secValidation, {
            fixFn: secFixFn,
            buildFn,
            validateFn: secValidateFn,
            maxAttempts: 3,
            tokenBudget: opts.benchmark ? Infinity : budget.totalRemaining,
            budgetInstance: opts.benchmark ? undefined : budget,
            disableCircuitBreakers: opts.benchmark,
          })
          emit(
            'fix',
            fr.status === 'all_green' ? 'completed' : 'failed',
            `Security fix ${fr.status} — ${fr.attempts.length} attempts`,
            fr.totalTokensUsed,
          )
          await flushContext()
          emit(
            'security',
            fr.status === 'all_green' ? 'completed' : 'failed',
            fr.status === 'all_green' ? 'Fixed — clean' : 'Finding(s) remaining after fix loop',
          )
          await flushContext()
          await debug.logJson('fix-result-security.json', fr)

          // Re-scan to get final state for report
          const finalSec = await runSemgrep(runner, {
            projectDir: outputDir,
            platform: opts.platform,
          })
          validation = {
            ...validation,
            security: finalSec,
            allPassed: validation.allPassed && finalSec.failed === 0,
          }
        }
      } else {
        emit('security', 'skipped', 'Skipped — tests failing')
        await flushContext()
      }
    } else {
      // Build still failing after fix attempts
      validation = {
        ui: { total: 0, passed: 0, failed: 0, results: [] },
        unit: { total: 0, passed: 0, failed: 0, failures: [] },
        allPassed: false,
      }
      emit('validate', 'failed', 'Skipped — build failed')
      await flushContext()
      emit('security', 'skipped', 'Skipped — build failed')
      await flushContext()
    }

    // 9. Report
    emit('report', 'started', 'Generating report')
    const report = buildReport({
      projectName: opts.prompt.slice(0, 50),
      platforms: [opts.platform],
      designIterations,
      validation: { [opts.platform]: validation },
      fix: fixResult ? { [opts.platform]: fixResult } : {},
      tokenUsage,
      totalDuration: Date.now() - startTime,
    })
    const markdown = formatMarkdown(report)
    await runner.writeFile(join(outputDir, 'report.md'), markdown)
    emit('report', 'completed', 'Report saved')
    await flushContext()

    // 9. Deliver (git commit + push + PR)
    let deliverResult: DeliverResult | undefined
    const deliverConfig = config.deliver
    if (deliverConfig && report.summary.allGreen) {
      emit('deliver', 'started', 'Committing and pushing code')
      try {
        const summaryLines = [
          `Platform: ${opts.platform}`,
          `Tests: ${report.summary.totalPassed}/${report.summary.totalTests} passing`,
          report.summary.allGreen ? 'All tests green' : `${report.summary.totalFailed} failures`,
          `Fix attempts: ${report.summary.fixAttempts}`,
          `Design iterations: ${report.summary.designIterations}`,
        ]
        // Generate a project name from the prompt via LLM (only if we might need to create a repo)
        let repoName: string | undefined
        if (!deliverConfig?.remoteUrl) {
          try {
            const createMessage = await getCreateMessage()
            const nameResp = await createMessage({
              model: config.llm.model ?? 'claude-sonnet-4-6',
              max_tokens: 30,
              messages: [
                {
                  role: 'user',
                  content: `Generate a short GitHub repository name (lowercase, hyphens, no spaces, max 3 words) for this app:\n\n"${opts.prompt}"\n\nRespond with ONLY the repo name, nothing else.`,
                },
              ],
            })
            const raw =
              nameResp.content[0]?.text
                ?.trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '') ?? ''
            if (raw.length > 0 && raw.length <= 50) repoName = raw
          } catch {
            // Fall back to simple slugify if LLM fails
          }
          repoName ??=
            opts.prompt
              .toLowerCase()
              .split(/[\s_]+/)
              .slice(0, 3)
              .join('-')
              .replace(/[^a-z0-9-]/g, '')
              .slice(0, 50) || 'dtc-app'
        }

        deliverResult = await deliver(runner, {
          projectDir: outputDir,
          repoName,
          repoVisibility: deliverConfig?.repoVisibility,
          summary: summaryLines.join('\n'),
          branch: deliverConfig?.baseBranch ? `dtc/${opts.platform}-${Date.now()}` : undefined,
          baseBranch: deliverConfig?.baseBranch,
          remoteUrl: deliverConfig?.remoteUrl,
          repo: deliverConfig?.repo,
          skipPr: deliverConfig?.skipPr,
          skipPush: deliverConfig?.skipPush,
          git: deliverConfig
            ? { userName: deliverConfig.userName, userEmail: deliverConfig.userEmail }
            : undefined,
          autoMerge: deliverConfig?.autoMerge,
          mergeMethod: deliverConfig?.mergeMethod,
          deleteBranchOnMerge: deliverConfig?.deleteBranchOnMerge,
          allTestsGreen: report.summary.allGreen,
        })
        // Persist auto-created repo URL to config so subsequent runs reuse it
        if (deliverResult.repoCreated && deliverResult.remoteUrl) {
          config.deliver = { ...deliverConfig, remoteUrl: deliverResult.remoteUrl }
          const { saveConfig } = await import('@appifex/core')
          await saveConfig(configDir, config)
        }
        const repoNote = deliverResult.repoCreated
          ? ` (repo created: ${deliverResult.remoteUrl})`
          : ''
        const msg = deliverResult.pr
          ? deliverResult.pr.merged
            ? `Committed ${deliverResult.commitHash.slice(0, 7)} → PR #${deliverResult.pr.number} auto-merged (${deliverResult.pr.mergeMethod})${repoNote}`
            : `Committed ${deliverResult.commitHash.slice(0, 7)} → PR #${deliverResult.pr.number}: ${deliverResult.pr.url}${repoNote}`
          : deliverResult.pushed
            ? `Committed ${deliverResult.commitHash.slice(0, 7)} → pushed to ${deliverResult.branch}${repoNote}`
            : `Committed ${deliverResult.commitHash.slice(0, 7)} (local only)`
        emit('deliver', 'completed', msg)
        await flushContext()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        emit('deliver', 'failed', `Deliver failed: ${message}`)
        await flushContext()
      }
    } else if (deliverConfig && !report.summary.allGreen) {
      emit('deliver', 'skipped', 'Skipped — tests not all green')
      await flushContext()
    } else {
      emit('deliver', 'skipped', 'No deliver config — skipped')
      await flushContext()
    }

    // 10. Provision
    //
    // Phase 5 Plan 06 (TF-01 D-03): iOS provision branch removed — archive + TestFlight upload
    // now run as their own dedicated phases (xcode_archive, testflight_upload) wired later in
    // this file so the pipeline emits distinct progress/checkpoint rows for each step and
    // stops shelling out to the deleted community `asc` CLI.
    //
    // Android/Play Console remains on the legacy `provision` PhaseId for this milestone —
    // the Kotlin→Play hardening belongs to a later milestone.
    const hasAndroidCreds =
      config.android?.serviceAccountKeyPath &&
      config.android?.packageName &&
      config.android?.keystorePath

    if (opts.platform === 'kotlin-compose' && hasAndroidCreds && report.summary.allGreen) {
      // ── Android: AAB + Play Console ──
      emit('provision', 'started', 'Building release AAB and submitting to Play Console')
      try {
        const bundleResult = await bundleKotlin(runner, {
          projectDir: outputDir,
          applicationId: config.android!.packageName,
          keystorePath: config.android!.keystorePath!,
          keystorePassword: config.android!.keystorePassword ?? '',
          keyAlias: config.android!.keyAlias ?? 'release',
          keyPassword: config.android!.keyPassword ?? '',
        })
        if (!bundleResult.success) {
          emit('provision', 'failed', `AAB build failed: ${bundleResult.error}`)
          await flushContext()
        } else {
          const playClient = new PlayConsoleClient({
            serviceAccountKeyPath: config.android!.serviceAccountKeyPath,
          })
          const track = config.android!.playTrack ?? 'internal'
          const submitResult = await playClient.submitToTrack({
            packageName: config.android!.packageName,
            aabPath: bundleResult.aabPath!,
            track,
          })
          if (submitResult.success) {
            emit('provision', 'completed', `Submitted to Play Console: ${submitResult.output}`)
            await flushContext()
          } else {
            emit('provision', 'failed', `Play Console submission failed: ${submitResult.error}`)
            await flushContext()
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        emit('provision', 'failed', `Provision failed: ${message}`)
        await flushContext()
      }
    } else if (opts.platform === 'kotlin-compose' && !hasAndroidCreds) {
      emit(
        'provision',
        'skipped',
        'Google Play Console credentials not configured — run `dtc setup`',
      )
      await flushContext()
    } else if (opts.platform === 'kotlin-compose' && !report.summary.allGreen) {
      emit('provision', 'skipped', 'Skipped — tests not all green')
      await flushContext()
    }
    // Phase 5 Plan 06: SwiftUI no longer emits any 'provision' row — the xcode_archive +
    // testflight_upload phase blocks (added below) own the iOS path.

    // Save run context for future resume/add-feature/refactor
    const apiFilesGenerated: string[] = []
    try {
      for (const pattern of [
        'Sources/**/*.swift',
        'src/**/*.{ts,tsx}',
        '__tests__/**/*.swift',
        '__tests__/**/*.{ts,tsx}',
      ]) {
        const files = await runner.glob(`${outputDir}/${pattern}`)
        for (const f of files) apiFilesGenerated.push(f.replace(outputDir + '/', ''))
      }
    } catch {
      /* glob failure shouldn't prevent saving context */
    }
    ctxBuilder.setFilesGenerated(apiFilesGenerated)
    const apiRunStatus = validation.allPassed
      ? ('completed' as const)
      : fixResult?.status === 'budget_exceeded'
        ? ('budget_exceeded' as const)
        : ('failed' as const)
    try {
      await saveRunContext(outputDir, ctxBuilder.build(apiRunStatus))
    } catch {
      /* context save must not block return */
    }

    try {
      checkpoint.close()
    } catch {
      /* ignore */
    }
    process.removeListener('SIGINT', sigintHandler)
    process.removeListener('exit', exitCleanup)
    return { report, validation, markdown, deliver: deliverResult }
  } catch (apiErr) {
    // Phase 13 (Pitfall 6): attribute the thrown failure to the currently-executing phase
    // so the checkpoint trail has a {failed} row for the phase that was running when the
    // throw escaped. Wrapped in try/catch per log-and-continue invariant (specifics #5).
    if (runMode === 'add-feature' && currentPhase !== null) {
      try {
        const now = new Date().toISOString()
        checkpoint.savePhase(checkpointRunId, currentPhase, {
          status: 'failed',
          error: String(apiErr),
          failedAt: now,
          completedAt: now,
        })
      } catch (ckptErr) {
        console.error(`[checkpoint] outer-catch savePhase failed: ${String(ckptErr)}`)
      }
    }
    // D-05: save partial context with status='failed' before re-throwing
    // D-06: err.message only — ctxBuilder.build('failed') captures recorded phases, no stack traces
    try {
      await saveRunContext(outputDir, ctxBuilder.build('failed'))
    } catch {
      /* context save must not block re-throw */
    }
    // Clean up process listeners to prevent accumulation across repeated calls
    try {
      checkpoint.close()
    } catch {
      /* ignore */
    }
    process.removeListener('SIGINT', sigintHandler)
    process.removeListener('exit', exitCleanup)
    throw apiErr
  }
}

/** Build Pencil-specific prompt with platform design guidelines */
function buildPencilPrompt(prompt: string, platform: import('@appifex/core').Platform): string {
  const platformGuidelines =
    platform === 'swiftui'
      ? `Follow Apple Human Interface Guidelines (HIG):
- Use SF Symbols for icons, SF Pro/SF Compact for typography
- NavigationStack with large titles, TabView for top-level navigation
- System colors that adapt to light/dark mode automatically
- Grouped inset list style for settings/forms (InsetGroupedListStyle)
- Sheets and popovers for modal content, not full-screen overlays
- 44pt minimum touch targets, standard iOS spacing (16pt margins)
- Native SwiftUI components: Toggle, DatePicker, Stepper, ProgressView
- Safe area insets, Dynamic Type support
- Rounded corners matching system style (continuous corner radius)
- Translucent materials and vibrancy effects where appropriate`
      : `Follow Material Design 3 (Material You) guidelines:
- Dynamic color theming from user wallpaper
- Top app bar with NavigationBar, bottom navigation for 3-5 destinations
- FAB (Floating Action Button) for primary action
- Cards with rounded corners (12dp), elevation for hierarchy
- 48dp minimum touch targets, 16dp screen margins
- Typography scale: Display, Headline, Title, Body, Label
- Shape system: small (4dp), medium (12dp), large (16dp) corners
- Motion: shared element transitions, predictive back gesture support
- Support for both compact and expanded screen sizes`

  const platformLabel =
    platform === 'swiftui'
      ? 'iOS native SwiftUI'
      : platform === 'kotlin-compose'
        ? 'Android native Kotlin Compose with Material Design 3'
        : 'Android native Kotlin Compose with Material Design 3'

  return `Design a mobile app (${platformLabel}): ${prompt}.

${platformGuidelines}

Design for iPhone/mobile screen size. Create realistic, production-quality screens.
Do NOT include the iOS status bar in the design — it is rendered by the system, not the app.`
}

/** Find components with image fills in the translated spec */
function findImageComponents(
  spec: import('@appifex/core').PlatformSpec,
): Array<{ id: string; name: string }> {
  const results: Array<{ id: string; name: string }> = []
  for (const screen of spec.screens) {
    for (const comp of flattenPlatformComponents(screen.components)) {
      if (comp.props.imageUrl) {
        results.push({ id: comp.id, name: comp.name })
      }
    }
  }
  return results
}

function flattenPlatformComponents(
  comps: import('@appifex/core').PlatformComponentSpec[],
): import('@appifex/core').PlatformComponentSpec[] {
  const result: import('@appifex/core').PlatformComponentSpec[] = []
  for (const c of comps) {
    result.push(c)
    if (c.children) result.push(...flattenPlatformComponents(c.children))
  }
  return result
}
