import * as p from '@clack/prompts'
import chalk from 'chalk'
import { runSetup, type SetupAnswers } from './setup.js'
import { loadConfig } from '@appifex/core'
import { startDeviceFlow, pollForToken } from './providers/copilot.js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { generateSkipTemplate } from '@appifex/baas'

const DEFAULT_CONFIG_DIR = join(homedir(), '.dtc')
const DTC_GITHUB_CLIENT_ID = process.env.DTC_GITHUB_CLIENT_ID ?? 'Iv1.dtc_placeholder'

export async function setupWizard(configDir?: string): Promise<void> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR

  p.intro(chalk.bold('dtc setup'))

  const provider = await p.select({
    message: 'LLM provider',
    options: [
      {
        value: 'claude-cli',
        label: 'Claude Code (local CLI)',
        hint: 'uses your local `claude` — no API key needed',
      },
      { value: 'anthropic', label: 'Anthropic (Claude API)', hint: 'API key' },
      { value: 'openai', label: 'OpenAI (GPT)', hint: 'API key' },
      {
        value: 'copilot',
        label: 'GitHub Copilot',
        hint: 'sign in with GitHub — uses your Copilot subscription',
      },
      { value: 'google', label: 'Google (Gemini)', hint: 'API key' },
    ],
  })
  if (p.isCancel(provider)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let apiKey = ''
  let githubToken = ''

  if (provider === 'copilot') {
    if (DTC_GITHUB_CLIENT_ID === 'Iv1.dtc_placeholder') {
      // Phase 03 (DX-03): point users to the setup doc.
      p.cancel(
        'Copilot auth requires a real GitHub App client ID. Set DTC_GITHUB_CLIENT_ID env var — see docs/copilot-auth.md for step-by-step setup.',
      )
      process.exit(1)
    }
    const s = p.spinner()
    s.start('Starting GitHub device flow')

    try {
      const flow = await startDeviceFlow(DTC_GITHUB_CLIENT_ID)
      s.stop('Device code ready')

      p.note(
        `Code: ${chalk.bold(flow.userCode)}\nURL:  ${chalk.underline(flow.verificationUri)}`,
        'Open this URL and enter the code',
      )

      const confirmOpen = await p.confirm({ message: 'Open browser?', initialValue: true })
      if (confirmOpen && !p.isCancel(confirmOpen)) {
        const { exec } = await import('node:child_process')
        exec(`open "${flow.verificationUri}"`)
      }

      const s2 = p.spinner()
      s2.start('Waiting for authorization')
      githubToken = await pollForToken(DTC_GITHUB_CLIENT_ID, flow.deviceCode, flow.interval)
      s2.stop(chalk.green('Authenticated with GitHub'))
    } catch (err) {
      s.stop(chalk.red('GitHub auth failed'))
      p.cancel(String(err instanceof Error ? err.message : err))
      process.exit(1)
    }
  } else if (provider === 'claude-cli') {
    // No API key needed — claude CLI handles auth
    p.log.info('Using local Claude Code CLI — make sure `claude` is installed and authenticated.')
  } else {
    const keyInput = await p.password({
      message: 'API key',
      validate: (v) => (v.length === 0 ? 'API key is required' : undefined),
    })
    if (p.isCancel(keyInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    apiKey = keyInput
  }

  // Model selection based on provider
  const modelOptions: Record<string, Array<{ value: string; label: string; hint?: string }>> = {
    anthropic: [
      {
        value: 'claude-sonnet-4-20250514',
        label: 'Claude Sonnet 4',
        hint: 'recommended — fast + capable',
      },
      { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', hint: 'most capable, slower' },
      { value: 'claude-haiku-4-20250514', label: 'Claude Haiku 4', hint: 'fastest, cheapest' },
    ],
    openai: [
      { value: 'gpt-4.1', label: 'GPT-4.1', hint: 'recommended' },
      { value: 'gpt-5', label: 'GPT-5', hint: 'most capable' },
      { value: 'o3-mini', label: 'o3-mini', hint: 'reasoning model' },
    ],
    google: [
      {
        value: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        hint: 'best for code — reasoning-first',
      },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', hint: 'fast + capable' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'stable, proven' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'cheapest' },
    ],
    copilot: [
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', hint: 'recommended' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', hint: 'most capable' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    'claude-cli': [
      {
        value: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        hint: 'recommended — fast + capable',
      },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', hint: 'most capable' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'fastest' },
    ],
  }

  const modelChoice = await p.select({
    message: 'Model',
    options: modelOptions[provider as string] ?? [{ value: 'default', label: 'Default' }],
  })
  if (p.isCancel(modelChoice)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }
  const model = modelChoice as string

  const llm = { provider, apiKey, model }
  if (githubToken) {
    ;(llm as Record<string, string>).githubToken = githubToken
  }

  const design = await p.select({
    message: 'Design tool',
    options: [
      { value: 'pencil', label: 'Pencil', hint: 'AI-native design (requires Pencil desktop app)' },
      {
        value: 'stitch',
        label: 'Google Stitch',
        hint: 'Google AI design (requires API key from stitch.withgoogle.com)',
      },
      {
        value: 'figma-make',
        label: 'Figma Make',
        hint: 'Figma AI design (requires Figma Personal Access Token)',
      },
    ],
  })
  if (p.isCancel(design)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let designApiKey: string | undefined
  let figmaToken: string | undefined
  let figmaFileUrl: string | undefined
  if (design === 'stitch') {
    const keyInput = await p.password({
      message: 'Stitch API key (from stitch.withgoogle.com)',
      validate: (v) => (v.length === 0 ? 'API key is required for Stitch' : undefined),
    })
    if (p.isCancel(keyInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    designApiKey = keyInput
  } else if (design === 'figma-make') {
    const tokenInput = await p.password({
      message: 'Figma Personal Access Token (from figma.com/developers)',
      validate: (v) => (v.length === 0 ? 'Token is required for Figma Make' : undefined),
    })
    if (p.isCancel(tokenInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    figmaToken = tokenInput
    const urlInput = await p.text({
      message: 'Figma file URL (e.g. https://www.figma.com/design/ABC123/MyApp)',
      placeholder: 'https://www.figma.com/design/...',
      validate: (v) => {
        if (v.length === 0) return undefined // optional — can be provided later via --design
        if (!v.match(/figma\.com\/(?:design|file)\//)) return 'Must be a Figma design or file URL'
        return undefined
      },
    })
    if (p.isCancel(urlInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    if (urlInput) figmaFileUrl = urlInput
  }

  const runnerType = await p.select({
    message: 'Runner environment',
    options: [
      { value: 'local', label: 'Local', hint: 'run on this machine' },
      { value: 'e2b', label: 'E2B', hint: 'cloud sandbox' },
      { value: 'remote', label: 'Remote Mac Runner', hint: 'for Xcode builds' },
    ],
  })
  if (p.isCancel(runnerType)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let sandboxId: string | undefined
  let runnerUrl: string | undefined
  let runnerToken: string | undefined

  if (runnerType === 'e2b') {
    const e2b = await p.group({
      sandboxId: () =>
        p.text({
          message: 'E2B sandbox ID',
          validate: (v) => (v.length === 0 ? 'Required' : undefined),
        }),
    })
    sandboxId = e2b.sandboxId
  } else if (runnerType === 'remote') {
    const remote = await p.group({
      url: () => p.text({ message: 'Runner URL', placeholder: 'https://mac-runner.local:8443' }),
      token: () => p.password({ message: 'Runner token' }),
    })
    runnerUrl = remote.url
    runnerToken = remote.token
  }

  const agentType = await p.select({
    message: 'Agent CLI for code generation',
    options: [
      {
        value: 'auto',
        label: 'Auto-detect (recommended)',
        hint: 'uses first available: Claude > Codex > Gemini',
      },
      { value: 'claude', label: 'Claude Code', hint: 'claude CLI' },
      { value: 'codex', label: 'OpenAI Codex', hint: 'codex CLI' },
      { value: 'gemini', label: 'Gemini CLI', hint: 'gemini CLI' },
      { value: 'api', label: 'API only (no agent)', hint: 'uses current multi-call pipeline' },
    ],
  })
  if (p.isCancel(agentType)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  const wantApple = await p.confirm({
    message: 'Configure Apple TestFlight?',
    initialValue: false,
  })
  if (p.isCancel(wantApple)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let appleTeamId: string | undefined
  let appleBundleId: string | undefined
  let ascAppId: string | undefined
  let ascKeyId: string | undefined
  let ascIssuerId: string | undefined
  let ascKeyPath: string | undefined
  let ascTestFlightGroup: string | undefined

  if (wantApple) {
    const apple = await p.group({
      teamId: () => p.text({ message: 'Apple Team ID' }),
      bundleId: () => p.text({ message: 'Bundle ID', placeholder: 'com.example.app' }),
      appId: () =>
        p.text({ message: 'App Store Connect App ID (numeric)', placeholder: '123456789' }),
      keyId: () => p.text({ message: 'App Store Connect Key ID' }),
      issuerId: () => p.text({ message: 'App Store Connect Issuer ID' }),
      keyPath: () =>
        p.text({ message: 'Auth key path (.p8)', placeholder: '~/.appstoreconnect/AuthKey.p8' }),
      testFlightGroup: () =>
        p.text({ message: 'TestFlight beta group name', placeholder: 'Internal Testers' }),
    })
    appleTeamId = apple.teamId
    appleBundleId = apple.bundleId
    ascAppId = apple.appId
    ascKeyId = apple.keyId
    ascIssuerId = apple.issuerId
    ascKeyPath = apple.keyPath
    ascTestFlightGroup = apple.testFlightGroup
  }

  const wantAndroid = await p.confirm({
    message: 'Configure Google Play Console?',
    initialValue: false,
  })
  if (p.isCancel(wantAndroid)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let androidServiceAccountKeyPath: string | undefined
  let androidPackageName: string | undefined
  let androidKeystorePath: string | undefined
  let androidKeystorePassword: string | undefined
  let androidKeyAlias: string | undefined
  let androidKeyPassword: string | undefined
  let androidPlayTrack: string | undefined

  if (wantAndroid) {
    const android = await p.group({
      serviceAccountKeyPath: () =>
        p.text({
          message: 'Service account JSON key path',
          placeholder: '~/.config/gcloud/play-console-key.json',
        }),
      packageName: () =>
        p.text({ message: 'Package name (application ID)', placeholder: 'com.example.app' }),
      keystorePath: () =>
        p.text({
          message: 'Release keystore path (.jks)',
          placeholder: '~/.android/release.keystore',
        }),
      keystorePassword: () => p.password({ message: 'Keystore password' }),
      keyAlias: () => p.text({ message: 'Key alias', placeholder: 'release' }),
      keyPassword: () => p.password({ message: 'Key password' }),
      playTrack: () =>
        p.select({
          message: 'Play Console track',
          options: [
            {
              value: 'internal',
              label: 'Internal Testing',
              hint: 'recommended — up to 100 testers, no review',
            },
            { value: 'alpha', label: 'Closed Testing' },
            { value: 'beta', label: 'Open Testing' },
          ],
        }),
    })
    androidServiceAccountKeyPath = android.serviceAccountKeyPath
    androidPackageName = android.packageName
    androidKeystorePath = android.keystorePath
    androidKeystorePassword = android.keystorePassword
    androidKeyAlias = android.keyAlias
    androidKeyPassword = android.keyPassword
    androidPlayTrack = android.playTrack
  }

  // ── BaaS Provider ────────────────────────────────────────────────────────
  const wantBaas = await p.confirm({
    message: 'Configure BaaS provider? (Firebase or Supabase)',
    initialValue: false,
  })
  if (p.isCancel(wantBaas)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let baasProvider: 'firebase' | 'supabase' | undefined
  let baasSkipTemplate = false
  if (wantBaas) {
    const selected = await p.select({
      message: 'BaaS provider',
      options: [
        {
          value: 'firebase',
          label: 'Firebase',
          hint: 'drop GoogleService-Info.plist or google-services.json into project root',
        },
        {
          value: 'supabase',
          label: 'Supabase',
          hint: 'set SUPABASE_URL and SUPABASE_ANON_KEY in .env',
        },
        { value: 'skip', label: 'Skip for now', hint: 'creates a template file with instructions' },
      ],
    })
    if (p.isCancel(selected)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }

    if (selected === 'skip') {
      baasSkipTemplate = true
      // Write template file immediately during setup
      const template = generateSkipTemplate()
      const templatePath = join(dir, template.path)
      writeFileSync(templatePath, template.content, 'utf-8')
      p.log.info(`Created ${template.path} — edit it when ready, then re-run setup.`)
    } else {
      baasProvider = selected as 'firebase' | 'supabase'
    }
  }

  const wantSkills = await p.confirm({
    message: 'Custom skills directory? (codegen/fix prompts)',
    initialValue: false,
  })
  if (p.isCancel(wantSkills)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let skillsDir: string | undefined
  if (wantSkills) {
    const skillsInput = await p.text({
      message: 'Skills directory path',
      placeholder: './skills',
      validate: (v) => (v.length === 0 ? 'Path is required' : undefined),
    })
    if (p.isCancel(skillsInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    skillsDir = skillsInput
  }

  // Deliver (git + PR)
  const wantDeliver = await p.confirm({
    message: 'Configure git delivery? (commit, push, PR)',
    initialValue: false,
  })
  if (p.isCancel(wantDeliver)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }

  let deliverRemoteUrl: string | undefined
  let deliverBaseBranch: string | undefined
  let deliverAutoMerge: boolean | undefined
  let deliverMergeMethod: 'squash' | 'merge' | 'rebase' | undefined
  let deliverRepoVisibility: 'private' | 'public' | undefined
  let deliverUserName: string | undefined
  let deliverUserEmail: string | undefined

  if (wantDeliver) {
    const { execSync } = await import('node:child_process')

    const remoteUrlInput = await p.text({
      message: 'Remote repository URL (leave empty to auto-create on GitHub)',
      validate: (v) => {
        if (!v) return undefined // empty is valid — means auto-create
        if (!v.includes('github.com/'))
          return 'Must be a GitHub URL (e.g. https://github.com/owner/repo.git)'
        if (v.includes('owner/repo'))
          return 'Please enter your actual repository URL, not the example'
        return undefined
      },
    })
    if (p.isCancel(remoteUrlInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }

    if (remoteUrlInput) {
      deliverRemoteUrl = remoteUrlInput
    } else {
      // gh CLI only needed for auto-create — check now
      try {
        execSync('gh auth status', { stdio: 'ignore' })
        p.log.success('Authenticated via `gh` CLI')
      } catch {
        p.cancel(
          '`gh` CLI is required for auto-creating repos. Install it (https://cli.github.com) and run `gh auth login`, or provide a remote URL.',
        )
        process.exit(1)
      }
      // Repo visibility — for auto-create now and future runtime auto-creates
      const visibility = await p.select({
        message: 'Repo visibility',
        options: [
          { value: 'private', label: 'Private' },
          { value: 'public', label: 'Public' },
        ],
      })
      if (p.isCancel(visibility)) {
        p.cancel('Setup cancelled.')
        process.exit(0)
      }
      deliverRepoVisibility = visibility as 'private' | 'public'

      const repoName = await p.text({
        message: 'Repository name (leave empty to auto-create at runtime from prompt)',
      })
      if (p.isCancel(repoName)) {
        p.cancel('Setup cancelled.')
        process.exit(0)
      }

      if (repoName) {
        const s = p.spinner()
        s.start(`Creating GitHub repo: ${repoName} (${deliverRepoVisibility})`)
        try {
          const output = execSync(`gh repo create ${repoName} --${deliverRepoVisibility}`, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }).trim()
          deliverRemoteUrl =
            output ||
            `https://github.com/${execSync('gh api user -q .login', { encoding: 'utf-8' }).trim()}/${repoName}.git`
          s.stop(chalk.green(`Created: ${deliverRemoteUrl}`))
        } catch (err) {
          s.stop(chalk.red('Failed to create repo'))
          const msg =
            err instanceof Error
              ? ((err as { stderr?: string }).stderr ?? err.message)
              : String(err)
          p.cancel(`gh repo create failed: ${msg}`)
          process.exit(1)
        }
      } else {
        p.log.info('Repo will be auto-created at runtime from the prompt')
      }
    }

    const baseBranchInput = await p.text({
      message: 'Base branch for PRs',
      initialValue: 'main',
    })
    if (p.isCancel(baseBranchInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    deliverBaseBranch = baseBranchInput

    const autoMergeInput = await p.confirm({
      message: 'Auto-merge PRs when all tests pass?',
      initialValue: false,
    })
    if (p.isCancel(autoMergeInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    deliverAutoMerge = autoMergeInput

    if (deliverAutoMerge) {
      const methodInput = await p.select({
        message: 'Merge method',
        options: [
          { value: 'squash', label: 'Squash', hint: 'single commit on base branch (recommended)' },
          { value: 'merge', label: 'Merge commit', hint: 'preserves branch history' },
          { value: 'rebase', label: 'Rebase', hint: 'linear history' },
        ],
      })
      if (p.isCancel(methodInput)) {
        p.cancel('Setup cancelled.')
        process.exit(0)
      }
      deliverMergeMethod = methodInput as 'squash' | 'merge' | 'rebase'
    }

    const gitNameInput = await p.text({
      message: 'Git user name (for commits)',
      placeholder: 'dtc-bot',
    })
    if (p.isCancel(gitNameInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    deliverUserName = gitNameInput || undefined

    const gitEmailInput = await p.text({
      message: 'Git user email (for commits)',
      placeholder: 'dtc@example.com',
    })
    if (p.isCancel(gitEmailInput)) {
      p.cancel('Setup cancelled.')
      process.exit(0)
    }
    deliverUserEmail = gitEmailInput || undefined
  }

  const budgetInput = await p.text({
    message: 'Token budget (total)',
    initialValue: '100000',
    validate: (v) => (isNaN(Number(v)) ? 'Must be a number' : undefined),
  })
  if (p.isCancel(budgetInput)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }
  const tokenBudget = Number(budgetInput)

  const s = p.spinner()
  s.start('Saving configuration')

  const answers: SetupAnswers = {
    llmProvider: provider as SetupAnswers['llmProvider'],
    llmApiKey: apiKey,
    llmModel: model,
    githubToken: githubToken || undefined,
    designTool: design as SetupAnswers['designTool'],
    designApiKey,
    figmaToken,
    figmaFileUrl,
    runnerType: runnerType as SetupAnswers['runnerType'],
    sandboxId,
    runnerUrl,
    runnerToken,
    appleTeamId,
    appleBundleId,
    ascAppId,
    ascKeyId,
    ascIssuerId,
    ascKeyPath,
    ascTestFlightGroup,
    androidServiceAccountKeyPath,
    androidPackageName,
    androidKeystorePath,
    androidKeystorePassword,
    androidKeyAlias,
    androidKeyPassword,
    androidPlayTrack,
    agentType: agentType as SetupAnswers['agentType'],
    tokenBudget,
    skillsDir,
    baasProvider,
    baasSkipTemplate,
    deliverEnabled: wantDeliver === true,
    deliverRemoteUrl,
    deliverBaseBranch,
    deliverAutoMerge,
    deliverMergeMethod,
    deliverRepoVisibility,
    deliverUserName,
    deliverUserEmail,
  }

  await runSetup(dir, answers)

  s.stop('Configuration saved')

  p.note(
    [
      `${chalk.dim('Config:')} ${dir}/config.json`,
      `${chalk.dim('LLM:')} ${provider} / ${model}${githubToken ? ' (GitHub OAuth)' : ''}`,
      `${chalk.dim('Design:')} ${design}`,
      `${chalk.dim('Agent:')} ${agentType}`,
      `${chalk.dim('Runner:')} ${runnerType}`,
      wantApple ? `${chalk.dim('TestFlight:')} ${appleTeamId}` : '',
      wantAndroid ? `${chalk.dim('Play Console:')} ${androidPackageName}` : '',
      deliverRemoteUrl
        ? `${chalk.dim('Deliver:')} ${deliverRemoteUrl}${deliverAutoMerge ? ' (auto-merge: ' + (deliverMergeMethod ?? 'squash') + ')' : ''}`
        : '',
      skillsDir ? `${chalk.dim('Skills:')} ${skillsDir}` : '',
      `${chalk.dim('Budget:')} ${tokenBudget.toLocaleString()} tokens`,
    ]
      .filter(Boolean)
      .join('\n'),
    'Configuration summary',
  )

  // Check prerequisites for both platforms using shared module.
  // Platform choice happens at `dtc run` time, so we verify both upfront.
  const { checkPrerequisites } = await import('@appifex/core')
  const savedConfig = await loadConfig(dir)
  const swiftReport = checkPrerequisites('swiftui', savedConfig)
  const kotlinReport = checkPrerequisites('kotlin-compose', savedConfig)

  // Dedupe shared checks (LLM, design tool, Maestro, Semgrep, Agent CLI appear in both reports)
  type Missing = { check: (typeof swiftReport.checks)[number]; platforms: string[] }
  const missingByName = new Map<string, Missing>()
  const addMissing = (checks: typeof swiftReport.checks, platformLabel: string) => {
    for (const c of checks) {
      if (c.status !== 'fail') continue
      if (c.severity !== 'critical' && c.severity !== 'warning') continue
      const existing = missingByName.get(c.name)
      if (existing) {
        existing.platforms.push(platformLabel)
      } else {
        missingByName.set(c.name, { check: c, platforms: [platformLabel] })
      }
    }
  }
  addMissing(swiftReport.checks, 'swiftui')
  addMissing(kotlinReport.checks, 'kotlin-compose')

  const missing = [...missingByName.values()]
  const criticalMissing = missing.filter((m) => m.check.severity === 'critical')
  const optionalMissing = missing.filter((m) => m.check.severity === 'warning')

  const formatPlatformTag = (platforms: string[]) => {
    // Shared checks appear in both → omit tag; platform-specific → show tag
    if (platforms.length >= 2) return ''
    return chalk.dim(` [${platforms[0]}]`)
  }

  if (criticalMissing.length > 0) {
    p.log.warn(chalk.red('Critical tools not found:'))
    for (const m of criticalMissing) {
      p.log.message(
        `  ${chalk.red('✗')} ${m.check.name}${formatPlatformTag(m.platforms)} — ${m.check.installHint ?? m.check.message}`,
      )
    }
  }
  if (optionalMissing.length > 0) {
    p.log.warn(chalk.yellow('Optional tools not found (some features will be skipped):'))
    for (const m of optionalMissing) {
      p.log.message(
        `  ${chalk.dim('•')} ${m.check.name}${formatPlatformTag(m.platforms)} — ${m.check.installHint ?? m.check.message}`,
      )
    }
  }

  p.outro(
    chalk.green(
      'Ready! Run `dtc doctor` to verify all prerequisites, or `dtc design --prompt "..."` to start.\n\n',
    ) +
      chalk.dim('MCP: The DTC and Pencil MCP servers are configured in .mcp.json.\n') +
      chalk.dim('Run `pnpm build` in packages/appifex-dtc/ to enable it in Claude Code.'),
  )
}
