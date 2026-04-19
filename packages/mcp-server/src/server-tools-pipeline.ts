import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { dirname } from 'node:path'
import type { CommandCollectingRunner } from './command-collecting-runner.js'
import { handleRunPipeline } from './tools/pipeline.js'
import { handleRefinePrompt, handleFeatureRefine } from './tools/refine.js'
import { handleAddFeature } from './tools/add-feature.js'
import { handleLoadConfig } from './tools/config.js'
import { handleDesignCreate, handleDesignIterate } from './tools/design.js'
import { handleFirebaseProvision } from './tools/firebase-provision.js'
import { handleTestflightUpload } from './tools/testflight.js'
import { handleGetPipelineStatus } from './tools/status.js'

const PLATFORM = z.enum(['swiftui', 'kotlin-compose']).describe('Target platform')

type ResolveRunner = (
  projectDir: string,
  configDir?: string,
) => Promise<{ runner: CommandCollectingRunner; config: any }>
type InjectCommands = (
  result: { text: string; isError: boolean },
  runner: CommandCollectingRunner,
) => { text: string; isError: boolean }

export function registerPipelineTools(
  server: McpServer,
  resolveRunner: ResolveRunner,
  injectCommands: InjectCommands,
): void {
  // ── Pipeline (full orchestration) ──

  server.tool(
    'dtc_run_pipeline',
    'Run the full DTC design-to-code pipeline: design → spec → test-gen → codegen → build → validate → fix → deliver → report. This is the highest-level tool — it orchestrates everything. IMPORTANT: If the prompt is short or vague (e.g. "todo app"), call dtc_refine_prompt first to gather requirements from the user before running this tool.',
    {
      prompt: z.string().describe('Natural language description of the app to build'),
      platform: PLATFORM,
      outputDir: z.string().describe('Directory where code will be generated'),
      designFile: z
        .string()
        .optional()
        .describe(
          'Path to existing design file. Accepts .pen (Pencil), .zip (any design-export zip — Google Stitch, Figma Make "Export HTML", or Claude Design "Standalone HTML files"), or Figma file URL.',
        ),
      mode: z.enum(['fresh', 'resume', 'add-feature', 'refactor']).optional().describe('Run mode'),
      agentType: z
        .enum(['claude', 'codex', 'gemini', 'auto', 'api'])
        .optional()
        .describe('Agent type (default: auto)'),
      resumeSessionId: z.string().optional().describe('Session ID to resume'),
      verbose: z.boolean().optional(),
      benchmark: z.boolean().optional().describe('Disable fix loop limits'),
      configDir: z.string().optional(),
      baasProvider: z
        .enum(['firebase', 'supabase'])
        .optional()
        .describe('BaaS provider to use (overrides config file baas.provider)'),
    },
    async (args) => {
      const sendLog = (message: string) => {
        server.server.sendLoggingMessage({ level: 'info', data: message }).catch(() => {})
      }
      const result = await handleRunPipeline(args, undefined, sendLog)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Prompt Refinement ──

  server.tool(
    'dtc_refine_prompt',
    'Refine a vague app prompt into a detailed one. Use "ask" mode to get clarifying questions, then "enrich" mode with user answers to produce a pipeline-ready prompt. IMPORTANT: When presenting questions to the user, always include the "hint" field from the response so users know they can skip all questions and build immediately with defaults.',
    {
      prompt: z.string().describe('The user\'s raw app description (e.g. "todo app")'),
      mode: z
        .enum(['ask', 'enrich'])
        .optional()
        .describe(
          'Mode: "ask" returns questions, "enrich" returns a detailed prompt (default: ask)',
        ),
      answers: z
        .string()
        .optional()
        .describe('JSON object of user answers keyed by question id (required for enrich mode)'),
      platform: z
        .enum(['swiftui', 'kotlin-compose'])
        .optional()
        .describe('Target platform hint (if already known)'),
    },
    async (args) => {
      const result = await handleRefinePrompt(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Feature Prompt Refinement ──

  server.tool(
    'dtc_refine_feature_prompt',
    'Refine a vague add-feature prompt into a detailed prompt with assumptions. First call returns assumptions for confirmation. Second call with confirmed=true returns the enriched prompt.',
    {
      prompt: z.string().describe('The add-feature prompt to refine'),
      confirmed: z
        .boolean()
        .optional()
        .describe('Set to true on second call to confirm assumptions and get enriched prompt'),
    },
    async (args) => {
      const result = await handleFeatureRefine(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Add Feature ──

  server.tool(
    'dtc_add_feature',
    'Add a feature to an existing project. Validates that a prior completed run exists at outputDir before proceeding.',
    {
      prompt: z.string().describe('Feature description'),
      outputDir: z
        .string()
        .describe('Directory of the existing project (.dtc/run-context.json must exist)'),
      platform: PLATFORM.optional(),
      confirmed: z
        .boolean()
        .optional()
        .describe('Set to true on second call to confirm the pre-build summary'),
    },
    async (args) => {
      const result = await handleAddFeature(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Config ──

  server.tool(
    'dtc_load_config',
    'Load DTC configuration from ~/.dtc/config.json (or a custom path)',
    { configDir: z.string().optional().describe('Config directory path (defaults to ~/.dtc)') },
    async (args) => {
      const result = await handleLoadConfig(args)
      return { content: [{ type: 'text' as const, text: result.text }] }
    },
  )

  // ── Design ──

  server.tool(
    'dtc_design_create',
    'Generate a design from a text prompt using the configured design tool (Pencil, Google Stitch, or Figma Make)',
    {
      prompt: z
        .string()
        .describe('Design prompt (e.g. "Pet adoption app with browse and favorites")'),
      outputPath: z.string().describe('Output path for the .pen file'),
      exportPath: z.string().optional().describe('Optional path to export a preview PNG'),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner, config } = await resolveRunner(dirname(args.outputPath), args.configDir)
      const raw = await handleDesignCreate(args, runner, config.design)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  server.tool(
    'dtc_design_iterate',
    'Apply changes to an existing design using the configured design tool (Pencil, Google Stitch, or Figma Make)',
    {
      inputPath: z.string().describe('Path to existing .pen file'),
      outputPath: z.string().describe('Output path (can be same as input for in-place edit)'),
      prompt: z.string().describe('Change description'),
      exportPath: z.string().optional(),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner, config } = await resolveRunner(dirname(args.inputPath), args.configDir)
      const raw = await handleDesignIterate(args, runner, config.design)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // Phase 7 (MCP-01 D-05 D-07): Firebase provisioning standalone
  server.tool(
    'dtc_firebase_provision',
    'Run the Firebase provisioning phase standalone against a pre-existing generated app. Creates/links Firebase project, downloads GoogleService-Info.plist, deploys Firestore security rules, and seeds empty collections. Idempotent (safe to re-run). Requires config.firebase.projectId + config.firebase.serviceAccountKeyPath in ~/.dtc/config.json.',
    {
      projectDir: z.string().describe('Absolute path to the generated iOS app directory'),
      overwritePlist: z
        .boolean()
        .optional()
        .describe(
          'Force overwrite GoogleService-Info.plist if present (default: skip when present)',
        ),
      configDir: z.string().optional().describe('Config directory (defaults to ~/.dtc)'),
    },
    async (args) => {
      const { runner, config } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleFirebaseProvision(args, runner, config)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // Phase 7 (MCP-01 D-05 D-07): TestFlight upload standalone (iOS only)
  server.tool(
    'dtc_testflight_upload',
    'Run the xcode_archive + testflight_upload pipeline phases standalone against a pre-existing generated app. iOS-only. Uses xcrun altool --upload-package with ASC JWT authentication (no `asc` community CLI required). Requires config.apple in ~/.dtc/config.json.',
    {
      projectDir: z.string().describe('Absolute path to the generated iOS app directory'),
      scheme: z.string().optional().describe('Xcode scheme to archive (default: "App")'),
      marketingVersion: z.string().optional().describe('Override CFBundleShortVersionString'),
      buildNumber: z.string().optional().describe('Override CFBundleVersion'),
      configDir: z.string().optional().describe('Config directory (defaults to ~/.dtc)'),
    },
    async (args) => {
      const { runner, config } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleTestflightUpload(args, runner, config)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // Phase 7 (MCP-02 D-05 D-06): read-only pipeline status snapshot
  server.tool(
    'dtc_get_pipeline_status',
    'Read .dtc/run-context.json + .dtc/checkpoint.db for a project and return a flat snapshot: { runId, currentPhase, phases: Array<{id, status, summary?}>, lastError? }. Read-only — never mutates run state. Agents use this for resume-vs-restart decisions.',
    {
      projectDir: z.string().describe('Absolute path to the project directory'),
      configDir: z.string().optional().describe('Config directory (defaults to ~/.dtc)'),
    },
    async (args) => {
      const result = await handleGetPipelineStatus(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )
}
