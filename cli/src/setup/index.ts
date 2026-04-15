// Phase 03 Plan 03 (SETUP-01, D-09, D-10): sectioned wizard composer.
// Firebase added by Plan 03-04 — inserted between 'runner' and 'oauth'.
// 'project' is FIRST so downstream sections (Firebase D-02, OAuth D-07) can read appName/projectDir.
import { loadConfig, ConfigError } from '@appifex/core'
import type { DtcConfig } from '@appifex/core'
import { runProjectSection } from './project.js'
import { runLlmSection } from './llm.js'
import { runDesignSection } from './design.js'
import { runRunnerSection } from './runner.js'
import { runAppleSection } from './apple.js'
import { runAndroidSection } from './android.js'
import { runDeliverSection } from './deliver.js'
import { runBudgetSection } from './budget.js'
import { runOauthSection } from './oauth.js'

export type SectionName =
  | 'project'
  | 'llm'
  | 'design'
  | 'runner'
  | 'apple'
  | 'android'
  | 'deliver'
  | 'budget'
  | 'oauth'

export const SECTION_ORDER: SectionName[] = [
  'project',
  'llm',
  'design',
  'runner',
  'apple',
  'android',
  'deliver',
  'budget',
  'oauth',
]

export interface SetupWizardOpts {
  only?: SectionName
  /**
   * Force all sections.
   *
   * --full semantics (resolves D-10 checker note): For first-run / fresh installs,
   * `dtc setup` already runs every section, so `--full` is functionally a no-op gate today.
   * The flag is plumbed through `setupWizard(configDir, { full })` so that:
   *   (a) callers / tests can assert intent (`dtc setup --full` from CI scripts), and
   *   (b) when a later phase adds incremental re-run (skip-when-already-configured) it
   *       flips back on by gating on `opts.full`.
   * Section bodies SHOULD read `opts.full` only when they implement skip-when-configured;
   * until then `opts.full` is observed but does not change behavior. No section may
   * silently behave differently based on `opts.full` without a corresponding test.
   */
  full?: boolean
  /** Caller-provided app name; when set, project section skips the appName prompt. */
  appName?: string
  /** Caller-provided project dir; when set, project section skips the projectDir prompt. */
  projectDir?: string
}

export const SECTIONS: Record<
  SectionName,
  (dir: string, cfg: DtcConfig, opts?: SetupWizardOpts) => Promise<void>
> = {
  project: (dir, cfg, opts) =>
    runProjectSection(dir, cfg, { appName: opts?.appName, projectDir: opts?.projectDir }),
  llm: runLlmSection,
  design: runDesignSection,
  runner: runRunnerSection,
  apple: runAppleSection,
  android: runAndroidSection,
  deliver: runDeliverSection,
  budget: runBudgetSection,
  oauth: runOauthSection,
}

/**
 * Runs the setup wizard.
 *
 * When both `opts.appName` and `opts.projectDir` are supplied, the project section
 * skips its prompts (caller-provided values take precedence).
 */
export async function setupWizard(configDir: string, opts: SetupWizardOpts = {}): Promise<void> {
  const cfg = await loadConfig(configDir)

  // When both appName and projectDir are provided, skip the project section entirely
  const hasCallerProject = opts.appName !== undefined && opts.projectDir !== undefined

  if (opts.only) {
    const fn = SECTIONS[opts.only]
    if (!fn) throw new ConfigError(`Unknown section: ${opts.only}`)
    await fn(configDir, cfg, opts)
    return
  }

  for (const name of SECTION_ORDER) {
    // Skip project section when caller has pre-supplied both values
    if (name === 'project' && hasCallerProject) {
      continue
    }
    await SECTIONS[name](configDir, cfg, opts)
  }
}

/** Run a single named section. */
export async function runSection(configDir: string, name: SectionName): Promise<void> {
  return setupWizard(configDir, { only: name })
}
