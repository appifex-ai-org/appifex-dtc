#!/usr/bin/env node
import chalk from 'chalk'
import { createRequire } from 'module'
import { parseArgs } from './cli.js'
import { setupWizard } from './setup-wizard.js'
import { renderRunApp } from './views/RunApp.js'
import { CliError, type Platform } from '@appifex/core'

const _require = createRequire(import.meta.url)
const _pkg = _require('../package.json') as { version: string }

/**
 * Phase 02 Plan 01 (FOUND-04): top-level CliError translator.
 * CLI-only — the MCP server does NOT call this; instead, its tool wrapper
 * translates CliError to an `isError` envelope (see packages/mcp-server/src/server.ts).
 */
export function handleCliError(err: unknown): never {
  if (err instanceof CliError) {
    console.error(chalk.red(`${err.name}: ${err.message}`))
    process.exit(err.exitCode ?? 1)
  }
  // Phase 02 Plan 04 (WR-02): preserve stack trace for non-CliError crashes so field debugging
  // has file/line info instead of a single-line message.
  if (err instanceof Error) {
    console.error(chalk.red(err.message))
    if (err.stack) console.error(chalk.dim(err.stack))
  } else {
    console.error(chalk.red(String(err)))
  }
  process.exit(1)
}

const VERSION = _pkg.version

const SUPPORTED_PLATFORMS = new Set<string>(['swiftui', 'kotlin-compose', 'react'])

function validatePlatform(platform: string): Platform {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    console.error(
      chalk.red(
        `Error: unsupported platform "${platform}". Supported: swiftui, kotlin-compose, react`,
      ),
    )
    process.exit(1)
  }
  return platform as Platform
}

/**
 * Phase 24 (RESUME-01): Resolve the --resume flag value.
 * Bare `--resume` (boolean true from parseArgs) auto-loads from previous context.
 */
export function resolveResumeSessionId(
  flagValue: string | true | undefined,
  previousContext: { agentSessionId?: string } | null,
): string | undefined {
  if (typeof flagValue === 'string') return flagValue
  if (flagValue === true) {
    const sessionId = previousContext?.agentSessionId
    if (!sessionId) {
      throw new Error('--resume requires a session ID or a previous run with an agentSessionId')
    }
    return sessionId
  }
  return undefined
}

function validateBaasProvider(value: string): import('@appifex/core').BaasProvider {
  const VALID = new Set(['firebase', 'supabase', 'mock'])
  if (!VALID.has(value)) {
    console.error(
      chalk.red(`Error: invalid --baas-provider "${value}". Must be: firebase, supabase, mock`),
    )
    process.exit(1)
  }
  return value as import('@appifex/core').BaasProvider
}

