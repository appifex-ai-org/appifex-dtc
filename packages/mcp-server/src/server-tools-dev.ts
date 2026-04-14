import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CommandCollectingRunner } from './command-collecting-runner.js'
import { handleSpecExtract, handleSpecTranslate } from './tools/spec.js'
import { handleTestGenUi, handleTestGenUnit } from './tools/test-gen.js'
import { handleBuild } from './tools/build.js'
import { handleValidate, handleSecurity } from './tools/validate.js'
import { handleFix } from './tools/fix.js'
import { handleDeliver } from './tools/deliver.js'
import { handleReport } from './tools/report.js'
import { handleProvisionSubmit } from './tools/provision.js'
import { handleLoadContext, handleSaveContext } from './tools/config.js'

const PLATFORM = z.enum(['swiftui', 'kotlin-compose']).describe('Target platform')

type ResolveRunner = (projectDir: string, configDir?: string) => Promise<{ runner: CommandCollectingRunner; config: any }>
type InjectCommands = (result: { text: string; isError: boolean }, runner: CommandCollectingRunner) => { text: string; isError: boolean }

export function registerDevTools(
  server: McpServer,
  resolveRunner: ResolveRunner,
  injectCommands: InjectCommands,
): void {
  // ── Spec ──

  server.tool(
    'dtc_spec_extract',
    'Extract a DesignSpec from a .pen design file (deterministic, no LLM)',
    { filePath: z.string().describe('Path to the .pen file') },
    async (args) => {
      const result = await handleSpecExtract(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  server.tool(
    'dtc_spec_translate',
    'Translate a generic DesignSpec into a platform-specific PlatformSpec (SwiftUI or Kotlin Compose)',
    {
      specJson: z.string().describe('JSON string of the DesignSpec'),
      platform: PLATFORM,
    },
    async (args) => {
      const result = await handleSpecTranslate(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Test Gen ──

  server.tool(
    'dtc_test_gen_ui',
    'Generate Maestro UI test flows from a PlatformSpec',
    {
      specJson: z.string().describe('JSON string of the PlatformSpec'),
      bundleId: z.string().optional().describe('iOS bundle ID for Maestro (e.g. com.dtc.MyApp)'),
    },
    async (args) => {
      const result = await handleTestGenUi(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  server.tool(
    'dtc_test_gen_unit',
    'Generate unit tests (XCTest or Jest) from a PlatformSpec',
    { specJson: z.string().describe('JSON string of the PlatformSpec') },
    async (args) => {
      const result = await handleTestGenUnit(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Build ──

  server.tool(
    'dtc_build',
    'Build a project (xcodebuild for SwiftUI, Gradle for Kotlin Compose)',
    {
      platform: PLATFORM,
      projectDir: z.string().describe('Absolute path to the project directory'),
      scheme: z.string().optional().describe('Xcode scheme name (SwiftUI only, defaults to "App")'),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleBuild(args, runner)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Validate ──

  server.tool(
    'dtc_validate',
    'Run all tests: Maestro UI tests + unit tests (Jest/XCTest) + optional Semgrep security scan',
    {
      platform: PLATFORM,
      projectDir: z.string().describe('Absolute path to the project directory'),
      flowDir: z.string().optional().describe('Maestro flows directory (defaults to <projectDir>/.maestro)'),
      testDir: z.string().optional().describe('Unit tests directory (defaults to <projectDir>/__tests__)'),
      runSecurity: z.boolean().optional().describe('Run Semgrep security scan (defaults to true)'),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleValidate(args, runner)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  server.tool(
    'dtc_security',
    'Run Semgrep OWASP security scan on a project',
    {
      projectDir: z.string().describe('Absolute path to the project directory'),
      platform: PLATFORM.optional(),
      config: z.string().optional().describe('Semgrep rule config (e.g. p/owasp-top-ten)'),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleSecurity(args, runner)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Fix ──

  server.tool(
    'dtc_fix',
    'Run the TDD fix loop — iterates fix → build → validate until all tests pass or a circuit breaker fires',
    {
      platform: PLATFORM,
      projectDir: z.string().describe('Absolute path to the project directory'),
      maxAttempts: z.number().optional().describe('Max fix attempts (default 5)'),
      tokenBudget: z.number().optional().describe('Max tokens to spend (default 200000)'),
      flowDir: z.string().optional(),
      testDir: z.string().optional(),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner, config } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleFix(args, runner, config)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Deliver ──

  server.tool(
    'dtc_deliver',
    'Commit code to git, push, and optionally create a PR. Auto-creates GitHub repo if needed.',
    {
      projectDir: z.string().describe('Absolute path to the project directory'),
      branch: z.string().optional().describe('Branch name (defaults to dtc/<timestamp>)'),
      baseBranch: z.string().optional().describe('Base branch for PR (defaults to main)'),
      remoteUrl: z.string().optional().describe('Git remote URL'),
      skipPr: z.boolean().optional().describe('Skip PR creation'),
      skipPush: z.boolean().optional().describe('Skip push (commit only)'),
      summary: z.string().optional().describe('Commit/PR summary message'),
      autoMerge: z.boolean().optional().describe('Auto-merge the PR when tests are green'),
      allTestsGreen: z.boolean().optional().describe('Whether all tests passed'),
      configDir: z.string().optional(),
    },
    async (args) => {
      const { runner, config } = await resolveRunner(args.projectDir, args.configDir)
      const raw = await handleDeliver(args, runner, config)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Report ──

  server.tool(
    'dtc_report',
    'Generate a pipeline report (markdown or JSON) from validation and fix results',
    {
      projectName: z.string().describe('Project name for the report header'),
      platforms: z.array(z.string()).describe('Platforms processed (e.g. ["swiftui"])'),
      validationJson: z.string().describe('JSON string of the ValidationResult'),
      fixJson: z.string().optional().describe('JSON string of the FixResult'),
      tokenUsageJson: z.string().optional().describe('JSON string of token usage per phase'),
      totalDuration: z.number().optional().describe('Total pipeline duration in ms'),
      designIterations: z.number().optional(),
      format: z.enum(['markdown', 'json']).optional().describe('Output format (default markdown)'),
    },
    async (args) => {
      const result = await handleReport(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Provision (archive + TestFlight / AAB + Play Console) ──

  server.tool(
    'dtc_provision_submit',
    'Build and submit an app to TestFlight (iOS) or Play Console Internal Testing (Android). Auto-detects platform from the project directory, or specify explicitly.',
    {
      projectDir: z.string().optional().describe('Absolute path to the project directory (required if ipaPath/aabPath is not provided)'),
      scheme: z.string().optional().describe('Xcode scheme name (iOS only, defaults to App)'),
      ipaPath: z.string().optional().describe('Path to a pre-built .ipa file (iOS, skips archive if provided)'),
      aabPath: z.string().optional().describe('Path to a pre-built .aab file (Android, skips build if provided)'),
      platform: z.enum(['ios', 'android']).optional().describe('Target platform (auto-detected from project if omitted)'),
      exportMethod: z.enum(['app-store', 'ad-hoc', 'development']).optional().describe('Export method for iOS (defaults to app-store)'),
      configDir: z.string().optional(),
    },
    async (args) => {
      if (!args.ipaPath && !args.aabPath && !args.projectDir) {
        return { content: [{ type: 'text' as const, text: 'Either projectDir, ipaPath, or aabPath must be provided.' }], isError: true }
      }
      const { runner, config } = await resolveRunner(args.projectDir ?? '.', args.configDir)
      const raw = await handleProvisionSubmit(args, runner, config)
      const result = injectCommands(raw, runner)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  // ── Analysis ──

  server.tool(
    'dtc_analyze',
    'Scan an existing project to produce a structural inventory and navigation graph',
    {
      outputDir: z.string().describe('Path to the existing project directory'),
      platform: z.enum(['swiftui', 'kotlin-compose']).describe('Platform to scan for'),
    },
    async (args) => {
      const { handleAnalyze } = await import('./tools/analysis.js')
      return handleAnalyze(args)
    },
  )

  // ── Run Context ──

  server.tool(
    'dtc_load_context',
    'Load the previous run context from a project directory (.dtc/run-context.json)',
    { outputDir: z.string().describe('Project output directory') },
    async (args) => {
      const result = await handleLoadContext(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )

  server.tool(
    'dtc_save_context',
    'Save a run context to a project directory for future resume/add-feature/refactor',
    {
      outputDir: z.string().describe('Project output directory'),
      contextJson: z.string().describe('JSON string of the RunContext to save'),
    },
    async (args) => {
      const result = await handleSaveContext(args)
      return { content: [{ type: 'text' as const, text: result.text }], isError: result.isError }
    },
  )
}
