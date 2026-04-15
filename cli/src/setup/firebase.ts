// Phase 03 Plan 04 (SETUP-04, D-01/D-02/D-06): Firebase provisioning via firebase-tools subprocess.
import * as p from '@clack/prompts'
import chalk from 'chalk'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { loadConfig, saveConfig, ConfigError, which } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { derivedSlug, firebaseProjectIdFromSlug, assertNotCancelled } from './shared.js'

export interface FirebaseSectionOpts {
  appName: string
  projectDir: string
}

/**
 * Provisions a Firebase project via the firebase-tools CLI subprocess:
 *   1. Checks firebase-tools is installed (hard-fail if missing).
 *   2. Gates on `firebase login:list`; runs `firebase login --no-localhost` with
 *      stdio: 'inherit' when no logged-in account is detected (Pitfall 6 — no
 *      spinner wrapping so the login URL is visible in the terminal).
 *   3. Creates the Firebase project (`projects:create --json`).
 *   4. Registers an iOS app (`apps:create IOS --json`) — always before sdkconfig
 *      (Pitfall 2 — never rely on positional app resolution).
 *   5. Downloads GoogleService-Info.plist (`apps:sdkconfig IOS`).
 *   6. Saves projectId / iosAppId / iosBundleId / plistPath into DtcConfig.
 *
 * Subprocess errors surface firebase-tools stderr verbatim (Pitfall 1).
 * Shell injection is prevented by always passing argv arrays, never shell: true (T-03-04-01).
 */
export async function runFirebaseSection(
  configDir: string,
  existingConfig: DtcConfig,
  opts: FirebaseSectionOpts,
): Promise<void> {
  const cfg = existingConfig

  // Skip when BaaS provider is configured but is not Firebase.
  if (cfg.baas?.provider && cfg.baas.provider !== 'firebase') {
    p.log.info('BaaS provider is not Firebase — skipping Firebase provisioning.')
    return
  }

  // Hard-fail when firebase-tools CLI is absent.
  if (!which('firebase')) {
    throw new ConfigError(
      'firebase-tools CLI is required. Install: npm install -g firebase-tools (or: curl -sL firebase.tools | bash)',
    )
  }

  // D-02: derive clean slug from app name, not raw prompt.
  const slug = derivedSlug(opts.appName)
  const defaultProjectId = firebaseProjectIdFromSlug(slug)
  // Strip hyphens for the bundle ID segment (com.appifex.mycoffeetracker).
  const defaultBundleId = `com.appifex.${slug.replace(/-/g, '')}`

  const projectId = await p.text({
    message: 'Firebase project ID',
    initialValue: defaultProjectId,
    validate: (v) =>
      /^[a-z][a-z0-9-]{5,29}$/.test(v)
        ? undefined
        : 'Must be lowercase, 6-30 chars, letter-start',
  })
  assertNotCancelled(projectId)

  const bundleId = await p.text({
    message: 'iOS bundle ID',
    initialValue: defaultBundleId,
    validate: (v) =>
      /^[a-z0-9]+(\.[a-z0-9-]+)+$/i.test(v)
        ? undefined
        : 'Reverse-DNS format (e.g. com.company.app)',
  })
  assertNotCancelled(bundleId)

  // ── Login gate (Pitfall 6: no spinner — stdin must reach user's browser) ──
  const loginCheck = spawnSync('firebase', ['login:list'], { encoding: 'utf-8' })
  if (loginCheck.status !== 0 || !loginCheck.stdout.includes('@')) {
    p.log.info('Opening browser for Firebase login…')
    // stdio: 'inherit' so the login URL is printed directly to the user's terminal.
    const loginRes = spawnSync('firebase', ['login', '--no-localhost'], { stdio: 'inherit' })
    if (loginRes.status !== 0) throw new ConfigError('firebase login failed.')
  }

  // ── Project create ──
  const createSpinner = p.spinner()
  createSpinner.start('Creating Firebase project')
  const createRes = spawnSync(
    'firebase',
    ['projects:create', projectId, '--display-name', opts.appName, '--json'],
    { encoding: 'utf-8' },
  )
  if (createRes.status !== 0) {
    createSpinner.stop(chalk.red('Firebase project creation failed'))
    // Pitfall 1: surface firebase-tools stderr verbatim so the user sees messages like
    // "Project ID already exists" without needing to re-run with --debug.
    throw new ConfigError(
      `firebase projects:create: ${createRes.stderr || createRes.stdout}`.trim(),
    )
  }
  createSpinner.stop(chalk.green(`Project ${projectId} created`))

  // ── iOS app register (Pitfall 2: always before sdkconfig) ──
  const appRes = spawnSync(
    'firebase',
    ['apps:create', 'IOS', opts.appName, '--bundle-id', bundleId, '--project', projectId, '--json'],
    { encoding: 'utf-8' },
  )
  if (appRes.status !== 0) {
    throw new ConfigError(
      `firebase apps:create: ${appRes.stderr || appRes.stdout}`.trim(),
    )
  }
  const appPayload = JSON.parse(appRes.stdout) as { result: { appId: string } }
  const appId = appPayload.result.appId

  // ── Download GoogleService-Info.plist ──
  const plistPath = join(opts.projectDir, 'GoogleService-Info.plist')
  const cfgRes = spawnSync(
    'firebase',
    ['apps:sdkconfig', 'IOS', appId, '--project', projectId, '-o', plistPath],
    { encoding: 'utf-8' },
  )
  if (cfgRes.status !== 0) {
    throw new ConfigError(
      `firebase apps:sdkconfig: ${cfgRes.stderr || cfgRes.stdout}`.trim(),
    )
  }

  // ── Persist to DtcConfig ──
  await saveConfig(configDir, {
    ...cfg,
    baas: { ...cfg.baas, provider: 'firebase' },
    firebase: { projectId, iosAppId: appId, iosBundleId: bundleId, plistPath },
  } as DtcConfig)

  // Follow-up note for Phase 4: GoogleService-Info.plist must be added to the
  // generated app's .gitignore (T-03-04-05). That lives in the codegen templates,
  // not here — documented in the plan SUMMARY for Phase 4 to pick up.
  p.log.info(
    chalk.dim(
      'Tip: add GoogleService-Info.plist to your project .gitignore to avoid committing secrets.',
    ),
  )
}
