import type { PlatformSpec, DesignTokens } from './types-design.js'
import type { BaasRecommendationTier, BaasProvider } from './types-validation.js'

// ── Progress ──
export type PhaseId =
  | 'analysis'
  | 'design'
  | 'spec'
  | 'design_delta'
  | 'baas_recommend'
  | 'baas_schema'
  | 'baas_auth'
  | 'firebase_provision' // Phase 4 (FIRE-04)
  | 'mock_service'
  | 'test_gen'
  | 'codegen'
  | 'test_regen'
  | 'build'
  | 'validate'
  | 'security'
  | 'fix'
  | 'deliver'
  | 'e2e_gate' // Phase 6 (VAL-01 D-01): real-Firebase e2e gate before TestFlight
  | 'xcode_archive' // Phase 5 (TF-01 D-02): after deliver, before report
  | 'testflight_upload' // Phase 5 (TF-01 D-02): after xcode_archive, before report
  | 'report'
  | 'provision'

/** Phase 13 (QUALITY-03a): terminal-per-phase checkpoint row status. */
export type CheckpointStatus = 'completed' | 'failed' | 'skipped'

/** Base shape shared by every CheckpointData branch.
 *  status/completedAt are OPTIONAL so existing fresh-app call sites at
 *  cli/src/pipeline.ts:921/935/1289/1438 remain source-compatible (D-02/Pitfall 7). */
export interface CheckpointBase {
  status?: CheckpointStatus
  completedAt?: string // ISO-8601
}

export interface CheckpointFailed {
  status: 'failed'
  error: string // String(err) — no Error object (specifics #3)
  failedAt: string // ISO-8601
  completedAt?: string // present for terminal-row uniformity
}

export interface CheckpointSkipped {
  status: 'skipped'
  reason: string
  completedAt?: string
}

/** Phase 13: discriminated union of checkpoint row payloads, keyed by PhaseId.
 *  Thin resume index only — artifact content stays in run-context.json (D-06/D-14).
 *  Every branch MUST accept CheckpointFailed | CheckpointSkipped so failure/skip rows
 *  round-trip for any phase.
 */
export type CheckpointData = {
  analysis:
    | (CheckpointBase & {
        snapshotPath?: string
        snapshotSha256?: string
        fileCount?: number
      })
    | CheckpointFailed
    | CheckpointSkipped
  design: (CheckpointBase & { designFile?: string }) | CheckpointFailed | CheckpointSkipped
  spec: (CheckpointBase & { platformSpec?: PlatformSpec }) | CheckpointFailed | CheckpointSkipped
  design_delta: CheckpointBase | CheckpointFailed | CheckpointSkipped
  baas_recommend:
    | (CheckpointBase & {
        tier?: BaasRecommendationTier
        provider?: BaasProvider
      })
    | CheckpointFailed
    | CheckpointSkipped
  baas_schema:
    | (CheckpointBase & {
        entityCount?: number
      })
    | CheckpointFailed
    | CheckpointSkipped
  baas_auth: CheckpointBase | CheckpointFailed | CheckpointSkipped
  // Phase 4 (FIRE-04): firebase_provision checkpoint — stores plist path and projectId for idempotency
  firebase_provision:
    | (CheckpointBase & {
        projectId?: string
        iosAppId?: string
        plistPath?: string
        collectionsSeeded?: number
      })
    | CheckpointFailed
    | CheckpointSkipped
  mock_service:
    | (CheckpointBase & {
        fileCount?: number
        platforms?: string[]
      })
    | CheckpointFailed
    | CheckpointSkipped
  test_gen:
    | (CheckpointBase & {
        uiTestFileNames?: string[]
        unitTestFileNames?: string[]
        uiTestCount?: number
        unitTestCount?: number
      })
    | CheckpointFailed
    | CheckpointSkipped
  codegen: CheckpointBase | CheckpointFailed | CheckpointSkipped
  test_regen: CheckpointBase | CheckpointFailed | CheckpointSkipped
  build: CheckpointBase | CheckpointFailed | CheckpointSkipped
  validate: CheckpointBase | CheckpointFailed | CheckpointSkipped
  security: CheckpointBase | CheckpointFailed | CheckpointSkipped
  fix: CheckpointBase | CheckpointFailed | CheckpointSkipped
  deliver: CheckpointBase | CheckpointFailed | CheckpointSkipped
  // Phase 6 (VAL-01 D-01): e2e_gate checkpoint — stores flow file + pass/fail state for idempotent resume
  e2e_gate:
    | (CheckpointBase & {
        flowFile?: string
        passed?: boolean
        totalFlows?: number
        failureSummary?: string
      })
    | CheckpointFailed
    | CheckpointSkipped
  // Phase 5 (TF-01 D-01): xcode_archive checkpoint — stores .ipa path + version for idempotent resume (D-16)
  xcode_archive:
    | (CheckpointBase & {
        ipaPath?: string
        archivePath?: string
        buildNumber?: string
        marketingVersion?: string
        bundleId?: string
      })
    | CheckpointFailed
    | CheckpointSkipped
  // Phase 5 (TF-04 D-01): testflight_upload checkpoint — stores ASC buildId + terminal processing state
  testflight_upload:
    | (CheckpointBase & {
        buildId?: string
        processingState?: 'PROCESSING' | 'VALID' | 'INVALID' | 'FAILED'
        groupId?: string
        testersAdded?: number
        /** Phase 5 (D-17): soft-fail warnings surfaced in the report */
        warnings?: string[]
      })
    | CheckpointFailed
    | CheckpointSkipped
  report: CheckpointBase | CheckpointFailed | CheckpointSkipped
  /** provision is a PhaseId but NOT in PHASE_ORDER (Pitfall 1). Branch present for type completeness. */
  provision: CheckpointBase | CheckpointFailed | CheckpointSkipped
}

export interface ProgressEvent {
  phase: PhaseId
  status: 'started' | 'running' | 'completed' | 'failed' | 'skipped'
  message: string
  detail?: unknown
  timestamp: number
  tokensUsed?: number
  /**
   * Phase 7 (OBS-01 D-14 — revision B-05): input tokens for this phase (live cost).
   *
   * MUST be a per-call delta (not cumulative). Consumers (e.g. PipelineView) accumulate
   * these values across events. If this event has status 'completed', omit this field
   * unless the completion itself consumed tokens (e.g. a summary LLM call at phase end).
   */
  tokensInput?: number
  /**
   * Phase 7 (OBS-01 D-14 — revision B-05): output tokens for this phase (live cost).
   *
   * MUST be a per-call delta (not cumulative). Consumers (e.g. PipelineView) accumulate
   * these values across events. If this event has status 'completed', omit this field
   * unless the completion itself consumed tokens (e.g. a summary LLM call at phase end).
   */
  tokensOutput?: number
  /** Phase 7 (OBS-01 D-14 — revision B-05): USD cost for this phase, or omitted
   *  when model unknown (UI renders em-dash). */
  costUsd?: number
}

// ── Agent ──
export type AgentConfigType =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'copilot'
  | 'antigravity'
  | 'api'
  | 'auto'

export interface AgentConfig {
  type: AgentConfigType
  model?: string
  maxBudgetUsd?: number
  timeoutMs?: number
}