function printHelp() {
  console.log(`
${chalk.bold('dtc')} — Design-to-Code Toolkit v${VERSION}

${chalk.dim('USAGE')}
  dtc <command> [options]

${chalk.dim('COMMANDS')}
  ${chalk.bold('setup')}                   Configure LLM, design tool, runner, Apple creds
  ${chalk.bold('doctor')}                  Check prerequisites for a platform
  ${chalk.bold('run')}                     Run full pipeline (design → validate → fix)
  ${chalk.bold('design')}                  Create or iterate on a design
  ${chalk.bold('spec extract')}            Extract design spec from .pen file
  ${chalk.bold('spec translate')}          Translate spec to platform-specific format
  ${chalk.bold('test-gen ui')}             Generate Maestro UI test flows
  ${chalk.bold('test-gen unit')}           Generate Jest/XCTest unit tests
  ${chalk.bold('codegen')}                 Generate code from spec + tests
  ${chalk.bold('build')}                   Build project (Expo or xcodebuild)
  ${chalk.bold('validate')}                Run all tests (Maestro + Jest/XCTest)
  ${chalk.bold('security')}                Run Semgrep OWASP security scan
  ${chalk.bold('fix')}                     Run TDD fix loop (red → green)
  ${chalk.bold('provision submit')}        Archive + submit to TestFlight (or submit pre-built .ipa)
  ${chalk.bold('deliver')}                 Commit, push, and create PR for generated code
  ${chalk.bold('report')}                  Generate pipeline report

${chalk.dim('OPTIONS')}
  --help                  Show this help
  --version               Show version
  --platform <platform>   swiftui or kotlin-compose
  --project <dir>         Project directory
  --prompt <text>         Design prompt
  --out <path>            Output path
  --design <file.pen>     Use existing .pen design file (skip Pencil generation)
  --skills <dir>          Custom skills directory (SKILL.md + references/)
  --config <rule>         Semgrep rule config (default: auto, e.g. p/react, p/owasp-top-ten)
  --verbose               Save debug logs to .dtc-debug/ in output directory
  --benchmark             Disable all fix loop limits (runs until all tests pass)
  --agent <type>          Agent type: claude, codex, gemini, auto, api (default: auto)
  --resume [session-id]   Resume a previous session (bare --resume auto-loads from run context)
  --add-feature           Add a feature to an existing project (validates run-context.json exists)
  --mode <mode>           Run mode: fresh, resume, add-feature, refactor (default: auto-detect)
  --baas-provider <name>  BaaS provider: firebase, supabase (overrides config)
  --accept-drift          Non-interactive: accept design token drift without failing closed
  --no-resume             Force a fresh add-feature run even when a checkpoint DB exists
  --skip-testflight       Skip testflight_upload phase (xcode_archive still runs for local .ipa)
  --skip-validation-gate  Run validation gate checks but don't block ship on failure
  --overwrite-user-edits  Overwrite files that have been edited since the last run
                          (default: preserve user-edited files with a yellow warning)
  --export-debug-bundle   Write .dtc-debug/bundle-<ts>.zip even on successful runs
                          (bundle is always written on failure)

${chalk.dim('EXAMPLES')}
  dtc setup
  dtc run --prompt "Todo app" --platform swiftui --out ./app --agent claude
  dtc run --prompt "Todo app" --platform swiftui --design ./my-design.pen --out ./app
  dtc design --prompt "Shopping app" --out design.pen
  dtc validate --all --platform swiftui --project ./app
  dtc security --project ./app --platform swiftui
  dtc fix --spec spec.json --flows .maestro/ --unit-tests __tests__/ --project ./app
  dtc deliver --project ./app --remote-url https://github.com/me/app.git
  dtc deliver --project ./app --skip-pr --branch my-feature
  dtc run --prompt "Add dark mode" --out ./pet-app --mode add-feature
  dtc run --prompt "Weather app" --platform kotlin-compose --out ./weather-app
  dtc run --prompt "Chat app" --platform swiftui --out ./chat --baas-provider firebase
  dtc run --resume --out ./pet-app
  dtc run --prompt "Extract shared components" --out ./pet-app --mode refactor
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  switch (args.command) {
    case 'help':
      printHelp()
      break

    case 'version':
      console.log(VERSION)
      break

    case 'setup':
      // Phase 03 Plan 03 (SETUP-01, D-10): pass section + full from parsed args
      await setupWizard(undefined, {
        only: args.section as import('./setup/index.js').SectionName | undefined,
        full: args.full ?? false,
      })
      break

    case 'doctor': {
      // Phase 03 Plan 05 (SETUP-03, D-12): pass --deep flag; platform flag retained for compat.
      const { runDoctor } = await import('./doctor.js')
      await runDoctor({ deep: args.deep ?? false })
      break
    }

    case 'run': {
      const prompt = args.flags.prompt as string
      const platform = validatePlatform((args.flags.platform as string) ?? 'swiftui')
      const outputDir = (args.flags.out as string) ?? './app'
      const designFile = args.flags.design as string | undefined
      // Phase 1 Plan 07 (GATE-02): --design-ir is the typed fallback path
      // exposed on ParsedArgs (mutual exclusion with --design enforced in
      // parseArgs). Threaded through to PipelineOpts.designIrPath.
      const designIrPath = args.designIrPath
      const skillsDir = args.flags.skills as string | undefined
      const agent = args.flags.agent as string | undefined
      const resumeRaw = args.flags.resume as string | true | undefined
      const modeFlag = args.flags.mode as string | undefined
      const addFeature = args.flags['add-feature'] === true
      const acceptDrift = args.flags['accept-drift'] === true
      const noResume = args.flags['no-resume'] === true
      const baasProviderFlag = args.flags['baas-provider'] as string | undefined
      // Phase 5 Plan 06 (TF-04 D-04): --skip-testflight gates the testflight_upload phase only;
      // xcode_archive still runs so the .ipa artifact exists on disk for manual inspection / retry.
      const skipTestflight = args.flags['skip-testflight'] === true
      // Phase 6 (VAL-04 D-16 D-17): --skip-validation-gate runs all checks but bypasses the terminal gate.
      // Failures appear in the report but xcode_archive + testflight_upload proceed anyway.
      // Hard-fail (security-lint + semgrep) is NOT bypassed.
      const skipValidationGate = args.flags['skip-validation-gate'] === true
      // --skip-simulator: omit iOS Simulator runtime from preflight — for CI runners (macos-14)
      // that have Xcode but no simulator runtimes installed (e.g. when --skip-simulator is passed).
      const skipSimulator = args.flags['skip-simulator'] === true
      // Phase 7 (MCP-03 D-10): --overwrite-user-edits bypasses user-edit preservation gate.
      const overwriteUserEdits = args.overwriteUserEdits
      // Phase 7 (OBS-03 D-16): --export-debug-bundle forces bundle creation on success too.
      const exportDebugBundle = args.exportDebugBundle

      if (!prompt && !resumeRaw && !designFile && !designIrPath) {
        console.error(
          chalk.red(
            'Error: --prompt is required for `dtc run` (or use --design <file.pen|file.zip>, --design-ir <ir.json>, or --resume <session-id>)',
          ),
        )
        process.exit(1)
      }

      // D-08: --add-feature validates before pipeline, sets mode=add-feature
      if (addFeature) {
        const { loadRunContext } = await import('@appifex/core')
        const ctx = await loadRunContext(outputDir)
        if (!ctx) {
          // D-11: exact error message
          console.error(
            chalk.red(
              `No existing project found at ${outputDir}. Run \`dtc run\` first to create a project, then use \`--add-feature\` to add to it.`,
            ),
          )
          process.exit(1)
        }
      }

      // Phase 24 (D-01/D-02): resolve bare --resume boolean to session ID from previous context
      let resume: string | undefined
      if (resumeRaw !== undefined) {
        const { loadRunContext } = await import('@appifex/core')
        const prevCtx = await loadRunContext(outputDir)
        try {
          resume = resolveResumeSessionId(resumeRaw, prevCtx)
        } catch (err) {
          console.error(chalk.red((err as Error).message))
          process.exit(1)
        }
      }

      // Auto-detect run mode: --resume → resume, --mode → explicit, else fresh
      const VALID_MODES = ['fresh', 'resume', 'add-feature', 'refactor'] as const
      if (modeFlag && !VALID_MODES.includes(modeFlag as (typeof VALID_MODES)[number])) {
        console.error(
          chalk.red(
            `Error: invalid --mode "${modeFlag}". Must be one of: ${VALID_MODES.join(', ')}`,
          ),
        )
        process.exit(1)
      }
      // D-08: --add-feature takes precedence over --mode
      const runMode = addFeature
        ? ('add-feature' as const)
        : ((modeFlag as import('@appifex/core').RunMode | undefined) ??
          (resume ? ('resume' as const) : undefined))

      // Preflight: fail fast if critical tools are missing
      {
        const { runPreflight } = await import('./preflight.js')
        const { loadConfig } = await import('@appifex/core')
        const { homedir } = await import('node:os')
        const { join } = await import('node:path')
        try {
          const preflightConfig = await loadConfig(join(homedir(), '.dtc'))
          await runPreflight(platform, preflightConfig, { skipSimulator })
        } catch (err) {
          // If loadConfig fails, fall back to default-config preflight
          // Re-throw PreflightError so handleCliError can catch it cleanly
          if ((err as NodeJS.ErrnoException).code !== undefined) {
            await runPreflight(platform, undefined, { skipSimulator })
          } else {
            throw err
          }
        }
      }

      await renderRunApp({
        prompt:
          prompt ??
          (designFile || designIrPath
            ? 'Build the app matching the provided design'
            : 'Resume previous session'),
        platform: platform as Platform,
        outputDir,
        designFile,
        designIrPath,
        skillsDir,
        verbose: args.flags.verbose === true,
        benchmark: args.flags.benchmark === true,
        agentType: agent as import('@appifex/core').AgentConfigType | undefined,
        resumeSessionId: resume,
        runMode,
        acceptDrift,
        noResume,
        baasProvider: baasProviderFlag ? validateBaasProvider(baasProviderFlag) : undefined,
        skipTestflight,
        skipValidationGate,
        skipSimulator,
        overwriteUserEdits,
        exportDebugBundle,
      })
      break
    }

    case 'design': {
      const prompt = args.flags.prompt as string
      const out = args.flags.out as string
      if (!prompt || !out) {
        console.error(chalk.red('Error: --prompt and --out are required'))
        process.exit(1)
      }
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig } = await import('@appifex/core')
      const { createDesignAdapter } = await import('@appifex/design')
      const { homedir } = await import('node:os')
      const { join, dirname } = await import('node:path')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner)
      const adapter = createDesignAdapter({ config: config.design, runner })
      const outputDir = dirname(out)

      if (args.flags.in) {
        const result = await adapter.iterate({
          prompt,
          outputDir,
          inputPath: args.flags.in as string,
          outputPath: out,
          previewPath: args.flags.export as string,
        })
        console.log(
          result.success ? chalk.green('✓ Design updated') : chalk.red(`✗ ${result.error}`),
        )
        if (!result.success) process.exit(1)
      } else {
        const result = await adapter.create({
          prompt,
          outputDir,
          outputPath: out,
          previewPath: args.flags.export as string,
        })
        console.log(
          result.success ? chalk.green('✓ Design created') : chalk.red(`✗ ${result.error}`),
        )
        if (!result.success) process.exit(1)
      }
      break
    }

    case 'spec': {
      const { extractSpec, translateSpec } = await import('@appifex/spec')
      const { readFileSync, writeFileSync } = await import('node:fs')

      if (args.subcommand === 'extract') {
        const input = args.positional[0]
        const out = args.flags.out as string
        if (!input || !out) {
          console.error(chalk.red('Usage: dtc spec extract <file> --out <path>'))
          process.exit(1)
        }
        const spec = extractSpec(readFileSync(input, 'utf-8'))
        writeFileSync(out, JSON.stringify(spec, null, 2))
        console.log(chalk.green(`✓ Spec extracted: ${spec.screens.length} screens`))
      } else if (args.subcommand === 'translate') {
        const input = args.positional[0]
        const platform = args.flags.platform as string
        const out = args.flags.out as string
        if (!input || !platform || !out) {
          console.error(chalk.red('Usage: dtc spec translate <file> --platform <p> --out <path>'))
          process.exit(1)
        }
        const spec = JSON.parse(readFileSync(input, 'utf-8'))
        const translated = translateSpec(spec, platform as Platform)
        writeFileSync(out, JSON.stringify(translated, null, 2))
        console.log(
          chalk.green(`✓ Spec translated for ${platform}: ${translated.screens.length} screens`),
        )
      } else {
        console.error(
          chalk.red(
            `Unknown subcommand: dtc spec ${args.subcommand ?? ''}\nUsage: dtc spec extract|translate`,
          ),
        )
        process.exit(1)
      }
      break
    }

    case 'test-gen': {
      const { generateUITests, generateUnitTests } = await import('@appifex/test-gen')
      const { extractSpec } = await import('@appifex/spec')
      const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
      const { join } = await import('node:path')

      if (args.subcommand === 'ui') {
        const input = args.positional[0]
        const out = args.flags.out as string
        if (!input || !out) {
          console.error(chalk.red('Usage: dtc test-gen ui <spec> --out <dir>'))
          process.exit(1)
        }
        const spec = JSON.parse(readFileSync(input, 'utf-8'))
        const flows = generateUITests(spec)
        mkdirSync(out, { recursive: true })
        for (const flow of flows) {
          writeFileSync(join(out, flow.fileName), flow.content)
        }
        console.log(chalk.green(`✓ ${flows.length} Maestro flows generated`))
      } else if (args.subcommand === 'unit') {
        const input = args.positional[0]
        const platform = args.flags.platform as string
        const out = args.flags.out as string
        if (!input || !platform || !out) {
          console.error(
            chalk.red('Usage: dtc test-gen unit <requirements> --platform <p> --out <dir>'),
          )
          process.exit(1)
        }
        const requirements = readFileSync(input, 'utf-8').split('\n').filter(Boolean)
        const files = generateUnitTests(requirements, platform as Platform)
        mkdirSync(out, { recursive: true })
        for (const file of files) {
          writeFileSync(join(out, file.fileName), file.content)
        }
        const total = files.reduce((s, f) => s + f.testCount, 0)
        console.log(chalk.green(`✓ ${files.length} test files, ${total} tests generated`))
      } else {
        console.error(
          chalk.red(
            `Unknown subcommand: dtc test-gen ${args.subcommand ?? ''}\nUsage: dtc test-gen ui|unit`,
          ),
        )
        process.exit(1)
      }
      break
    }

    case 'build': {
      const platform = args.flags.platform as string
      const project = args.flags.project as string
      if (!platform || !project) {
        console.error(chalk.red('Usage: dtc build --platform <p> --project <dir>'))
        process.exit(1)
      }
      validatePlatform(platform)
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig } = await import('@appifex/core')
      const { buildSwift, buildKotlin } = await import('@appifex/build')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner, { cwd: project })
      const result =
        platform === 'kotlin-compose'
          ? await buildKotlin(runner, { projectDir: project })
          : await buildSwift(runner, {
              projectDir: project,
              scheme: (args.flags.scheme as string) ?? 'App',
            })
      console.log(
        result.success
          ? chalk.green(`✓ Build succeeded (${(result.duration / 1000).toFixed(1)}s)`)
          : chalk.red(`✗ ${result.error}`),
      )
      process.exit(result.success ? 0 : 1)
      break
    }

    case 'validate': {
      const platform = args.flags.platform as string
      const project = args.flags.project as string
      if (!platform || !project) {
        console.error(chalk.red('Usage: dtc validate --all --platform <p> --project <dir>'))
        process.exit(1)
      }
      validatePlatform(platform)
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig } = await import('@appifex/core')
      const { validateAll } = await import('@appifex/validate')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner, { cwd: project })
      const result = await validateAll(runner, {
        platform: platform as Platform,
        projectDir: project,
        flowDir: (args.flags.flows as string) ?? join(project, '.maestro'),
        testDir: (args.flags.tests as string) ?? join(project, '__tests__'),
        reportDir: join(project, '.dtc-report'),
      })
      console.log(
        `UI:   ${result.ui.passed}/${result.ui.total}  ${result.ui.failed === 0 ? chalk.green('✓') : chalk.red(`✗ ${result.ui.failed} failing`)}`,
      )
      console.log(
        `Unit: ${result.unit.passed}/${result.unit.total}  ${result.unit.failed === 0 ? chalk.green('✓') : chalk.red(`✗ ${result.unit.failed} failing`)}`,
      )
      console.log(
        result.allPassed
          ? chalk.green('\n✅ ALL TESTS PASSING')
          : chalk.red('\n⛔ SOME TESTS FAILING'),
      )
      process.exit(result.allPassed ? 0 : 1)
      break
    }

    case 'security': {
      const project = args.flags.project as string
      const platform = args.flags.platform as string | undefined
      if (!project) {
        console.error(
          chalk.red('Usage: dtc security --project <dir> [--platform <p>] [--config <rule>]'),
        )
        process.exit(1)
      }
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig } = await import('@appifex/core')
      const { runSemgrep } = await import('@appifex/validate')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner, { cwd: project })

      console.log(chalk.dim('🔍 Running Semgrep security scan...'))
      const result = await runSemgrep(runner, {
        projectDir: project,
        platform: platform as Platform | undefined,
        configArg: args.flags.config as string | undefined,
      })

      if (result.error) {
        console.error(chalk.red(`Error: ${result.error}`))
        process.exit(1)
      }

      if (result.findings.length === 0) {
        console.log(chalk.green('✅ No security findings — code is clean'))
        process.exit(0)
      }

      console.log(chalk.yellow(`\n⚠  ${result.findings.length} finding(s):\n`))
      for (const f of result.findings) {
        const sev =
          f.severity === 'ERROR'
            ? chalk.red(f.severity)
            : f.severity === 'WARNING'
              ? chalk.yellow(f.severity)
              : chalk.dim(f.severity)
        console.log(`  ${sev}  ${chalk.cyan(f.file)}:${f.line}`)
        console.log(`  ${chalk.dim(f.ruleId)}`)
        console.log(`  ${f.message}\n`)
      }
      console.log(chalk.red(`⛔ ${result.findings.length} security issue(s) found`))
      process.exit(1)
      break
    }

    case 'codegen': {
      const spec = args.flags.spec as string
      const platform = args.flags.platform as string
      const out = args.flags.out as string
      if (!spec || !platform || !out) {
        console.error(chalk.red('Usage: dtc codegen --spec <file> --platform <p> --out <dir>'))
        process.exit(1)
      }
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig } = await import('@appifex/core')
      const { ClaudeAdapter, createDefaultGenerateFn } = await import('@appifex/codegen')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')
      const { readFileSync } = await import('node:fs')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner, { cwd: out })
      const generateFn = createDefaultGenerateFn({
        apiKey: config.llm.apiKey ?? '',
        model: config.llm.model,
      })
      const codegen = new ClaudeAdapter({ generateFn })
      const platformSpec = JSON.parse(readFileSync(spec, 'utf-8'))
      const result = await codegen.generateAndWrite(
        {
          spec: platformSpec,
          uiTestPaths: (args.flags.tests as string)?.split(',') ?? [],
          unitTestPaths: (args.flags['unit-tests'] as string)?.split(',') ?? [],
          outputDir: out,
        },
        runner,
      )
      console.log(
        result.success
          ? chalk.green(`✓ ${result.files.length} files generated`)
          : chalk.red(`✗ ${result.error}`),
      )
      if (!result.success) process.exit(1)
      break
    }

    case 'fix': {
      const specPath = args.flags.spec as string
      const project = args.flags.project as string
      const platform = args.flags.platform as string
      if (!specPath || !project || !platform) {
        console.error(chalk.red('Usage: dtc fix --spec <file> --project <dir> --platform <p>'))
        process.exit(1)
      }
      validatePlatform(platform)
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig, createFileSkillProvider, createBundledSkillProvider } =
        await import('@appifex/core')
      const { fixLoop, createDefaultFixFn, createClaudeCliFixFn, createCodexCliFixFn } =
        await import('@appifex/fix')
      const { validateAll } = await import('@appifex/validate')
      const { buildSwift, buildKotlin } = await import('@appifex/build')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner, { cwd: project })
      const skillProvider = config.skillsDir
        ? createFileSkillProvider(config.skillsDir)
        : createBundledSkillProvider()
      const skills = await skillProvider.load(platform as Platform)
      const fixFn =
        config.llm.provider === 'claude-cli'
          ? createClaudeCliFixFn({
              runner,
              projectDir: project,
              model: config.llm.model,
              platform: platform as Platform,
            })
          : config.llm.provider === 'codex-cli'
            ? createCodexCliFixFn({
                runner,
                projectDir: project,
                model: config.llm.model,
                platform: platform as Platform,
              })
            : createDefaultFixFn({
                apiKey: config.llm.apiKey ?? '',
                runner,
                projectDir: project,
                model: config.llm.model,
                skillPrompt: skills.fixPrompt,
              })
      const buildFn = async () =>
        platform === 'kotlin-compose'
          ? buildKotlin(runner, { projectDir: project })
          : buildSwift(runner, { projectDir: project, scheme: 'App' })
      const validateFn = async () =>
        validateAll(runner, {
          platform: platform as Platform,
          projectDir: project,
          flowDir: (args.flags.flows as string) ?? join(project, '.maestro'),
          testDir: (args.flags['unit-tests'] as string) ?? join(project, '__tests__'),
          reportDir: join(project, '.dtc-report'),
        })

      // Get initial validation to feed into fix loop
      const initialValidation = await validateFn()
      if (initialValidation.allPassed) {
        console.log(chalk.green('✅ All tests already passing — nothing to fix'))
        break
      }
      console.log(
        chalk.yellow(
          `${initialValidation.ui.failed + initialValidation.unit.failed} failing tests — starting fix loop`,
        ),
      )
      const result = await fixLoop(initialValidation, {
        fixFn,
        buildFn,
        validateFn,
        maxAttempts: 5,
        tokenBudget: 200_000,
      })
      console.log(
        result.status === 'all_green'
          ? chalk.green(`✅ ALL GREEN — ${result.attempts.length} attempt(s)`)
          : chalk.red(`⛔ ${result.status} after ${result.attempts.length} attempt(s)`),
      )
      process.exit(result.status === 'all_green' ? 0 : 1)
      break
    }

    case 'provision': {
      if (args.subcommand === 'submit') {
        const { createRunner } = await import('@appifex/runner')
        const { loadConfig, ProgressEmitter } = await import('@appifex/core')
        // Phase 5 Plan 06 (TF-01 D-03): AscClient removed — use runTestFlightUploadPhase
        // + runXcodeArchivePhase orchestrators instead of the deleted subprocess shell-out.
        const { PlayConsoleClient, runTestFlightUploadPhase } = await import('@appifex/provision')
        const { bundleKotlin, runXcodeArchivePhase } = await import('@appifex/build')
        const { homedir } = await import('node:os')
        const { join } = await import('node:path')
        const { existsSync } = await import('node:fs')

        const config = await loadConfig(join(homedir(), '.dtc'))
        const project = args.flags.project as string | undefined
        const ipaFlag = args.flags.ipa as string | undefined
        const aabFlag = args.flags.aab as string | undefined

        // Auto-detect platform from project or pre-built artifact
        let detectedPlatform: 'ios' | 'android'
        if (aabFlag) {
          detectedPlatform = 'android'
        } else if (ipaFlag) {
          detectedPlatform = 'ios'
        } else if (project) {
          const hasAndroid = [
            `${project}/app/build.gradle.kts`,
            `${project}/app/build.gradle`,
            `${project}/build.gradle.kts`,
            `${project}/build.gradle`,
            `${project}/android/app/build.gradle.kts`,
            `${project}/android/app/build.gradle`,
          ].some((p) => existsSync(p))
          detectedPlatform = hasAndroid ? 'android' : 'ios'
        } else {
          console.error(
            chalk.red(
              'Usage: dtc provision submit --project <dir> [--scheme <name>]\n       dtc provision submit --ipa <path>\n       dtc provision submit --aab <path>',
            ),
          )
          process.exit(1)
        }

        if (detectedPlatform === 'android') {
          // ── Android: Build AAB + Submit to Play Console ──
          if (!config.android) {
            console.error(chalk.red('Google Play Console not configured. Run `dtc setup` first.'))
            process.exit(1)
          }
          if (!config.android.serviceAccountKeyPath || !config.android.packageName) {
            console.error(
              chalk.red('Google Play Console credentials incomplete. Run `dtc setup` first.'),
            )
            process.exit(1)
          }

          let aabPath = aabFlag
          if (!aabPath) {
            if (!project) {
              console.error(
                chalk.red(
                  'Usage: dtc provision submit --project <dir>\n       dtc provision submit --aab <path>',
                ),
              )
              process.exit(1)
            }
            if (!config.android.keystorePath) {
              console.error(chalk.red('Release keystore not configured. Run `dtc setup` first.'))
              process.exit(1)
            }
            const runner = createRunner(config.runner, { cwd: project })
            console.log(chalk.dim('📦 Building release AAB...'))
            const bundleResult = await bundleKotlin(runner, {
              projectDir: project,
              applicationId: config.android.packageName,
              keystorePath: config.android.keystorePath!,
              keystorePassword: config.android.keystorePassword ?? '',
              keyAlias: config.android.keyAlias ?? 'release',
              keyPassword: config.android.keyPassword ?? '',
            })
            if (!bundleResult.success) {
              console.error(chalk.red(`✗ AAB build failed: ${bundleResult.error}`))
              process.exit(1)
            }
            aabPath = bundleResult.aabPath!
            console.log(
              chalk.green(
                `✓ AAB built: ${aabPath} (${(bundleResult.duration / 1000).toFixed(1)}s)`,
              ),
            )
          }

          const playClient = new PlayConsoleClient({
            serviceAccountKeyPath: config.android.serviceAccountKeyPath,
          })
          const track = config.android.playTrack ?? 'internal'
          console.log(chalk.dim(`🚀 Submitting to Play Console (${track} track)...`))
          const result = await playClient.submitToTrack({
            packageName: config.android.packageName,
            aabPath,
            track,
          })
          console.log(
            result.success
              ? chalk.green(`✓ Submitted to Play Console: ${result.output}`)
              : chalk.red(`✗ ${result.error}`),
          )
          if (!result.success) process.exit(1)
        } else {
          // ── iOS: Archive + Submit to TestFlight ──
          // Phase 5 Plan 06 (TF-01 D-03): route through runXcodeArchivePhase +
          // runTestFlightUploadPhase orchestrators (ASC REST + altool).
          if (!config.apple) {
            console.error(chalk.red('Apple TestFlight not configured. Run `dtc setup` first.'))
            process.exit(1)
          }
          if (!config.apple.ascKeyId || !config.apple.ascIssuerId || !config.apple.ascKeyPath) {
            console.error(
              chalk.red('Apple TestFlight credentials incomplete. Run `dtc setup` first.'),
            )
            process.exit(1)
          }
          if (!config.apple.ascAppId) {
            console.error(
              chalk.red('App Store Connect App ID not configured. Run `dtc setup` to add it.'),
            )
            process.exit(1)
          }

          // Fresh-upload path: let runXcodeArchivePhase compute version+buildNumber +
          // guard D-16 idempotent skip; runTestFlightUploadPhase handles altool + D-17.
          if (!ipaFlag) {
            if (!project) {
              console.error(
                chalk.red(
                  'Usage: dtc provision submit --project <dir> [--scheme <name>]\n       dtc provision submit --ipa <path>',
                ),
              )
              process.exit(1)
            }
            const runner = createRunner(config.runner, { cwd: project })
            const emitter = new ProgressEmitter()
            console.log(chalk.dim('📦 Archiving project for distribution...'))
            const archive = await runXcodeArchivePhase({
              runner,
              config,
              projectDir: project,
              scheme: (args.flags.scheme as string | undefined) ?? 'App',
            })
            if (archive.skipped) {
              console.log(chalk.green(`✓ Archive skipped: ${archive.reason}`))
              // D-16: the build is already VALID in ASC; nothing else to do.
              break
            }
            if (!archive.ipaPath) {
              console.error(chalk.red('✗ Archive reported success but produced no .ipa path'))
              process.exit(1)
            }
            console.log(
              chalk.green(`✓ Archive succeeded: ${archive.ipaPath} (build ${archive.buildNumber})`),
            )
            console.log(chalk.dim('🚀 Submitting to TestFlight...'))
            const result = await runTestFlightUploadPhase({
              runner,
              config,
              emitter,
              ipaPath: archive.ipaPath,
              buildNumber: archive.buildNumber,
              marketingVersion: archive.marketingVersion,
            })
            if (result.status === 'completed_with_warnings') {
              console.log(chalk.yellow(`✓ Uploaded with warnings:`))
              for (const w of result.warnings) console.log(chalk.yellow(`  - ${w}`))
            } else {
              console.log(
                chalk.green(
                  `✓ Submitted to TestFlight (build ${result.buildId}, ${result.testersAdded.length} tester(s) assigned)`,
                ),
              )
            }
          } else {
            // Pre-built --ipa path: user supplied IPA directly; no archive phase.
            // Version metadata must come from flags since we cannot read it from the IPA here.
            const runner = createRunner(config.runner)
            const emitter = new ProgressEmitter()
            const buildNumber =
              (args.flags['build-number'] as string | undefined) ??
              (args.flags.buildNumber as string | undefined) ??
              '1'
            const marketingVersion =
              (args.flags['marketing-version'] as string | undefined) ??
              (args.flags.marketingVersion as string | undefined) ??
              '1.0.0'
            console.log(chalk.dim('🚀 Submitting to TestFlight...'))
            const result = await runTestFlightUploadPhase({
              runner,
              config,
              emitter,
              ipaPath: ipaFlag,
              buildNumber,
              marketingVersion,
            })
            if (result.status === 'completed_with_warnings') {
              console.log(chalk.yellow(`✓ Uploaded with warnings:`))
              for (const w of result.warnings) console.log(chalk.yellow(`  - ${w}`))
            } else {
              console.log(
                chalk.green(
                  `✓ Submitted to TestFlight (build ${result.buildId}, ${result.testersAdded.length} tester(s) assigned)`,
                ),
              )
            }
          }
        }
      } else {
        console.error(
          chalk.red(
            'Usage: dtc provision submit --project <dir> [--scheme <name>]\n       dtc provision submit --ipa <path>\n       dtc provision submit --aab <path>',
          ),
        )
        process.exit(1)
      }
      break
    }

    case 'deliver': {
      const project = args.flags.project as string
      if (!project) {
        console.error(
          chalk.red(
            'Usage: dtc deliver --project <dir> [--remote-url <url>] [--branch <name>] [--auto-merge] [--skip-pr] [--skip-push]',
          ),
        )
        process.exit(1)
      }
      const { createRunner } = await import('@appifex/runner')
      const { loadConfig } = await import('@appifex/core')
      const { deliver } = await import('@appifex/deliver')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')

      const config = await loadConfig(join(homedir(), '.dtc'))
      const runner = createRunner(config.runner, { cwd: project })
      const deliverConfig = config.deliver ?? {}
      const autoMerge =
        'auto-merge' in args.flags ? args.flags['auto-merge'] === true : !!deliverConfig.autoMerge
      const result = await deliver(runner, {
        projectDir: project,
        branch: args.flags.branch as string | undefined,
        baseBranch: (args.flags.base as string) ?? deliverConfig.baseBranch,
        remoteUrl: (args.flags['remote-url'] as string) ?? deliverConfig.remoteUrl,
        repo: deliverConfig.repo,
        skipPr: 'skip-pr' in args.flags ? args.flags['skip-pr'] === true : !!deliverConfig.skipPr,
        skipPush:
          'skip-push' in args.flags ? args.flags['skip-push'] === true : !!deliverConfig.skipPush,
        git: { userName: deliverConfig.userName, userEmail: deliverConfig.userEmail },
        summary: args.flags.message as string | undefined,
        autoMerge,
        mergeMethod: deliverConfig.mergeMethod,
        deleteBranchOnMerge: deliverConfig.deleteBranchOnMerge,
        // Only set allTestsGreen if user explicitly confirms via --tests-green
        allTestsGreen: args.flags['tests-green'] === true,
      })
      if (result.repoCreated && result.remoteUrl) {
        console.log(chalk.green(`✓ Created repo: ${result.remoteUrl}`))
        // Save URL to config so subsequent runs reuse it
        const { saveConfig } = await import('@appifex/core')
        config.deliver = { ...deliverConfig, remoteUrl: result.remoteUrl }
        await saveConfig(join(homedir(), '.dtc'), config)
      }
      if (result.pr?.merged) {
        console.log(
          chalk.green(
            `✓ Committed ${result.commitHash.slice(0, 7)} → PR #${result.pr.number} auto-merged (${result.pr.mergeMethod})`,
          ),
        )
      } else if (result.pr) {
        console.log(
          chalk.green(
            `✓ Committed ${result.commitHash.slice(0, 7)} → PR #${result.pr.number}: ${result.pr.url}`,
          ),
        )
      } else if (result.pushed) {
        console.log(
          chalk.green(`✓ Committed ${result.commitHash.slice(0, 7)} → pushed to ${result.branch}`),
        )
      } else {
        console.log(chalk.green(`✓ Committed ${result.commitHash.slice(0, 7)} (local only)`))
      }
      break
    }

    case 'report': {
      const format = (args.flags.format as string) ?? 'markdown'
      const out = args.flags.out as string
      console.log(chalk.dim(`Report format: ${format}, output: ${out ?? 'stdout'}`))
      break
    }

    default:
      console.error(chalk.red(`Unknown command: ${args.command}`))
      printHelp()
      process.exit(1)
  }
}

// Phase 02 Plan 01 (FOUND-04): top-level catch translates CliError → exit code
main().catch(handleCliError)
