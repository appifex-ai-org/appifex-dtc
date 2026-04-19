// Phase 03 Plan 03 (SETUP-01, D-06, D-07): Google OAuth auto-provisioned via Firebase; Apple Sign In is opt-in manual paste (D-08 research confirms full automation not viable — defer).
import * as p from '@clack/prompts'
import chalk from 'chalk'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'
import { existsSync } from 'node:fs'

export async function runOauthSection(configDir: string, existingConfig: DtcConfig): Promise<void> {
  p.log.info(chalk.dim('Google Sign In is auto-configured via GoogleService-Info.plist (D-06).'))

  const wantAppleSignIn = await p.confirm({
    message: 'Configure Apple Sign In? (optional — not required for TestFlight)',
    initialValue: existingConfig.oauth?.apple != null,
  })
  assertNotCancelled(wantAppleSignIn)

  if (!wantAppleSignIn) return

  const appleOauth = await p.group({
    servicesId: () =>
      p.text({
        message: 'Apple Services ID (e.g. com.example.app.siwa)',
        initialValue: existingConfig.oauth?.apple?.servicesId ?? '',
        validate: (v) => (v.trim().length === 0 ? 'Services ID is required' : undefined),
      }),
    teamId: () =>
      p.text({
        message: 'Apple Team ID (10 uppercase alphanumeric chars)',
        initialValue: existingConfig.oauth?.apple?.teamId ?? '',
        validate: (v) =>
          /^[A-Z0-9]{10}$/.test(v) ? undefined : 'Must be 10 uppercase alphanumeric characters',
      }),
    keyId: () =>
      p.text({
        message: 'Key ID (10 uppercase alphanumeric chars)',
        initialValue: existingConfig.oauth?.apple?.keyId ?? '',
        validate: (v) =>
          /^[A-Z0-9]{10}$/.test(v) ? undefined : 'Must be 10 uppercase alphanumeric characters',
      }),
    p8Path: () =>
      p.text({
        message: 'Path to .p8 private key file',
        placeholder: '~/Downloads/AuthKey_XXXXXXXXXX.p8',
        initialValue: existingConfig.oauth?.apple?.p8Path ?? '',
        validate: (v) => {
          if (v.trim().length === 0) return 'Path is required'
          if (!existsSync(v)) {
            p.log.warn(
              chalk.yellow(`Warning: .p8 file not found at ${v} — you can update this later.`),
            )
          }
          return undefined
        },
      }),
  })
  assertNotCancelled(appleOauth)

  const appleResult = appleOauth as {
    servicesId: string
    teamId: string
    keyId: string
    p8Path: string
  }

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, {
    ...cfg,
    oauth: {
      apple: {
        servicesId: appleResult.servicesId,
        teamId: appleResult.teamId,
        keyId: appleResult.keyId,
        p8Path: appleResult.p8Path,
      },
    },
  })
}
