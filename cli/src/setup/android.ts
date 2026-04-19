// Phase 03 Plan 03 (SETUP-01, D-09): extracted from setup-wizard.ts monolith.
import * as p from '@clack/prompts'
import { loadConfig, saveConfig } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { assertNotCancelled } from './shared.js'

export async function runAndroidSection(
  configDir: string,
  existingConfig: DtcConfig,
): Promise<void> {
  const wantAndroid = await p.confirm({
    message: 'Configure Google Play Console?',
    initialValue: existingConfig.android != null,
  })
  assertNotCancelled(wantAndroid)

  if (!wantAndroid) return

  const android = await p.group({
    serviceAccountKeyPath: () =>
      p.text({
        message: 'Service account JSON key path',
        placeholder: '~/.config/gcloud/play-console-key.json',
        initialValue: existingConfig.android?.serviceAccountKeyPath ?? '',
      }),
    packageName: () =>
      p.text({
        message: 'Package name (application ID)',
        placeholder: 'com.example.app',
        initialValue: existingConfig.android?.packageName ?? '',
      }),
    keystorePath: () =>
      p.text({
        message: 'Release keystore path (.jks)',
        placeholder: '~/.android/release.keystore',
        initialValue: existingConfig.android?.keystorePath ?? '',
      }),
    keystorePassword: () => p.password({ message: 'Keystore password' }),
    keyAlias: () =>
      p.text({
        message: 'Key alias',
        placeholder: 'release',
        initialValue: existingConfig.android?.keyAlias ?? '',
      }),
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
  assertNotCancelled(android)

  const androidResult = android as {
    serviceAccountKeyPath: string
    packageName: string
    keystorePath: string
    keystorePassword: string
    keyAlias: string
    keyPassword: string
    playTrack: string
  }

  const cfg = await loadConfig(configDir)
  await saveConfig(configDir, {
    ...cfg,
    android: {
      serviceAccountKeyPath: androidResult.serviceAccountKeyPath,
      packageName: androidResult.packageName,
      playTrack: androidResult.playTrack || undefined,
      ...(androidResult.keystorePath
        ? {
            keystorePath: androidResult.keystorePath,
            keystorePassword: androidResult.keystorePassword ?? '',
            keyAlias: androidResult.keyAlias ?? 'release',
            keyPassword: androidResult.keyPassword ?? '',
          }
        : {}),
    },
  })
}
