// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'

export async function runAppleSection(
  configDir: string,
  existingConfig: DtcConfig,
): Promise<void> {
  const wantApple = await p.confirm({
    message: 'Configure Apple TestFlight?',
    initialValue: existingConfig.apple != null,
  })
  assertNotCancelled(wantApple)

  if (!wantApple) return

  const apple = await p.group({
    teamId: () =>
      p.text({
        message: 'Apple Team ID',
        initialValue: existingConfig.apple?.teamId ?? '',
      }),
    bundleId: () =>
      p.text({
        message: 'Bundle ID',
        placeholder: 'com.example.app',
        initialValue: existingConfig.apple?.bundleId ?? '',
      }),
    appId: () =>
      p.text({
        message: 'App Store Connect App ID (numeric)',
        placeholder: '123456789',
        initialValue: existingConfig.apple?.ascAppId ?? '',
      }),
    keyId: () =>
      p.text({
        message: 'App Store Connect Key ID',
        initialValue: existingConfig.apple?.ascKeyId ?? '',
      }),
    issuerId: () =>
      p.text({
        message: 'App Store Connect Issuer ID',
        initialValue: existingConfig.apple?.ascIssuerId ?? '',
      }),
    keyPath: () =>
      p.text({
        message: 'Auth key path (.p8)',
        placeholder: '~/.appstoreconnect/AuthKey.p8',
        initialValue: existingConfig.apple?.ascKeyPath ?? '',
      }),
    testFlightGroup: () =>
      p.text({
        message: 'TestFlight beta group name',
        placeholder: 'Internal Testers',
        initialValue: existingConfig.apple?.ascTestFlightGroup ?? '',
      }),
  })
  assertNotCancelled(apple)

  const appleResult = apple as {
    teamId: string
    bundleId: string
    appId: string
    keyId: string
    issuerId: string
    keyPath: string
    testFlightGroup: string
  }

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, {
    ...cfg,
    apple: {
      teamId: appleResult.teamId,
      bundleId: appleResult.bundleId,
      ascAppId: appleResult.appId || undefined,
      ascKeyId: appleResult.keyId || undefined,
      ascIssuerId: appleResult.issuerId || undefined,
      ascKeyPath: appleResult.keyPath || undefined,
      ascTestFlightGroup: appleResult.testFlightGroup || undefined,
    },
  })
}
