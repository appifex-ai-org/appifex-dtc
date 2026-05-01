// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'

export async function runRunnerSection(
  configDir: string,
  existingConfig: DtcConfig,
): Promise<void> {
  const runnerType = await p.select({
    message: 'Runner environment',
    options: [
      { value: 'local', label: 'Local', hint: 'run on this machine' },
      { value: 'e2b', label: 'E2B', hint: 'cloud sandbox' },
      { value: 'remote', label: 'Remote Mac Runner', hint: 'for Xcode builds' },
    ],
  })
  assertNotCancelled(runnerType)

  let sandboxId: string | undefined = existingConfig.runner?.sandboxId
  let runnerUrl: string | undefined = existingConfig.runner?.runnerUrl
  let runnerToken: string | undefined = existingConfig.runner?.runnerToken

  if (runnerType === 'e2b') {
    const e2b = await p.group({
      sandboxId: () =>
        p.text({
          message: 'E2B sandbox ID',
          initialValue: existingConfig.runner?.sandboxId ?? '',
          validate: (v) => (v.length === 0 ? 'Required' : undefined),
        }),
    })
    assertNotCancelled(e2b)
    sandboxId = (e2b as { sandboxId: string }).sandboxId
  } else if (runnerType === 'remote') {
    const remote = await p.group({
      url: () =>
        p.text({
          message: 'Runner URL',
          placeholder: 'https://mac-runner.local:8443',
          initialValue: existingConfig.runner?.runnerUrl ?? '',
        }),
      token: () =>
        p.password({
          message: 'Runner token',
        }),
    })
    assertNotCancelled(remote)
    const remoteResult = remote as { url: string; token: string }
    runnerUrl = remoteResult.url
    runnerToken = remoteResult.token
  }

  const agentType = await p.select({
    message: 'Agent CLI for code generation',
    options: [
      {
        value: 'auto',
        label: 'Auto-detect (recommended)',
        hint: 'uses selected LLM provider first, then Claude > Codex > Gemini',
      },
      { value: 'claude', label: 'Claude Code', hint: 'claude CLI' },
      { value: 'codex', label: 'OpenAI Codex', hint: 'codex CLI' },
      { value: 'gemini', label: 'Gemini CLI', hint: 'gemini CLI' },
      { value: 'api', label: 'API only (no agent)', hint: 'uses current multi-call pipeline' },
    ],
  })
  assertNotCancelled(agentType)

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, {
    ...cfg,
    runner: {
      type: runnerType as DtcConfig['runner']['type'],
      sandboxId,
      runnerUrl,
      runnerToken,
    },
    agent: { type: agentType as import('@appifex/core').AgentConfigType },
  })
}
