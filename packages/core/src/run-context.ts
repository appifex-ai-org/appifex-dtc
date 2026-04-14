import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  BaasContext,
  DesignDeltaReport,
  DesignTokens,
  ModificationPlan,
  ModifiedScreens,
  PhaseId,
  PhaseOutcome,
  Platform,
  RunContext,
  RunMode,
} from './types.js'

const CONTEXT_DIR = '.dtc'
const CONTEXT_FILE = 'run-context.json'

/** Save a RunContext to {outputDir}/.dtc/run-context.json */
export async function saveRunContext(outputDir: string, context: RunContext): Promise<void> {
  const dir = join(outputDir, CONTEXT_DIR)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, CONTEXT_FILE), JSON.stringify(context, null, 2))
}

/** Load the most recent RunContext from {outputDir}/.dtc/run-context.json, or null if none */
export async function loadRunContext(outputDir: string): Promise<RunContext | null> {
  try {
    const raw = await readFile(join(outputDir, CONTEXT_DIR, CONTEXT_FILE), 'utf-8')
    const parsed = JSON.parse(raw)
    // Structural validation — reject corrupted or unrelated JSON
    if (
      !parsed ||
      typeof parsed.runId !== 'string' ||
      typeof parsed.platform !== 'string' ||
      typeof parsed.phases !== 'object'
    ) {
      return null
    }
    return parsed as RunContext
  } catch {
    return null
  }
}

export const PHASE_ORDER: PhaseId[] = [
  'analysis',
  'design',
  'spec',
  'design_delta',
  'baas_recommend',
  'baas_schema',
  'baas_auth',
  'mock_service',
  'test_gen',
  'codegen',
  'test_regen',
  'build',
  'validate',
  'security',
  'fix',
  'deliver',
  'report',
]

const STATUS_LABEL: Record<string, string> = {
  completed: 'completed',
  failed: 'FAILED',
  skipped: 'skipped',
}

/** Format a RunContext into a text summary suitable for injection into an agent prompt */
export function buildContextSummary(ctx: RunContext): string {
  const lines: string[] = []

  lines.push(`## Previous Run Context`)
  lines.push('')
  lines.push(`- **Prompt**: ${ctx.prompt}`)
  lines.push(`- **Platform**: ${ctx.platform}`)
  lines.push(`- **Status**: ${ctx.status}`)
  lines.push(`- **Run ID**: ${ctx.runId}`)
  if (ctx.agentSessionId) {
    lines.push(`- **Agent Session**: ${ctx.agentSessionId}`)
  }

  // Phase outcomes
  lines.push('')
  lines.push(`### Phases`)
  for (const phase of PHASE_ORDER) {
    const outcome = ctx.phases[phase]
    if (!outcome) continue
    const label = STATUS_LABEL[outcome.status] ?? outcome.status
    lines.push(`- **${phase}** [${label}]: ${outcome.summary}`)
  }

  // Files
  if (ctx.filesGenerated.length > 0) {
    lines.push('')
    lines.push(`### Files Generated (${ctx.filesGenerated.length})`)
    for (const f of ctx.filesGenerated) {
      lines.push(`- ${f}`)
    }
  }

  return lines.join('\n')
}

/** Incrementally accumulates phase outcomes during a pipeline run, then builds a RunContext */
export class RunContextBuilder {
  private readonly runId: string
  private readonly prompt: string
  private readonly platform: Platform
  private readonly mode: RunMode
  private readonly phases: Partial<Record<PhaseId, PhaseOutcome>> = {}
  private filesGenerated: string[] = []
  private agentSessionId?: string
  private modifiedScreens?: ModifiedScreens
  private designDelta?: DesignDeltaReport
  private modificationPlan?: ModificationPlan
  private baselineDesignTokens?: DesignTokens
  private baasContext?: BaasContext

  constructor(opts: { prompt: string; platform: Platform; mode: RunMode }) {
    this.runId = `run-${randomUUID().slice(0, 12)}`
    this.prompt = opts.prompt
    this.platform = opts.platform
    this.mode = opts.mode
  }

  recordPhase(
    phase: PhaseId,
    status: PhaseOutcome['status'],
    summary: string,
    detail?: unknown,
    artifacts?: Record<string, string>,
  ): void {
    this.phases[phase] = {
      status,
      summary,
      ...(detail !== undefined && { detail }),
      ...(artifacts && { artifacts }),
    }
  }

  setFilesGenerated(files: string[]): void {
    this.filesGenerated = files
  }

  setAgentSessionId(id: string): void {
    this.agentSessionId = id
  }

  setModifiedScreens(ms: ModifiedScreens): void {
    this.modifiedScreens = ms
  }

  setDesignDelta(delta: DesignDeltaReport): void {
    this.designDelta = delta
  }

  setModificationPlan(plan: ModificationPlan): void {
    this.modificationPlan = plan
  }

  setBaselineDesignTokens(tokens: DesignTokens): void {
    this.baselineDesignTokens = tokens
  }

  setBaasContext(ctx: BaasContext): void {
    this.baasContext = ctx
  }

  build(status: RunContext['status']): RunContext {
    return {
      runId: this.runId,
      prompt: this.prompt,
      platform: this.platform,
      mode: this.mode,
      status,
      timestamp: Date.now(),
      phases: { ...this.phases },
      filesGenerated: [...this.filesGenerated],
      ...(this.agentSessionId && { agentSessionId: this.agentSessionId }),
      ...(this.modifiedScreens !== undefined && { modifiedScreens: this.modifiedScreens }),
      ...(this.designDelta !== undefined && { designDelta: this.designDelta }),
      ...(this.modificationPlan !== undefined && { modificationPlan: this.modificationPlan }),
      ...(this.baselineDesignTokens !== undefined && {
        baselineDesignTokens: this.baselineDesignTokens,
      }),
      ...(this.baasContext !== undefined && { baasContext: this.baasContext }),
    }
  }
}
