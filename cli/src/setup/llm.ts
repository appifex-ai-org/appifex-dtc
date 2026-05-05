// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import chalk from 'chalk'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'
import { startDeviceFlow, pollForToken } from '../providers/copilot.js'

const DTC_GITHUB_CLIENT_ID = process.env.DTC_GITHUB_CLIENT_ID ?? 'Iv1.dtc_placeholder'

const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string; hint?: string }>> = {
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
  'codex-cli': [
    { value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex', hint: 'recommended' },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', hint: 'faster' },
  ],
}

export async function runLlmSection(configDir: string, existingConfig: DtcConfig): Promise<void> {
  const provider = await p.select({
    message: 'LLM provider',
    options: [
      {
        value: 'claude-cli',
        label: 'Claude Code (local CLI)',
        hint: 'uses your local `claude` — no API key needed',
      },
      {
        value: 'codex-cli',
        label: 'Codex CLI (local auth)',
        hint: 'uses your local `codex` - no API key stored',
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
  assertNotCancelled(provider)

  let apiKey = existingConfig.llm?.apiKey ?? ''
  let githubToken = existingConfig.llm?.githubToken ?? ''

  if (provider === 'copilot') {
    if (DTC_GITHUB_CLIENT_ID === 'Iv1.dtc_placeholder') {
      throw new Error(
        'Copilot auth requires a real GitHub App client ID. Set DTC_GITHUB_CLIENT_ID env var.',
      )
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
      throw new Error(String(err instanceof Error ? err.message : err))
    }
  } else if (provider === 'claude-cli') {
    p.log.info('Using local Claude Code CLI — make sure `claude` is installed and authenticated.')
    apiKey = ''
  } else if (provider === 'codex-cli') {
    p.log.info(
      'Using local Codex CLI - make sure `codex` is installed and authenticated with `codex --login` or OPENAI_API_KEY.',
    )
    apiKey = ''
  } else {
    const keyInput = await p.password({
      message: 'API key',
      validate: (v) => (v.length === 0 ? 'API key is required' : undefined),
    })
    assertNotCancelled(keyInput)
    apiKey = keyInput as string
  }

  const modelChoice = await p.select({
    message: 'Model',
    options: MODEL_OPTIONS[provider as string] ?? [{ value: 'default', label: 'Default' }],
  })
  assertNotCancelled(modelChoice)
  const model = modelChoice as string

  const llm: DtcConfig['llm'] = {
    provider: provider as DtcConfig['llm']['provider'],
    apiKey,
    model,
  }
  if (githubToken) {
    llm.githubToken = githubToken
  }

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, { ...cfg, llm })
}
