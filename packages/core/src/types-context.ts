import type { Platform, DesignTokens, DesignDeltaReport } from './types-design.js'
import type { PhaseId } from './types-pipeline.js'
import type { BaasContext } from './types-validation.js'

// ── Skills ──
export interface SkillContent {
  /** Prompt text to inject into the spec generation prompt */
  specPrompt: string
  /** Prompt text to inject into the codegen system prompt */
  codegenPrompt: string
  /** Prompt text to inject into the fix agent prompt */
  fixPrompt: string
}

export interface SkillProvider {
  /** Load skill content for a given platform */
  load(platform: Platform): Promise<SkillContent>
}

// ── Backend Context (for API-connected apps) ──

/** Describes an API endpoint the generated app should call */
export interface BackendEndpoint {
  method: string
  path: string
  description?: string
  requestBody?: string
  responseBody?: string
}

/** Authentication configuration for the backend API */
export interface BackendAuth {
  type: 'bearer' | 'api-key' | 'cookie' | 'none'
  description?: string
}

/** Context about a backend API that the generated app should integrate with */
export interface BackendContext {
  /** Base URL for the backend API (e.g. https://api.example.com) */
  apiBaseUrl: string
  /** List of API endpoints the app should call */
  endpoints: BackendEndpoint[]
  /** Model/schema definitions (key = type name, value = source code or description) */
  models?: Record<string, string>
  /** Authentication configuration */
  auth?: BackendAuth
  /** Additional context or instructions for the agent */
  notes?: string
}

// ── Run Context (persisted between sessions) ──

/** How the current pipeline run was initiated */
export type RunMode = 'fresh' | 'resume' | 'add-feature' | 'refactor'

/** Outcome of a single pipeline phase */
export interface PhaseOutcome {
  status: 'completed' | 'failed' | 'skipped'
  /** Human-readable one-liner (e.g. "3 screens, 12 components") */
  summary: string
  /** Key artifact paths produced by this phase */
  artifacts?: Record<string, string>
  /** Phase-specific structured data (screen counts, test counts, etc.) */
  detail?: unknown
}

// ── Code Analysis ──
export type FileCategory = 'screen' | 'component' | 'model' | 'service'

export interface InventoryEntry {
  filePath: string
  type: FileCategory
  name: string
}

export interface NavNode {
  screenId: string
  type: 'tab' | 'push' | 'modal' | 'drawer'
  targets: string[]
}

export interface AppContext {
  platform: Platform
  inventory: InventoryEntry[]
  navGraph: NavNode[]
  entryPoint: string | null
  scannedAt: number
}

/** Classification of what kind of change is needed on an existing screen */
export type ModificationChangeType = 'navigation' | 'layout' | 'button' | 'form' | 'other'

/** A single existing file that needs modification as part of an add-feature workflow */
export interface ModificationItem {
  /** Relative file path from outputDir (matches InventoryEntry.filePath) */
  filePath: string
  /** Screen/component name from inventory */
  screenName: string
  /** Human-readable description of what changes and why */
  changeDescription: string
  /** Change type classification for pre-build summary display and priority sorting */
  changeType: ModificationChangeType
  /** Full file content loaded from disk — sent to agent for in-context modification (per D-02) */
  fileContent: string
}

/** Structured plan of which existing screens to modify and how (per D-03, D-04) */
export interface ModificationPlan {
  items: ModificationItem[]
  /** Raw LLM reasoning for the plan (stored for debugging) */
  reasoning?: string
}

/** Screens added or modified by an add-feature run — computed post-codegen, stored for audit (Phase 11, per D-04/D-05/D-09) */
export interface ModifiedScreens {
  /** Screen names (InventoryEntry.name) that were NOT in the pre-run inventory */
  added: string[]
  /** Screen names whose source file SHA-256 changed between pre-run snapshot and post-codegen */
  modified: string[]
}

/** Persistent record of a pipeline run — saved to .dtc/run-context.json */
export interface RunContext {
  runId: string
  prompt: string
  platform: Platform
  mode: RunMode
  status: 'completed' | 'failed' | 'budget_exceeded'
  timestamp: number
  /** Outcomes for each phase that ran (not all phases may be present) */
  phases: Partial<Record<PhaseId, PhaseOutcome>>
  /** Files generated during this run */
  filesGenerated: string[]
  /** Agent session ID for --resume (Claude only) */
  agentSessionId?: string
  /** Added/modified screens for add-feature runs (Phase 11). Absent on fresh-app runs. */
  modifiedScreens?: ModifiedScreens
  /** Design token delta for add-feature runs (Phase 12). Absent on fresh-app runs or when no baseline .pen exists. */
  designDelta?: DesignDeltaReport
  /** Modification plan for add-feature runs (Phase 14). Persisted so resume can rehydrate it without recomputing scanProject + planModifications. D-20. */
  modificationPlan?: ModificationPlan
  /** Last-known-good design tokens snapshot from the most recent successful run (Phase 18, Bug B fix). Used as the LEFT side of runDesignDeltaPhase in add-feature mode so the delta detects drift between the persisted baseline and the current .pen. Absent on projects created before Phase 18 — falls back to current .pen extraction. */
  baselineDesignTokens?: DesignTokens
  /** BaaS provider context set during the baas_recommend phase (Phase 19). Absent on runs that skip BaaS. */
  baasContext?: BaasContext
}

/** Checkpoint data surfaced in MCP error responses for resume support (D-01) */
export interface CheckpointInfo {
  /** Run ID from the saved RunContext, or null if no context was persisted */
  run_id: string | null
  /** Phases that completed successfully before the failure */
  completed_phases: PhaseId[]
  /** Agent session ID for --resume (Claude only), or null if not available */
  agent_session_id: string | null
  /** The phase that failed, or null if exception occurred outside a phase */
  failed_phase: PhaseId | null
  /** Reserved for future token usage tracking */
  token_usage: null
  /** The outputDir passed to the pipeline — always matches the caller's value */
  output_dir: string
}
